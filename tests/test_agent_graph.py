"""Runs the full LangGraph loop against the demo DB with a scripted (offline) LLM stand-in.

The scripted LLM mimics an agent that first asks for deployment logs (should be blocked by the P4
evidence gate), confirms payment failures, then gets deployment logs on the retry.
"""
from investiguard import catalog
from investiguard.agent.graph import Runtime, run
from investiguard.agent.schemas import (Claim, Hypotheses, Interpretation, Objective, ProposedHypothesis,
                                        QueryPlan, Report)

def _split(col, cut="2026-09-01", val="amount"):
    return (f"SUM(CASE WHEN {col} < '{cut}' THEN {val} ELSE 0 END) AS baseline, "
            f"SUM(CASE WHEN {col} >= '{cut}' THEN {val} ELSE 0 END) AS incident")


ALL_ROW = (f"SELECT 'ALL', {_split('order_date')} FROM orders "
           "WHERE order_date >= '2026-08-01' AND status = 'completed'")
SQL = {
    "release": "SELECT deployed_at, service, version FROM deployment_logs WHERE deployed_at >= '2026-08-25' "
               "AND service = 'payment-service'",
    "payment": f"SELECT status AS segment, {_split('payment_date')} FROM payments "
               f"WHERE payment_date >= '2026-08-01' AND status = 'failed' GROUP BY status UNION ALL {ALL_ROW}",
    "region": f"SELECT region AS segment, {_split('order_date')} FROM orders "
              f"WHERE order_date >= '2026-08-01' AND status = 'completed' GROUP BY region UNION ALL {ALL_ROW}",
}


class ScriptedLLM:
    def __init__(self):
        self.calls = []

    def _driver(self, user):
        for k in SQL:
            if k in user.split("Hypothesis")[1].split("\n")[0].lower():
                return k
        return "region"

    def ask(self, schema, system, user):
        self.calls.append(schema.__name__)
        if schema is Objective:
            return Objective(question_type="lookup" if "Which" in user.split("Data catalogue")[0]
                             else "change_investigation", metric="revenue", metric_definition="sum(orders.amount) where completed",
                             incident_period="2026-09", baseline_period="2026-08", change_pct=-21,
                             metric_columns=["orders.order_date", "orders.amount", "orders.status"])
        if schema is Hypotheses:
            return Hypotheses(hypotheses=[
                ProposedHypothesis(statement="A release regression broke checkout", driver="release", kind="event",
                                   resources=["deployment_logs.deployed_at", "deployment_logs.service",
                                              "deployment_logs.version"], plausibility=0.9, info_gain=0.9),
                ProposedHypothesis(statement="Payment failures rose", driver="payment", kind="decomposition",
                                   resources=["payments.payment_date", "payments.status", "payments.amount"],
                                   plausibility=0.6, info_gain=0.8),
                ProposedHypothesis(statement="A region's orders collapsed", driver="region", kind="decomposition",
                                   resources=["orders.order_date", "orders.region", "orders.amount",
                                              "orders.status"], plausibility=0.4, info_gain=0.6),
                ProposedHypothesis(statement="Customers emails bounce", driver="x", kind="decomposition",
                                   resources=["customers.email", "made_up.column"], plausibility=0.1, info_gain=0.1),
            ])
        if schema is QueryPlan:
            return QueryPlan(sql=SQL[self._driver(user)], rationale="scripted")
        if schema is Interpretation:
            d = self._driver(user)
            # the verdict is ignored for decomposition hypotheses; the evidence engine decides
            return Interpretation(verdict="SUPPORTED" if d == "release" else "REJECTED",
                                  finding=f"scripted {d}", follow_ups=[])
        if schema is Report:
            return Report(root_cause="payment-service release", summary="s", limitations="l", plain_summary="p",
                          claims=[Claim(text="payments failed", evidence_ids=["E1"]),
                                  Claim(text="made up", evidence_ids=["E99"])])
        raise AssertionError(schema)


def test_full_loop_policy_and_gate():
    events = []
    rt = Runtime(catalog=catalog.load(), llm=ScriptedLLM(), mode="C")
    final = run("Revenue fell 21% in September 2026. Find the root cause.", rt, events.append)

    kinds = [e["kind"] for e in events]
    denied = [e for e in events if e["kind"] == "policy_denied"]
    assert denied and denied[0]["check"] == "P4" and denied[0]["hypothesis"] == "H1"
    granted = [e["hypothesis"] for e in events if e["kind"] == "cap_granted"]
    assert granted[:2] == ["H2", "H1"]           # payments first, then deploy logs once evidence exists
    assert final["hypotheses"]["H1"]["status"] == "SUPPORTED"
    assert "H4" in final["hypotheses"] and "customers.email" in final["hypotheses"]["H4"]["resources"]
    h2 = final["hypotheses"]["H2"]
    assert h2["status"] == "SUPPORTED" and h2["explained_share"] > 0.6   # computed by the evidence engine
    assert kinds.count("cap_revoked") == len(granted)
    rep = final["report"]
    assert rep["unsupported_claims_dropped"] == 1
    assert rep["key_facts"][0].startswith("Overall it went from ₹")
    assert rep["exposure"]["sensitive_exposed_raw"] == []
    assert all(not c.active() for c in rt.store.caps.values())


def test_unrestricted_baseline_grants_everything():
    rt = Runtime(catalog=catalog.load(), llm=ScriptedLLM(), mode="A")
    events = []
    run("Revenue fell 21% in September 2026.", rt, events.append)
    assert not [e for e in events if e["kind"] == "policy_denied"]


def test_evidence_engine_rejects_restating_segment():
    import pandas as pd
    from investiguard.agent.evidence import normalise, score
    df = pd.DataFrame({"segment": ["261", "262", "ALL"], "baseline": [97, 3, 100], "incident": [80, 2, 82]})
    assert score(normalise(df)[0])["verdict"] == "INCONCLUSIVE"
    df = pd.DataFrame({"segment": ["fuel", "spares", "ALL"], "baseline": [52, 48, 100], "incident": [39, 46, 85]})
    s = score(normalise(df)[0])
    assert s["verdict"] == "SUPPORTED" and s["top_segment"] == "fuel" and round(s["explained_share"], 2) == 0.87
    assert normalise(pd.DataFrame({"segment": ["a"], "baseline": [1], "incident": [2]}))[1]  # no ALL row


def test_evidence_engine_flags_relabelling():
    import pandas as pd
    from investiguard.agent.evidence import normalise, score
    # 'Co-Gen/Boiler' drops 44 while total drops 18, and 33 reappears in a brand-new area
    df = pd.DataFrame({"segment": ["Co-Gen/Boiler", "CHE_ENGG_PWR_CO-GEN", "Mixing", "ALL"],
                       "baseline": [59, 0, 53, 112], "incident": [15, 33, 46, 94]})
    s = score(normalise(df)[0])
    assert s["verdict"] == "INCONCLUSIVE" and s["possible_relabel"] and s["explained_share"] == 0
    assert "CHE_ENGG_PWR_CO-GEN" in s["reason"]


def test_lookup_question_is_not_investigated():
    rt = Runtime(catalog=catalog.load(), llm=ScriptedLLM(), mode="C")
    final = run("Which customers ordered the most in September?", rt)
    assert final["report"]["not_investigation"] and not rt.store.caps and not rt.gateway.log
