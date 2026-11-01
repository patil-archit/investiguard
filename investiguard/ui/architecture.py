"""'How it works' page: system architecture and LangGraph orchestration, explained in detail.

The orchestration diagram is generated from the compiled LangGraph graph, so it always matches the code.
"""
import pandas as pd
import streamlit as st

from ..agent.evidence import MAX_BASE_SHARE, MIN_LIFT, REJECT_SHARE, RELABEL_OFFSET, RELABEL_RATIO, SUPPORT_SHARE
from ..agent.graph import Runtime, build_graph
from ..explain import EDGE_LABELS, LLM_NODES, NODES, STATE, THREATS
from .. import config

# Colours shared by both diagrams: red = untrusted (LLM), green = trusted (deterministic code), blue = data.
UNTRUSTED, TRUSTED, DATA, UI = "#fde2e1", "#dcf3e3", "#dde8fb", "#efe7fb"

ARCHITECTURE_DOT = f"""
digraph G {{
  rankdir=LR; bgcolor="transparent"; compound=true; newrank=true;
  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=11, color="#555555"];
  edge [fontname="Helvetica", fontsize=9, color="#666666"];

  subgraph cluster_ui {{ label="Presentation plane"; style="rounded"; color="#9b87c9"; fontname="Helvetica";
    user [label="Analyst", shape=ellipse, fillcolor="{UI}"];
    studio [label="Agent Studio\\n(Streamlit)\\nInvestigation · Ask · A vs C", fillcolor="{UI}"];
  }}

  subgraph cluster_reason {{ label="Reasoning plane  —  UNTRUSTED (LLM)"; style="rounded,dashed"; color="#d9534f"; fontname="Helvetica";
    agent [label="LangGraph investigation agent\\nunderstand · hypothesize ·\\nwrite_query · interpret · report", fillcolor="{UNTRUSTED}"];
    asker [label="Ask-your-data\\nNL → SQL → answer", fillcolor="{UNTRUSTED}"];
    llm [label="OpenAI gpt-4o-mini\\n(structured JSON outputs)", shape=component, fillcolor="{UNTRUSTED}"];
  }}

  subgraph cluster_control {{ label="Control plane  —  TRUSTED (deterministic code, no LLM)"; style="rounded"; color="#2e8b57"; fontname="Helvetica";
    planner [label="Planner\\npriority = plausibility × info_gain\\n÷ (1 + λ·privilege_cost)", fillcolor="{TRUSTED}"];
    policy [label="Policy engine\\nP1 op · P2 sensitivity · P3 declared\\nP4 evidence gate · P5 budgets", fillcolor="{TRUSTED}"];
    caps [label="Capability store\\nsigned JWT · TTL · revoke", fillcolor="{TRUSTED}"];
    evid [label="Evidence engine\\nexplained share · lift ·\\nspecificity · relabel check", fillcolor="{TRUSTED}"];
    audit [label="Audit log + provenance\\nhypothesis → capability →\\nquery → finding", fillcolor="{TRUSTED}"];
  }}

  subgraph cluster_data {{ label="Data plane"; style="rounded"; color="#3b6fd8"; fontname="Helvetica";
    gateway [label="SQL gateway\\nsqlglot AST · column check ·\\nCOUNT-only · row limit", fillcolor="{TRUSTED}"];
    db [label="Database (read-only)\\nSQLite / PostgreSQL", shape=cylinder, fillcolor="{DATA}"];
    catalog [label="Catalogue YAML\\nsensitivity · gates", shape=note, fillcolor="{DATA}"];
  }}

  user -> studio [label="problem / question"];
  studio -> agent [label="start run"];
  studio -> asker;
  agent -> llm [dir=both, style=dashed]; asker -> llm [dir=both, style=dashed];
  agent -> planner [label="hypotheses"];
  planner -> policy [label="capability\\nrequest"];
  policy -> catalog [style=dotted];
  policy -> caps [label="ALLOW → mint"];
  agent -> gateway [label="SQL + token", color="#d9534f"];
  asker -> gateway [label="SQL + token", color="#d9534f"];
  gateway -> caps [label="verify", style=dotted];
  gateway -> db [label="checked SELECT"];
  db -> gateway [label="rows"];
  gateway -> evid [label="result"];
  evid -> agent [label="verdict\\n(final)"];
  gateway -> audit; policy -> audit; evid -> audit;
  audit -> studio [label="live events", style=dashed];
}}
"""

