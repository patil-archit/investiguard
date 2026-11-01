"""Hypothesis-scoped investigation agent as a LangGraph state machine.

LLM nodes (untrusted): understand, hypothesize, write_query, interpret, report.
Deterministic nodes (trusted): plan, request_capability, execute, revoke.
Every routing decision is a plain function of state; the LLM never routes or grants.
"""
import operator
import time
from dataclasses import dataclass, field
from typing import Annotated, Any, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from .. import config
from ..capabilities import CapabilityStore
from ..catalog import SENSITIVITY_WEIGHT, Catalog
from ..gateway import Gateway, GatewayDenied
from ..llm import LLM
from ..policy import AllowAllPolicy, CapabilityRequest, InvestiGuardPolicy, PolicyContext
from . import evidence, prompts
from . import evidence as evidence_mod
from .schemas import Hypotheses, Interpretation, Objective, ProposedHypothesis, QueryPlan, Report

TERMINAL = {"SUPPORTED", "REJECTED", "INCONCLUSIVE"}
_PERIOD_HINTS = ("date", "time", "_at", "_ts", "year", "month", "period", "fy")


def _is_period(resource: str, typ: str = "") -> bool:
    col = resource.split(".")[-1]
    return any(h in col for h in _PERIOD_HINTS) or typ.upper() in ("DATE", "DATETIME", "TIMESTAMP")


class InvState(TypedDict, total=False):
    problem: str
    objective: dict
    hypotheses: dict[str, dict]
    current: str | None
    cap_id: str | None
    sql: str | None
    sql_error: str | None
    attempts: int
    result_csv: str | None
    last_query: dict | None
    stats: dict | None
    iteration: int
    done_reason: str | None
    evidence: Annotated[list[dict], operator.add]
    events: Annotated[list[dict], operator.add]
    report: dict


@dataclass
class Runtime:
    catalog: Catalog
    llm: LLM
    mode: str = "C"                      # "A" unrestricted baseline, "C" InvestiGuard
    url: str = config.DATABASE_URL
    currency: str = "INR"
    store: CapabilityStore = field(default_factory=CapabilityStore)
    gateway: Gateway | None = None

    def __post_init__(self):
        self.policy = AllowAllPolicy(self.catalog) if self.mode == "A" else InvestiGuardPolicy(self.catalog)
        self.gateway = self.gateway or Gateway(self.catalog, self.store, self.url)


def _event(kind: str, **data) -> dict:
    ev = {"t": time.time(), "kind": kind, **data}
    try:
        get_stream_writer()(ev)
    except Exception:
        pass  # not running under graph.stream
    return ev


