"""Tamper-evident access ledger and privilege-over-time metrics.

Every event of a run (grants, denials, queries, revocations, verdicts) is appended to a hash chain:

    hash_i = SHA-256(hash_{i-1} || canonical_json(event_i))

When the run ends the chain is sealed into a receipt: the last hash, the entry count and an HMAC over
them. Changing, dropping or reordering any event afterwards changes the root hash, so the receipt no
longer verifies. This gives the analyst (or an auditor) proof of exactly what the agent was allowed
to read, without having to trust the UI.
"""
import hashlib
import hmac
import json
import time

from . import config

GENESIS = "0" * 64


def _canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()


def chain(events: list[dict]) -> list[str]:
    """Hash of every prefix of the event list."""
    hashes, prev = [], GENESIS
    for ev in events:
        prev = hashlib.sha256(prev.encode() + _canon(ev)).hexdigest()
        hashes.append(prev)
    return hashes


def _sign(run_id: str, root: str, n: int, secret: str) -> str:
    return hmac.new(secret.encode(), f"{run_id}|{root}|{n}".encode(), hashlib.sha256).hexdigest()


def seal(run_id: str, events: list[dict], secret: str = config.CAP_SECRET) -> dict:
    hashes = chain(events)
    root = hashes[-1] if hashes else GENESIS
    return {"run_id": run_id, "entries": len(events), "root_hash": root, "algorithm": "SHA-256 chain + HMAC-SHA256",
            "sealed_at": time.time(), "signature": _sign(run_id, root, len(events), secret)}


def verify(events: list[dict], receipt: dict, secret: str = config.CAP_SECRET) -> dict:
    hashes = chain(events)
    root = hashes[-1] if hashes else GENESIS
    checks = {
        "entry_count": len(events) == receipt.get("entries"),
        "root_hash": root == receipt.get("root_hash"),
        "signature": hmac.compare_digest(
            _sign(receipt.get("run_id", ""), receipt.get("root_hash", ""), receipt.get("entries", -1), secret),
            receipt.get("signature", "")),
    }
    return {"valid": all(checks.values()), "checks": checks, "recomputed_root": root}


def privilege_timeline(events: list[dict], total_columns: int, sensitive: set[str]) -> dict:
    """How many columns were open to the agent at each moment, from the grant and revoke events.

    column_seconds is the area under that curve: the standing privilege the run actually held.
    """
    if not events:
        return {"column_seconds": 0.0, "sensitive_column_seconds": 0.0, "peak_columns": 0, "curve": [], "grants": []}
    t0 = events[0]["t"]
    end = events[-1]["t"]
    open_caps: dict[str, dict] = {}
    grants, points = [], []

    def level():
        cols: set[str] = set()
        everything = False
        for c in open_caps.values():
            everything = everything or "*" in c["resources"]
            cols |= set(c["resources"])
        n = total_columns if everything else len(cols)
        s = len(sensitive) if everything else len(cols & sensitive)
        return n, s

    for ev in events:
        if ev["kind"] == "cap_granted":
            open_caps[ev["cap_id"]] = {"resources": ev["resources"], "t": ev["t"], "hypothesis": ev["hypothesis"]}
        elif ev["kind"] == "cap_revoked" and ev.get("cap_id") in open_caps:
            c = open_caps.pop(ev["cap_id"])
            grants.append({"hypothesis": c["hypothesis"], "start": round(c["t"] - t0, 3), "end": round(ev["t"] - t0, 3),
                           "columns": total_columns if "*" in c["resources"] else len(c["resources"])})
        else:
            continue
        n, s = level()
        points.append({"t": round(ev["t"] - t0, 3), "columns": n, "sensitive": s})
    for c in open_caps.values():  # anything still open is closed when the run ends
        grants.append({"hypothesis": c["hypothesis"], "start": round(c["t"] - t0, 3), "end": round(end - t0, 3),
                       "columns": total_columns if "*" in c["resources"] else len(c["resources"])})

    col_s = sens_s = 0.0
    for a, b in zip(points, points[1:] + [{"t": round(end - t0, 3)}]):
        col_s += a["columns"] * (b["t"] - a["t"])
        sens_s += a["sensitive"] * (b["t"] - a["t"])
    curve = [{"t": 0.0, "columns": 0, "sensitive": 0}] + points + [{"t": round(end - t0, 3), "columns": 0, "sensitive": 0}]
    return {"column_seconds": round(col_s, 2), "sensitive_column_seconds": round(sens_s, 2),
            "peak_columns": max((p["columns"] for p in points), default=0),
            "duration_s": round(end - t0, 2), "curve": curve, "grants": grants}