ASK_DOT = f"""
digraph A {{
  rankdir=LR; bgcolor="transparent";
  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=11];
  edge [fontname="Helvetica", fontsize=9];
  q [label="Question", shape=ellipse, fillcolor="{UI}"];
  w [label="LLM writes SQL", fillcolor="{UNTRUSTED}"];
  p [label="Gateway parses SQL\\n→ exact columns used", fillcolor="{TRUSTED}"];
  d [label="Policy decides\\n(P1 P2 P3 P5)", fillcolor="{TRUSTED}"];
  c [label="One-shot capability\\n(120 s)", fillcolor="{TRUSTED}"];
  x [label="Gateway executes\\nread-only", fillcolor="{TRUSTED}"];
  r [label="Readable money\\ncolumns (code)", fillcolor="{TRUSTED}"];
  a [label="LLM writes\\nplain answer", fillcolor="{UNTRUSTED}"];
  v [label="Revoke", fillcolor="{TRUSTED}"];
  q -> w -> p -> d -> c -> x -> r -> a -> v;
  d -> w [label="DENY: reason fed back\\n(≤ 3 attempts)", style=dashed, color="#d9534f"];
  x -> w [label="gateway/SQL error", style=dashed, color="#d9534f"];
}}
"""

def _orchestration_dot() -> str:
    g = build_graph(Runtime(catalog=st.session_state["_catalog"], llm=None)).get_graph()
    lines = ['digraph O { rankdir=TB; bgcolor="transparent";',
             'node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=11];',
             'edge [fontname="Helvetica", fontsize=9];']
    for n in g.nodes:
        if n in ("__start__", "__end__"):
            lines.append(f'"{n}" [label="{n.strip("_").upper()}", shape=circle, fillcolor="#eeeeee", fontsize=9];')
        else:
            kind = "LLM" if n in LLM_NODES else "code"
            fill = UNTRUSTED if n in LLM_NODES else TRUSTED
            lines.append(f'"{n}" [label="{n}\\n({kind})", fillcolor="{fill}"];')
    for e in g.edges:
        label = EDGE_LABELS.get((e.source, e.target), "")
        style = "dashed" if e.conditional else "solid"
        lines.append(f'"{e.source}" -> "{e.target}" [label="{label}", style={style}];')
    lines.append("}")
    return "\n".join(lines)


