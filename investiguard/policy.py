"""Deterministic policy engine. No LLM participates in any decision here.

InvestiGuardPolicy implements checks P1-P5 from the synopsis (section 5.3b).
AllowAllPolicy is the unrestricted baseline (System A).
"""
from dataclasses import dataclass, field
from typing import Literal, Protocol

from pydantic import BaseModel

from . import config
from .catalog import Catalog

Op = Literal["READ_ROWS", "READ_AGGREGATE"]
Mode = Literal["clear", "aggregate_only"]


class CapabilityRequest(BaseModel):
    hypothesis_id: str
    resources: list[str]
    op: str = "READ_ROWS"
    purpose: str
    ttl_s: int = config.CAP_TTL_DEFAULT_S


class PolicyDecision(BaseModel):
    allow: bool
    failed_check: str | None = None
    reason: str
    modes: dict[str, Mode] = {}


@dataclass
class PolicyContext:
    declared: dict[str, list[str]]           # hypothesis_id -> resources declared at creation
    supported_tables: set[str]               # tables used by SUPPORTED hypotheses so far
    has_supported_finding: bool
    active_caps: int
    sensitive_columns_granted: set[str] = field(default_factory=set)
    evidence_gate: bool = True               # P4 applies to autonomous investigations, not manual questions


class PolicyEngine(Protocol):
    name: str

    def decide(self, req: CapabilityRequest, ctx: PolicyContext) -> PolicyDecision: ...


class AllowAllPolicy:
    name = "A: unrestricted"

    def __init__(self, catalog: Catalog):
        self.catalog = catalog

    def decide(self, req, ctx):
        return PolicyDecision(allow=True, reason="unrestricted baseline",
                              modes={r: "clear" for r in self.catalog.all_columns()})


class InvestiGuardPolicy:
    name = "C: InvestiGuard"

    def __init__(self, catalog: Catalog):
        self.catalog = catalog

    def decide(self, req: CapabilityRequest, ctx: PolicyContext) -> PolicyDecision:
        def deny(check, reason):
            return PolicyDecision(allow=False, failed_check=check, reason=reason)

        unknown = [r for r in req.resources if not self.catalog.has(r)]
        if unknown:
            return deny("P3", f"unknown resources {unknown}")

        # P1 operation: read-only operations only
        if req.op not in ("READ_ROWS", "READ_AGGREGATE"):
            return deny("P1", f"operation {req.op} is never permitted")

        # P2 sensitivity ceiling for root-cause analysis: internal=clear, confidential=aggregate-only, restricted=deny
        modes: dict[str, Mode] = {}
        for r in req.resources:
            s = self.catalog.sensitivity(r)
            if s == "restricted":
                return deny("P2", f"{r} is restricted and never granted")
            modes[r] = "aggregate_only" if s == "confidential" else "clear"

        # P3 declaration: no scope creep beyond what the hypothesis declared when created
        declared = set(ctx.declared.get(req.hypothesis_id, []))
        creep = sorted(set(req.resources) - declared)
        if creep:
            return deny("P3", f"resources not declared by hypothesis: {creep}")

        # P4 evidence gate
        for table in sorted({r.split(".")[0] for r in req.resources}) if ctx.evidence_gate else []:
            need = self.catalog.tables[table].requires_finding
            if need is None:
                continue
            if need == "any" and not ctx.has_supported_finding:
                return deny("P4", f"{table} requires a confirmed finding first; none supported yet")
            if isinstance(need, list) and not (set(need) & ctx.supported_tables):
                return deny("P4", f"{table} requires a confirmed finding on one of {need}")

        # P5 budgets
        if req.ttl_s > config.CAP_TTL_MAX_S:
            return deny("P5", f"ttl {req.ttl_s}s exceeds max {config.CAP_TTL_MAX_S}s")
        if ctx.active_caps >= config.K_MAX_ACTIVE_CAPS:
            return deny("P5", f"{ctx.active_caps} capabilities already active (k_max={config.K_MAX_ACTIVE_CAPS})")
        sensitive = {r for r, m in modes.items() if m != "clear"}
        if len(ctx.sensitive_columns_granted | sensitive) > config.SENSITIVE_COLUMN_BUDGET:
            return deny("P5", "cumulative sensitive-column budget exceeded")

        return PolicyDecision(allow=True, reason="P1-P5 passed", modes=modes)
