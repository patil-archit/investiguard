"""Hypothesis-scoped, time-bound capability tokens (novelty N1).

A capability is <hypothesis, resources, op, purpose, t0, ttl, mode>. Tokens are HMAC-signed JWTs;
the store tracks issue/revocation so a token can be killed before it expires.
In-memory for the MVP; swap for Redis (SET with EX) without changing the interface.
"""
import time
import uuid
from dataclasses import dataclass, field

import jwt

from . import config


@dataclass
class Capability:
    cap_id: str
    hypothesis_id: str
    resources: dict[str, str]  # "table.column" -> mode ("clear" | "aggregate_only")
    op: str
    purpose: str
    issued_at: float
    ttl_s: int
    token: str
    revoked_at: float | None = None
    revoke_reason: str | None = None

    @property
    def expires_at(self) -> float:
        return self.issued_at + self.ttl_s

    def active(self, now: float | None = None) -> bool:
        return self.revoked_at is None and (now or time.time()) < self.expires_at


class CapabilityError(Exception):
    pass


@dataclass
class CapabilityStore:
    secret: str = config.CAP_SECRET
    caps: dict[str, Capability] = field(default_factory=dict)

    def mint(self, hypothesis_id: str, resources: dict[str, str], op: str, purpose: str, ttl_s: int) -> Capability:
        cap_id = uuid.uuid4().hex[:12]
        now = time.time()
        token = jwt.encode(
            {"cap": cap_id, "hyp": hypothesis_id, "res": resources, "op": op, "iat": int(now), "exp": int(now + ttl_s)},
            self.secret,
            algorithm="HS256",
        )
        cap = Capability(cap_id, hypothesis_id, resources, op, purpose, now, ttl_s, token)
        self.caps[cap_id] = cap
        return cap

    def verify(self, token: str, hypothesis_id: str) -> Capability:
        try:
            claims = jwt.decode(token, self.secret, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise CapabilityError("capability expired")
        except jwt.InvalidTokenError as e:
            raise CapabilityError(f"invalid capability token ({e})")
        cap = self.caps.get(claims["cap"])
        if cap is None:
            raise CapabilityError("unknown capability")
        if cap.revoked_at is not None:
            raise CapabilityError(f"capability revoked ({cap.revoke_reason})")
        if not cap.active():
            raise CapabilityError("capability expired")
        if claims["hyp"] != hypothesis_id or cap.hypothesis_id != hypothesis_id:
            raise CapabilityError("capability belongs to a different hypothesis")
        if claims["res"] != cap.resources:
            raise CapabilityError("token resources do not match issued capability")
        return cap

    def revoke(self, cap_id: str, reason: str) -> None:
        cap = self.caps.get(cap_id)
        if cap and cap.revoked_at is None:
            cap.revoked_at = time.time()
            cap.revoke_reason = reason

    def revoke_all(self, reason: str = "investigation finished") -> None:
        for cap_id in list(self.caps):
            self.revoke(cap_id, reason)

    def active_caps(self) -> list[Capability]:
        return [c for c in self.caps.values() if c.active()]