def build_graph(rt: Runtime):
    cat = rt.catalog

    def clean_resources(resources: list[str]) -> list[str]:
        out = []
        for r in resources:
            r = cat.resolve(r)
            if r and r not in out:
                out.append(r)
        return out

    def add_hypotheses(existing: dict, proposed: list[ProposedHypothesis], parent: str | None,
                       metric_cols: list[str]) -> tuple[dict, list]:
        hyps, events = dict(existing), []
        for p in proposed:
            if len(hyps) >= 12:
                break
            driver = clean_resources(p.resources)
            if not driver:
                continue
            # Every test needs the metric itself; declare those columns alongside the driver columns,
            # plus the join keys between any two tables involved (found from the schema, not the LLM).
            res = clean_resources(metric_cols + driver)
            res += [k for k in cat.join_keys({r.split(".")[0] for r in res}) if k not in res]
            if parent and set(res) <= set(existing[parent]["resources"]):
                continue  # a follow-up must look at something the parent did not
            if any(h["statement"].strip().lower() == p.statement.strip().lower() for h in hyps.values()):
                continue
            hid = f"H{len(hyps) + 1}"
            hyps[hid] = {
                "id": hid, "statement": p.statement, "driver": p.driver, "kind": p.kind, "resources": res,
                "plausibility": min(max(p.plausibility, 0), 1), "info_gain": min(max(p.info_gain, 0), 1),
                "privilege_cost": sum(SENSITIVITY_WEIGHT[cat.sensitivity(r)] for r in res),
                "status": "PROPOSED", "parent": parent, "blocked_reason": None, "gate_retried": False,
                "finding": None, "confidence": None, "explained_share": 0.0, "evidence_id": None,
            }
            hyps[hid]["priority"] = round(
                hyps[hid]["plausibility"] * hyps[hid]["info_gain"]
                / (1 + config.PLANNER_LAMBDA * hyps[hid]["privilege_cost"]), 4)
            events.append(_event("hypothesis_proposed", hypothesis=dict(hyps[hid])))
        return hyps, events

    # ---------------- LLM nodes ----------------
    def understand(state: InvState):
        obj = rt.llm.ask(Objective, prompts.SYSTEM, prompts.understand(state["problem"], cat.describe())).model_dump()
        cols = clean_resources(obj["metric_columns"])
        # Every comparison needs a period column; add one from the metric's table if the LLM left it out.
        if not any(_is_period(c) for c in cols):
            tables = {c.split(".")[0] for c in cols} or set(cat.tables)
            period = next((f"{t}.{c}" for t in tables for c, m in cat.tables[t].columns.items()
                           if _is_period(f"{t}.{c}", m.get("type", ""))), None)
            cols += [period] if period else []
        obj["metric_columns"] = cols
        return {"objective": obj, "iteration": 0, "events": [_event("objective", objective=obj)]}

    def hypothesize(state: InvState):
        out = rt.llm.ask(Hypotheses, prompts.SYSTEM,
                         prompts.hypothesize(state["problem"], state["objective"], cat.describe()))
        hyps, events = add_hypotheses({}, out.hypotheses[:8], None, state["objective"]["metric_columns"])
        return {"hypotheses": hyps, "events": events}

    def write_query(state: InvState):
        h = state["hypotheses"][state["current"]]
        cap = rt.store.caps[state["cap_id"]]
        visible = cat.describe() if rt.mode == "A" else cat.describe(list(cap.resources))
        agg_only = [r for r, m in cap.resources.items() if m == "aggregate_only" and r in h["resources"]]
        plan = rt.llm.ask(QueryPlan, prompts.SYSTEM, prompts.write_query(
            state["objective"], h, visible, agg_only, rt.gateway.dialect, state.get("sql_error"), state.get("sql")))
        return {"sql": plan.sql, "events": [_event("query_written", hypothesis=h["id"], sql=plan.sql,
                                                    rationale=plan.rationale)]}

    def interpret(state: InvState):
        hyps = dict(state["hypotheses"])
        h = dict(hyps[state["current"]])
        stats = state.get("stats")
        out = rt.llm.ask(Interpretation, prompts.SYSTEM,
                         prompts.interpret(state["objective"], h, state["sql"], state["result_csv"], stats))
        if stats:  # decomposition: verdict and explained share come from deterministic code
            verdict, share = stats["verdict"], stats["explained_share"]
            finding = f"{out.finding} [evidence engine: {stats['reason']}]"
        else:      # event lookup: LLM-judged, corroborating only, never counts toward the stop rule
            verdict, share = out.verdict, 0.0
            finding = f"{out.finding} [event evidence, LLM-judged]"
        eid = f"E{len(state.get('evidence', [])) + 1}"
        q = state["last_query"]
        ev = {"id": eid, "hypothesis": h["id"], "cap_id": state["cap_id"], "sql": q["sql"],
              "columns": q["columns_used"], "rows": q["rows"], "verdict": verdict,
              "explained_share": share, "stats": stats, "finding": finding}
        h.update(status=verdict, finding=finding, evidence_id=eid,
                 explained_share=share if verdict == "SUPPORTED" else 0.0)
        hyps[h["id"]] = h
        events = [_event("evidence", evidence=ev), _event("hypothesis_status", hypothesis=dict(h))]
        if out.follow_ups and verdict == "SUPPORTED":
            hyps, more = add_hypotheses(hyps, out.follow_ups[:2], h["id"], state["objective"]["metric_columns"])
            events += more
        return {"hypotheses": hyps, "evidence": [ev], "events": events}

    def report(state: InvState):
        rt.store.revoke_all("investigation finished")
        evidence = state.get("evidence", [])
        facts = evidence_mod.plain_facts(evidence, state["hypotheses"], rt.currency)
        rep = rt.llm.ask(Report, prompts.SYSTEM, prompts.report(
            state["problem"], state["objective"], list(state["hypotheses"].values()), evidence, facts))
        valid_ids = {e["id"] for e in evidence}
        claims = [c.model_dump() for c in rep.claims if c.evidence_ids and set(c.evidence_ids) <= valid_ids]
        dropped = len(rep.claims) - len(claims)
        out = rep.model_dump() | {"claims": claims, "unsupported_claims_dropped": dropped, "key_facts": facts,
                                  "done_reason": state.get("done_reason"), "exposure": exposure(rt)}
        return {"report": out, "events": [_event("report", report=out)]}

    def not_investigation(state: InvState):
        msg = ("This looks like a direct question rather than a 'why did this number change?' problem, so no "
               "investigation was run. Ask it in the 'Ask your data' tab, which answers it with a single checked query.")
        out = {"root_cause": "not investigated: direct question", "plain_summary": msg, "summary": msg,
               "claims": [], "limitations": "", "key_facts": [], "unsupported_claims_dropped": 0,
               "not_investigation": True, "done_reason": "question is a lookup, not a change investigation",
               "exposure": exposure(rt)}
        return {"hypotheses": {}, "report": out, "events": [_event("stop", reason=out["done_reason"], explained=0.0),
                                                            _event("report", report=out)]}

    # ---------------- deterministic nodes ----------------
    def plan(state: InvState):
        hyps = state["hypotheses"]
        supported = [h for h in hyps.values() if h["status"] == "SUPPORTED"]
        # Largest single share, not a sum: hypotheses often overlap (e.g. category 'fuel' and group 'Fuel'
        # are the same rows), and summing them would double-count.
        explained = max((h["explained_share"] for h in supported), default=0.0)
        it = state.get("iteration", 0) + 1
        candidates = [h for h in hyps.values() if h["status"] == "PROPOSED"
                      or (h["status"] == "BLOCKED" and h["blocked_reason"] == "P4"
                          and supported and not h["gate_retried"])]
        supported_ids = {h["id"] for h in supported}
        # Once the change is explained, keep only drill-downs: follow-ups of supported findings and
        # hypotheses the evidence gate has just unblocked (the "why" behind the proximate cause).
        drill = [h for h in candidates if h["parent"] in supported_ids or h["status"] == "BLOCKED"]
        reason = None
        if explained >= config.STOP_EXPLAINED_SHARE and not drill:
            reason = f"the strongest supported driver explains {explained:.0%} of the change"
        elif it > config.MAX_ITERATIONS:
            reason = "iteration budget exhausted"
        elif not candidates:
            reason = "no untested hypotheses left"
        if reason:
            return {"current": None, "done_reason": reason, "iteration": it,
                    "events": [_event("stop", reason=reason, explained=explained)]}
        if explained >= config.STOP_EXPLAINED_SHARE:
            candidates = drill
        nxt = max(candidates, key=lambda h: h["priority"])
        return {"current": nxt["id"], "iteration": it, "sql": None, "sql_error": None, "attempts": 0, "stats": None,
                "events": [_event("plan", hypothesis=nxt["id"], priority=nxt["priority"],
                                  ranking=[(h["id"], h["priority"]) for h in sorted(
                                      candidates, key=lambda h: -h["priority"])])]}

    def request_capability(state: InvState):
        hyps = dict(state["hypotheses"])
        h = dict(hyps[state["current"]])
        if h["status"] == "BLOCKED":
            h["gate_retried"] = True
        supported = [x for x in hyps.values() if x["status"] == "SUPPORTED"]
        granted_sensitive = {r for c in rt.store.caps.values() for r, m in c.resources.items() if m != "clear"}
        ctx = PolicyContext(
            declared={x["id"]: x["resources"] for x in hyps.values()},
            supported_tables={r.split(".")[0] for x in supported for r in x["resources"]},
            has_supported_finding=bool(supported),
            active_caps=len(rt.store.active_caps()),
            sensitive_columns_granted=granted_sensitive,
        )
        req = CapabilityRequest(hypothesis_id=h["id"], resources=h["resources"],
                                purpose=f"root-cause analysis: {h['statement']}")
        t0 = time.perf_counter()
        d = rt.policy.decide(req, ctx)
        ms = (time.perf_counter() - t0) * 1000
        if not d.allow:
            h.update(status="BLOCKED", blocked_reason=d.failed_check)
            hyps[h["id"]] = h
            return {"hypotheses": hyps, "cap_id": None, "events": [
                _event("policy_denied", hypothesis=h["id"], check=d.failed_check, reason=d.reason,
                       resources=h["resources"], latency_ms=ms)]}
        cap = rt.store.mint(h["id"], d.modes, req.op, req.purpose, req.ttl_s)
        h.update(status="TESTING", blocked_reason=None)
        hyps[h["id"]] = h
        return {"hypotheses": hyps, "cap_id": cap.cap_id, "events": [
            _event("cap_granted", hypothesis=h["id"], cap_id=cap.cap_id, ttl_s=cap.ttl_s, latency_ms=ms,
                   resources={r: m for r, m in cap.resources.items() if r in h["resources"]} if rt.mode == "C"
                   else {"*": "clear"})]}

    def execute(state: InvState):
        cap = rt.store.caps[state["cap_id"]]
        attempts = state.get("attempts", 0) + 1
        try:
            df, rec = rt.gateway.execute(state["sql"], cap.token, state["current"])
        except GatewayDenied as e:
            return {"attempts": attempts, "sql_error": f"GATEWAY DENIED: {e.reason}", "result_csv": None,
                    "events": [_event("gateway_denied", hypothesis=state["current"], sql=state["sql"],
                                      reason=e.reason)]}
        except Exception as e:
            msg = str(e).splitlines()[0][:300]
            return {"attempts": attempts, "sql_error": f"SQL ERROR: {msg}", "result_csv": None,
                    "events": [_event("sql_error", hypothesis=state["current"], error=msg)]}
        stats = None
        if state["hypotheses"][state["current"]].get("kind", "decomposition") == "decomposition":
            norm, shape_error = evidence.normalise(df)
            if shape_error:
                return {"attempts": attempts, "sql_error": f"RESULT SHAPE: {shape_error}", "result_csv": None,
                        "events": [_event("sql_error", hypothesis=state["current"], error=shape_error)]}
            stats = evidence.score(norm)
            df = norm
        csv = df.head(60).to_csv(index=False)
        q = {"sql": rec.rewritten_sql, "columns_used": rec.columns_used, "rows": rec.rows}
        return {"attempts": attempts, "sql_error": None, "result_csv": csv, "last_query": q, "stats": stats,
                "events": [_event("query_ok", hypothesis=state["current"], columns=rec.columns_used,
                                  rows=rec.rows, latency_ms=rec.latency_ms, preview=df.head(8).to_dict("records"))]}

    def give_up(state: InvState):
        hyps = dict(state["hypotheses"])
        h = dict(hyps[state["current"]], status="INCONCLUSIVE",
                 finding=f"Could not obtain a valid query: {state.get('sql_error')}")
        hyps[h["id"]] = h
        return {"hypotheses": hyps, "events": [_event("hypothesis_status", hypothesis=h)]}

    def revoke(state: InvState):
        status = state["hypotheses"][state["current"]]["status"]
        rt.store.revoke(state["cap_id"], f"hypothesis {status}")
        return {"cap_id": None, "events": [_event("cap_revoked", hypothesis=state["current"],
                                                   cap_id=state["cap_id"], reason=status)]}

    # ---------------- routing ----------------
    def after_understand(state):
        return "hypothesize" if state["objective"]["question_type"] == "change_investigation" else "not_investigation"

    def after_plan(state):
        return "report" if state.get("current") is None else "request_capability"

    def after_request(state):
        return "write_query" if state.get("cap_id") else "plan"

    def after_execute(state):
        if state.get("sql_error") is None:
            return "interpret"
        return "write_query" if state["attempts"] < config.MAX_QUERY_ATTEMPTS else "give_up"

    g = StateGraph(InvState)
    for name, fn in [("understand", understand), ("hypothesize", hypothesize), ("plan", plan),
                     ("request_capability", request_capability), ("write_query", write_query),
                     ("execute", execute), ("interpret", interpret), ("give_up", give_up), ("not_investigation", not_investigation),
                     ("revoke", revoke), ("report", report)]:
        g.add_node(name, fn)
    g.add_edge(START, "understand")
    g.add_conditional_edges("understand", after_understand, ["hypothesize", "not_investigation"])
    g.add_edge("hypothesize", "plan")
    g.add_conditional_edges("plan", after_plan, ["report", "request_capability"])
    g.add_conditional_edges("request_capability", after_request, ["write_query", "plan"])
    g.add_edge("write_query", "execute")
    g.add_conditional_edges("execute", after_execute, ["interpret", "write_query", "give_up"])
    g.add_edge("interpret", "revoke")
    g.add_edge("give_up", "revoke")
    g.add_edge("revoke", "plan")
    g.add_edge("report", END)
    g.add_edge("not_investigation", END)
    return g.compile()


