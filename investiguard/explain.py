"""Explanations of the architecture and orchestration, shared by the Streamlit page and the web API."""
from . import config
from .agent.evidence import MAX_BASE_SHARE, MIN_LIFT, REJECT_SHARE, RELABEL_OFFSET, RELABEL_RATIO, SUPPORT_SHARE

LLM_NODES = {"understand", "hypothesize", "write_query", "interpret", "report"}
EDGE_LABELS = {
    ("understand", "hypothesize"): "change question",
    ("understand", "not_investigation"): "direct lookup",
    ("plan", "request_capability"): "next hypothesis",
    ("plan", "report"): "stop rule met",
    ("request_capability", "write_query"): "ALLOW",
    ("request_capability", "plan"): "DENY",
    ("execute", "interpret"): "ok",
    ("execute", "write_query"): "denied / error\\n(retry ≤ 3)",
    ("execute", "give_up"): "3 failures",
}

NODES = [
    ("understand", "LLM", "Problem text, catalogue (names, types, sensitivity — never data)",
     "Objective: metric, periods, change %, metric columns, question type", "Adds a period column in code if the LLM forgot one"),
    ("hypothesize", "LLM", "Objective, catalogue",
     "≤ 8 hypotheses, each with kind, declared columns, plausibility, info gain",
     "Code drops unknown columns, adds metric columns, computes privilege cost and priority, and adds a "
     "low-priority test for each untested non-sensitive categorical column (dimension sweep)"),
    ("plan", "Code", "All hypotheses and their statuses",
     "Next hypothesis, or stop", "Privilege-aware ordering; stop rule; re-tries P4-blocked hypotheses once evidence exists"),
    ("request_capability", "Code", "Declared columns of the chosen hypothesis",
     "Signed, time-limited capability — or DENY with the failed check",
     "Policy engine P1–P5. If enabled, a P4 / P5 denial pauses for the analyst's one-off approval"),
    ("write_query", "LLM", "Objective, hypothesis, ONLY the granted columns, previous error",
     "One SELECT in the fixed shape segment | baseline | incident + ALL row", "Sees nothing outside its capability"),
    ("execute", "Code", "SQL + capability token",
     "Rows, columns used, shape check, evidence statistics",
     "Gateway check → read-only DB → evidence engine → injection firewall masks instruction-like cells"),
    ("interpret", "LLM", "Result + the evidence engine's numbers and verdict",
     "Narrative finding, ≤ 2 follow-up hypotheses",
     "Cannot change the verdict or the explained share. Code adds timing and price-vs-volume drill-downs "
     "on every supported segment"),
    ("give_up", "Code", "Hypothesis that failed 3 times", "INCONCLUSIVE", ""),
    ("revoke", "Code", "Active capability", "Capability revoked; logged", "Privileges never outlive the hypothesis"),
    ("report", "LLM", "Hypotheses, evidence nodes, key numbers computed by code",
     "Root cause, plain-language summary, claims with evidence ids", "Code deletes any claim without valid evidence ids"),
    ("not_investigation", "Code", "Objective marked as a direct lookup",
     "Message pointing to Ask your data", "No data access is granted"),
]

STATE = [
    ("problem", "The business problem as typed"),
    ("objective", "Metric, periods, change %, metric columns, question type"),
    ("hypotheses", "id → statement, kind, declared columns, priority, status, finding, explained share"),
    ("current / cap_id", "Hypothesis under test and its capability"),
    ("sql / sql_error / attempts", "Current query, the last gateway or database error, retry count"),
    ("stats", "Evidence-engine output for the current query"),
    ("evidence (append-only)", "Evidence nodes: hypothesis, capability, SQL, columns, rows, verdict, stats"),
    ("events (append-only)", "Everything streamed live to the Studio timeline"),
    ("report", "Final report, key facts and exposure metrics"),
]