def render(catalog):
    st.session_state["_catalog"] = catalog
    st.markdown("### How InvestiGuard works")
    st.markdown(
        "**One rule runs through the whole design: the LLM proposes, deterministic code decides.** "
        "The LLM generates hypotheses, SQL and prose. It never decides which data it may read, whether a "
        "query may run, or whether a hypothesis is true. Those decisions are made by plain code that can "
        "be tested and audited."
    )
    st.caption("🟥 red = untrusted (LLM output) · 🟩 green = trusted deterministic code · 🟦 blue = data")

    st.markdown("---\n#### 1. System architecture")
    st.graphviz_chart(ARCHITECTURE_DOT, width="stretch")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("""
**Presentation plane — Agent Studio.** Starts investigations and questions and streams every event live:
hypotheses, grants, denials, revocations and the report.

**Reasoning plane — untrusted.** The LangGraph agent and the Ask feature. They can only *request*
capabilities and *submit* SQL. Everything they produce is treated as untrusted input, including
text read from the data (which may contain prompt injections).

**Control plane — trusted.** Plain Python with no LLM:
- **Planner:** picks the next hypothesis, cheapest privilege first.
- **Policy engine:** decides every grant using rules P1–P5.
- **Capability store:** issues signed, expiring tokens that are bound to one hypothesis.
- **Evidence engine:** turns query results into verdicts.
- **Audit log:** links every decision.
""")
    with c2:
        st.markdown("""
**Data plane.**
- **SQL gateway:** the only path to the database. It parses each query into a syntax tree (sqlglot)
  and resolves *every* column it touches, including those in filters, joins, sub-queries, CTEs,
  `SELECT *` and UNIONs. It checks each one against the active capability, enforces COUNT-only
  columns, and adds a row limit. It fails closed.
- **Database:** opened read-only (SQLite `mode=ro`; PostgreSQL `READ ONLY` transactions with a
  statement timeout).
- **Catalogue:** labels every column's sensitivity and marks which tables need prior evidence.

**Defence in depth:** even if the LLM is fully compromised, it can only obtain what the policy grants,
and the gateway checks every query against that grant.
""")

    st.markdown("**One request, end to end**")
    st.markdown("""
1. The analyst types a problem. `understand` extracts the metric, the two periods and the metric columns.
2. `hypothesize` proposes candidate drivers. Each one **declares** the columns it needs, and code
   computes its privilege cost from their sensitivity.
3. The **planner** ranks hypotheses by `plausibility × info_gain ÷ (1 + λ·privilege_cost)`, so cheap,
   low-sensitivity explanations are tried first.
4. The **policy engine** checks P1–P5. On ALLOW it issues a capability (columns, mode, purpose,
   5-minute TTL). On DENY it logs the reason, and the hypothesis waits; P4 denials are retried once
   evidence exists.
5. `write_query` sees **only the granted columns** and writes one SELECT in a fixed shape.
6. The **gateway** verifies the token, parses the SQL, checks every column and runs it read-only.
7. The **evidence engine** computes the verdict. `interpret` writes the narrative and may propose
   follow-ups.
8. The capability is **revoked**. Steps 3–7 repeat until the stop rule is met.
9. `report` writes the summary. Code computes the key numbers, and claims without evidence are deleted.
""")

    st.markdown("**Policy rules (deterministic)**")
    st.dataframe(pd.DataFrame([
        ("P1", "Operation", "Only read operations; writes are never granted"),
        ("P2", "Sensitivity", "internal → clear · confidential → COUNT-only · restricted → never"),
        ("P3", "Declaration", "Only columns the hypothesis declared when it was created (no scope creep)"),
        ("P4", "Evidence gate", "Gated tables (logs, tickets…) need an already-confirmed finding"),
        ("P5", "Budgets", f"TTL ≤ {config.CAP_TTL_MAX_S}s · ≤ {config.K_MAX_ACTIVE_CAPS} active capabilities · "
                          f"≤ {config.SENSITIVE_COLUMN_BUDGET} sensitive columns per run"),
    ], columns=["rule", "name", "what it enforces"]), hide_index=True, width="stretch")

    st.markdown("---\n#### 2. LangGraph agent orchestration")
    st.markdown(
        "The agent is a **single LangGraph `StateGraph`**, not a group of chatting agents. Each node "
        "is one role. Every edge is a plain Python function of the state, so **the LLM never decides "
        "where the graph goes next**. The diagram below is generated from the compiled graph at runtime. "
        "Dashed edges are conditional routes."
    )
    st.graphviz_chart(_orchestration_dot(), width="stretch")

    st.markdown("**Nodes**")
    st.dataframe(pd.DataFrame(NODES, columns=["node", "who decides", "reads", "produces", "guard-rails"]),
                 hide_index=True, width="stretch")

    st.markdown("**Routing (conditional edges)**")
    st.markdown("""
- `understand →` **hypothesize** if the question asks why a metric changed, otherwise **not_investigation**
  (direct questions belong in *Ask your data*).
- `plan →` **report** when the stop rule is met, otherwise **request_capability** for the top-priority
  hypothesis.
- `request_capability →` **write_query** on ALLOW, or back to **plan** on DENY.
- `execute →` **interpret** on success; back to **write_query** with the exact error on a gateway denial,
  SQL error or wrong result shape (up to 3 attempts); then **give_up**.
- `interpret / give_up → revoke → plan`: the capability is always revoked before the next hypothesis.
""")

    st.markdown("**Stop rule**")
    st.markdown(f"""
The run stops when one of these is true:
- **(a)** The strongest supported driver explains ≥ {config.STOP_EXPLAINED_SHARE:.0%} of the change, and
  there are no drill-downs left. Drill-downs are follow-ups of supported findings and hypotheses that
  have just been unblocked.
- **(b)** The iteration budget ({config.MAX_ITERATIONS}) is used up.
- **(c)** No untested hypotheses remain.

The largest single share is used, not a sum, because overlapping hypotheses (e.g. the category *fuel*
and the group *Fuel*) would otherwise be double-counted.
""")

    st.markdown("**Evidence engine (verdicts are computed, not generated)**")
    st.markdown(f"""
Every decomposition query returns `segment | baseline | incident` plus an `ALL` row. Code computes:
- **Explained share** = |top segment's change| ÷ |total change|.
- **Base share** = the segment's size in the baseline period.
- **Lift** = explained share ÷ base share.

| condition | verdict |
|---|---|
| top segment moved > {RELABEL_RATIO}× the total and ≥ {RELABEL_OFFSET:.0%} of it reappears in segments new this period | INCONCLUSIVE — possible relabelling |
| base share > {MAX_BASE_SHARE:.0%} | INCONCLUSIVE — restates the problem |
| share ≥ {SUPPORT_SHARE:.0%} and lift ≥ {MIN_LIFT} | SUPPORTED |
| share < {REJECT_SHARE:.0%} | REJECTED |
| otherwise | INCONCLUSIVE |

"Event" hypotheses, which look things up in log-style tables, are judged by the LLM. They are shown as
corroborating evidence only and never count toward the stop rule.
""")

    st.markdown("**Shared state**")
    st.dataframe(pd.DataFrame(STATE, columns=["field", "holds"]), hide_index=True, width="stretch")
    st.markdown("""
**LangGraph features used:**
- `StateGraph` with a typed state; `evidence` and `events` are append-only reducers.
- `add_conditional_edges` for every routing decision.
- A custom stream mode (`get_stream_writer`) that pushes events to the Studio.
- `recursion_limit` as a hard backstop on top of the agent's own budgets.
- Structured outputs (`with_structured_output`) on every LLM node.
""")

    st.markdown("---\n#### 3. Ask your data (separate feature, same trust boundary)")
    st.graphviz_chart(ASK_DOT, width="stretch")
    st.markdown(
        "The capability is derived from the columns the **gateway parses out of the SQL**, not from what "
        "the LLM claims. Money values are converted into readable form (₹ crore/lakh) **by code** before "
        "the LLM writes its answer."
    )

    st.markdown("---\n#### 4. Threats and what stops them")
    st.dataframe(pd.DataFrame(THREATS, columns=["threat", "stopped by", "status"]), hide_index=True, width="stretch")