def exposure(rt: Runtime) -> dict[str, Any]:
    """Privilege-utility metrics (synopsis section 7) from the gateway log."""
    allowed = [q for q in rt.gateway.log if q.verdict == "allowed"]
    touched = sorted({c for q in allowed for c in q.columns_used})
    total = len(rt.catalog.all_columns())
    sensitive_raw = sorted(c for c in touched if rt.catalog.sensitivity(c) in ("confidential", "restricted")
                           and any(c in q.columns_used and rt.store.caps and
                                   _mode_for(rt, q, c) == "clear" for q in allowed))
    lat = [q.latency_ms for q in rt.gateway.log]
    return {
        "columns_touched": touched,
        "columns_total": total,
        "data_exposure_ratio": round(len(touched) / total, 3) if total else 0,
        "sensitive_exposed_raw": sensitive_raw,
        "queries_allowed": len(allowed),
        "queries_denied": sum(q.verdict == "denied" for q in rt.gateway.log),
        "gateway_p50_ms": round(sorted(lat)[len(lat) // 2], 2) if lat else None,
        "capabilities_issued": len(rt.store.caps),
    }


def _mode_for(rt: Runtime, q, column: str) -> str:
    for cap in rt.store.caps.values():
        if cap.hypothesis_id == q.hypothesis_id and column in cap.resources:
            return cap.resources[column]
    return "clear"


def run(problem: str, rt: Runtime, on_event=None) -> dict:
    graph = build_graph(rt)
    final = None
    for mode, chunk in graph.stream({"problem": problem}, stream_mode=["custom", "values"],
                                    config={"recursion_limit": 200}):
        if mode == "custom" and on_event:
            on_event(chunk)
        elif mode == "values":
            final = chunk
    return final
