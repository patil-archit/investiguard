"""Hypothesis-scoped investigation agent as a LangGraph state machine.

LLM nodes (untrusted): understand, hypothesize, write_query, interpret, report.
Deterministic nodes (trusted): plan, request_capability, execute, revoke.
Every routing decision is a plain function of state; the LLM never routes or grants.
"""
import operator
import time
from dataclasses import dataclass, field
from typing import Annotated, Any, Callable, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from .. import config, firewall
from ..capabilities import CapabilityStore
from ..catalog import SENSITIVITY_WEIGHT, Catalog
from ..gateway import Gateway, GatewayDenied
from ..llm import LLM
from ..policy import AllowAllPolicy, CapabilityRequest, InvestiGuardPolicy, PolicyContext
from . import evidence, prompts
from . import evidence as evidence_mod
from .schemas import Hypotheses, Interpretation, Objective, ProposedHypothesis, QueryPlan, Report

TERMINAL = {"SUPPORTED", "REJECTED", "INCONCLUSIVE"}
_NOT_A_DIMENSION = ("id", "_id", "name", "email", "phone", "description", "desc", "comment", "message", "note",
                    "reason", "address", "text", "body", "title", "url", "_no", "number", "code")
SWEEP_MAX = 4
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
    # Step-up approval: called with a P4/P5 denial; returns True if the analyst approves it. None = never ask.
    approver: Callable[[dict], bool] | None = None
    firewall_hits: list[dict] = field(default_factory=list)
    totals: list[tuple[float, float]] = field(default_factory=list)  # ALL rows of accepted decompositions

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
            if len(hyps) >= 16:
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

    def auto_drills(hyps: dict, parent: dict, stats: dict, sql: str, objective: dict) -> tuple[dict, list]:
        """Code-generated drill-downs on a supported segment: when did it start, and is it price or volume?

        They reuse the parent's columns (plus the quantity column), so they cost no extra privilege class,
        and their verdicts come from the evidence engine like any decomposition.
        """
        hyps, events = dict(hyps), []
        focus = stats["top_segment"]
        wanted = [("timeline", f"When did '{focus}' start to change, and did anything else move at that time?", [])]
        if objective.get("quantity_column"):
            wanted.append(("price_volume", f"Is the change in '{focus}' due to quantity or to price per unit?",
                           [objective["quantity_column"]]))
        for kind, statement, extra in wanted:
            if len(hyps) >= 14 or any(h.get("kind") == kind and h.get("focus") == focus for h in hyps.values()):
                continue
            res = clean_resources(parent["resources"] + extra)
            hid = f"H{len(hyps) + 1}"
            cost = sum(SENSITIVITY_WEIGHT[cat.sensitivity(r)] for r in res)
            hyps[hid] = {
                "id": hid, "statement": statement, "driver": f"{focus}: {kind.replace('_', ' vs ')}", "kind": kind,
                "resources": res, "plausibility": 0.9, "info_gain": 0.6, "privilege_cost": cost,
                "status": "PROPOSED", "parent": parent["id"], "blocked_reason": None, "gate_retried": False,
                "finding": None, "confidence": None, "explained_share": 0.0, "evidence_id": None,
                "focus": focus, "parent_sql": sql, "auto": True,
                "priority": round(0.9 * 0.6 / (1 + config.PLANNER_LAMBDA * cost), 4),
            }
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
        obj["quantity_column"] = cat.resolve(obj.get("quantity_column") or "") or ""
        return {"objective": obj, "iteration": 0, "events": [_event("objective", objective=obj)]}

    def dimension_sweep(hyps: dict, metric_cols: list[str]) -> tuple[dict, list]:
        """Coverage guarantee: every non-sensitive categorical column of the metric's table, or of a table that
        joins to it, gets a cheap decomposition test, even if the LLM never thought of it. These start with
        low plausibility, so the planner still tries the LLM's own ideas first."""
        metric_tables = {c.split(".")[0] for c in metric_cols}
        reachable = set(metric_tables)
        for t in cat.tables:
            if t not in reachable and cat.join_keys(metric_tables | {t}):
                reachable.add(t)
        covered = {r for h in hyps.values() for r in h["resources"]} | set(metric_cols)
        per_table: dict[str, list[str]] = {}
        for t in sorted(reachable, key=lambda t: (t not in metric_tables, t)):
            for c, meta in cat.tables[t].columns.items():
                ref = f"{t}.{c}"
                typ = str(meta.get("type", "")).upper()
                if ref in covered or cat.sensitivity(ref) not in ("public", "internal") or _is_period(ref, typ):
                    continue
                if not any(k in typ for k in ("TEXT", "CHAR", "STRING", "VARCHAR")) or any(k in c for k in _NOT_A_DIMENSION):
                    continue
                per_table.setdefault(t, []).append(ref)
        # Round-robin across tables, so a wide fact table cannot use up the sweep before a joined table is seen.
        lists = list(per_table.values())
        candidates = [lst[i] for i in range(max(map(len, lists), default=0)) for lst in lists if i < len(lst)]
        proposals = [ProposedHypothesis(
            statement=f"The change is concentrated in one value of {ref.split('.')[1].replace('_', ' ')} ({ref.split('.')[0]})",
            driver=ref.split(".")[1], kind="decomposition", resources=[ref], plausibility=0.3, info_gain=0.5)
            for ref in candidates[:SWEEP_MAX]]
        before = set(hyps)
        hyps, events = add_hypotheses(hyps, proposals, None, metric_cols)
        for hid in set(hyps) - before:
            hyps[hid]["sweep"] = True
        return hyps, events

    def hypothesize(state: InvState):
        out = rt.llm.ask(Hypotheses, prompts.SYSTEM,
                         prompts.hypothesize(state["problem"], state["objective"], cat.describe()))
        hyps, events = add_hypotheses({}, out.hypotheses[:8], None, state["objective"]["metric_columns"])
        hyps, more = dimension_sweep(hyps, state["objective"]["metric_columns"])
        return {"hypotheses": hyps, "events": events + more}

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
        if stats:  # decomposition and drill-downs: verdict and explained share come from deterministic code
            verdict, share = stats["verdict"], stats["explained_share"]
            finding = f"{out.finding} [evidence engine: {stats['reason']}]"
            h["confidence"] = stats.get("confidence")
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
        if verdict == "SUPPORTED" and stats and stats.get("kind") == "decomposition" and not h.get("auto"):
            hyps, more = auto_drills(hyps, h, stats, q["sql"], state["objective"])
            events += more
        if out.follow_ups and verdict == "SUPPORTED" and h.get("kind") in ("decomposition", "event"):
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
        approved = False
        if not d.allow and d.failed_check in ("P4", "P5") and rt.approver:
            # Step-up: the evidence gate and budgets may be waived by the analyst, never by the agent.
            ask = {"hypothesis": h["id"], "statement": h["statement"], "check": d.failed_check,
                   "reason": d.reason, "resources": h["resources"]}
            events_pre = [_event("approval_requested", **ask)]
            approved = bool(rt.approver(ask))
            events_pre.append(_event("approval_decided", hypothesis=h["id"], approved=approved))
            if approved:
                d = rt.policy.decide(req, ctx, waive=frozenset({"P4", "P5"}))
                req = req.model_copy(update={"ttl_s": min(req.ttl_s, 120)})
        else:
            events_pre = []
        if not d.allow:
            h.update(status="BLOCKED", blocked_reason=d.failed_check)
            hyps[h["id"]] = h
            return {"hypotheses": hyps, "cap_id": None, "events": events_pre + [
                _event("policy_denied", hypothesis=h["id"], check=d.failed_check, reason=d.reason,
                       resources=h["resources"], latency_ms=ms)]}
        cap = rt.store.mint(h["id"], d.modes, req.op, req.purpose, req.ttl_s)
        h.update(status="TESTING", blocked_reason=None)
        hyps[h["id"]] = h
        return {"hypotheses": hyps, "cap_id": cap.cap_id, "events": events_pre + [
            _event("cap_granted", hypothesis=h["id"], cap_id=cap.cap_id, ttl_s=cap.ttl_s, latency_ms=ms,
                   approved_by_analyst=approved,
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
        stats, shape_error = None, None
        h = state["hypotheses"][state["current"]]
        kind = h.get("kind", "decomposition")
        if kind == "decomposition":
            norm, shape_error = evidence.normalise(df)
            if not shape_error:
                stats, df = evidence.score(norm), norm
                shape_error = evidence.totals_disagree(stats, rt.totals)
                if not shape_error:
                    rt.totals.append((stats["total_baseline"], stats["total_incident"]))
        elif kind == "price_volume":
            stats, shape_error = evidence.price_volume(df, h["focus"])
        elif kind == "timeline":
            stats, shape_error = evidence.onset(df, h["focus"])
        if shape_error:
            return {"attempts": attempts, "sql_error": f"RESULT SHAPE: {shape_error}", "result_csv": None,
                    "events": [_event("sql_error", hypothesis=state["current"], error=shape_error)]}
        # Injection firewall: instruction-like text in the rows is masked before any LLM node sees it.
        df, hits = firewall.scan(df)
        events = []
        if hits:
            rt.firewall_hits += [dict(x, hypothesis=state["current"]) for x in hits]
            events.append(_event("injection_blocked", hypothesis=state["current"], count=len(hits),
                                 columns=sorted({x["column"] for x in hits}), sample=hits[0]["snippet"]))
        csv = df.head(60).to_csv(index=False)
        q = {"sql": rec.rewritten_sql, "columns_used": rec.columns_used, "rows": rec.rows}
        return {"attempts": attempts, "sql_error": None, "result_csv": csv, "last_query": q, "stats": stats,
                "events": events + [_event("query_ok", hypothesis=state["current"], columns=rec.columns_used,
                                           rows=rec.rows, latency_ms=rec.latency_ms,
                                           preview=df.head(8).to_dict("records"))]}

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
        "injections_blocked": len(rt.firewall_hits),
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