THREATS = [
    ("LLM asks for a column it doesn't need", "P3 declaration + gateway column check", "Enforced"),
    ("SELECT *, aliases, CTEs, sub-queries, UNION smuggling", "Gateway resolves every column via the AST", "Enforced, tested"),
    ("Reading personal / confidential columns", "P2: COUNT-only; restricted never granted", "Enforced, tested"),
    ("Jumping to sensitive tables early", "P4 evidence gate", "Enforced, tested"),
    ("Writes, DDL, multiple statements, system tables", "Gateway allows a single SELECT on catalogued tables", "Enforced, tested"),
    ("Forged, tampered, expired or replayed tokens", "HMAC signature, TTL, revocation list, hypothesis binding", "Enforced, tested"),
    ("Prompt injection hidden inside data", "Injection firewall masks instruction-like cells before any LLM node; "
     "even if one slipped through, policy + gateway still block", "Enforced, tested"),
    ("LLM inventing numbers or verdicts", "Evidence engine decides; key numbers computed in code; claims need evidence ids", "Enforced"),
    ("LLM-written Python exfiltrating data (T1)", "Docker sandbox with no network; it only receives rows a capability "
     "already released", "Enforced, tested (needs Docker)"),
    ("LLM-written Python escaping or reading secrets (T4)", "Read-only filesystem, non-root, all capabilities dropped, "
     "no environment or credentials in the image, time / memory / process limits", "Enforced, tested (needs Docker)"),
    ("Agent talking its way past the evidence gate", "Only the analyst can waive P4 / P5, once, for 2 minutes; "
     "P1–P3 can never be waived", "Enforced, tested"),
    ("Audit log edited after the fact", "Hash-chained event ledger sealed with an HMAC receipt; any edit, drop or "
     "reorder fails verification", "Enforced, tested"),
]



POLICY = [
    ("P1", "Operation", "Only read operations; writes are never granted"),
    ("P2", "Sensitivity", "internal → clear · confidential → COUNT-only · restricted → never"),
    ("P3", "Declaration", "Only columns the hypothesis declared when it was created (no scope creep)"),
    ("P4", "Evidence gate", "Gated tables (logs, tickets…) need an already-confirmed finding"),
    ("P5", "Budgets", f"TTL ≤ {config.CAP_TTL_MAX_S}s · ≤ {config.K_MAX_ACTIVE_CAPS} active capabilities · "
                      f"≤ {config.SENSITIVE_COLUMN_BUDGET} sensitive columns per run"),
]

EVIDENCE_RULES = [
    (f"Top segment moved > {RELABEL_RATIO}× the total and ≥ {RELABEL_OFFSET:.0%} of it reappears in segments "
     "new this period", "INCONCLUSIVE — possible relabelling"),
    (f"Base share > {MAX_BASE_SHARE:.0%}", "INCONCLUSIVE — restates the problem"),
    (f"Explained share ≥ {SUPPORT_SHARE:.0%} and lift ≥ {MIN_LIFT}", "SUPPORTED"),
    (f"Explained share < {REJECT_SHARE:.0%}", "REJECTED"),
    ("Otherwise", "INCONCLUSIVE"),
    ("Price-vs-volume drill: volume effect = Δquantity × old price, price effect = Δprice × new quantity",
     "SUPPORTED — reports the larger effect"),
    ("Timing drill: split of the period series with the largest mean shift; step ≥ 2× the noise",
     "SUPPORTED — reports the onset period"),
]


def orchestration_mermaid(graph) -> str:
    """Mermaid flowchart of a compiled LangGraph graph, coloured by who decides each node."""
    g = graph.get_graph()
    lines = ["flowchart TD"]
    ids = {"__start__": "ig_start", "__end__": "ig_end"}  # 'end' is a Mermaid keyword
    for n in g.nodes:
        if n in ids:
            lines.append(f'  {ids[n]}(["{n.strip("_").upper()}"]):::term')
        else:
            kind = "LLM" if n in LLM_NODES else "code"
            lines.append(f'  {n}["<b>{n}</b><br/><small>{kind}</small>"]:::{"llm" if n in LLM_NODES else "code"}')
    for e in g.edges:
        label = EDGE_LABELS.get((e.source, e.target), "").replace("\\n", " ")
        arrow = "-.->" if e.conditional else "-->"
        lines.append(f'  {ids.get(e.source, e.source)} {arrow}{f"|{chr(34)}{label}{chr(34)}|" if label else ""} '
                     f'{ids.get(e.target, e.target)}')
    lines += ["  classDef llm fill:#fdf3e6,stroke:#c48a3f,color:#5a3a12",
              "  classDef code fill:#eaf4ee,stroke:#5c9a74,color:#173d27",
              "  classDef term fill:#f3f2ef,stroke:#b5b1a8,color:#1b1a18"]
    return "\n".join(lines)
