"""InvestiGuard Agent Studio. Run: streamlit run app.py"""
import time
from html import escape

import pandas as pd
import streamlit as st
from sqlalchemy.engine import make_url

from investiguard import ask as ask_mod
from investiguard import catalog as catalog_mod
from investiguard import config
from investiguard.agent.direct import run_direct
from investiguard.agent.graph import Runtime, run
from investiguard.llm import ChatLLM
from investiguard.ui import architecture, data_tab, styles

st.set_page_config(page_title="InvestiGuard", page_icon="🛡️", layout="wide", initial_sidebar_state="expanded")
styles.inject()
st.session_state.setdefault("results", {})
st.session_state.setdefault("asks", [])

STATUS_ICON = {"PROPOSED": "⚪", "TESTING": "🔵", "SUPPORTED": "🟢", "REJECTED": "🔴",
               "INCONCLUSIVE": "🟡", "BLOCKED": "⛔"}
MODES = {"C": "InvestiGuard · hypothesis-driven", "A": "Direct AI · no checks"}

DATASETS = config.datasets()

# ---------------- sidebar ----------------
with st.sidebar:
    styles.brand()
    if not DATASETS:
        st.info("No datasets yet. Add one in the main panel.")
        ds_name = None
    else:
        if st.session_state.get("select_dataset") in DATASETS:  # just onboarded: switch to it
            st.session_state["dataset_select"] = st.session_state.pop("select_dataset")
        styles.side_label("Dataset")
        ds_name = st.selectbox("Dataset", list(DATASETS), key="dataset_select", label_visibility="collapsed",
                               format_func=lambda n: DATASETS[n]["label"])
    styles.side_label("Mode")
    mode = st.radio("Access mode", list(MODES), format_func=MODES.get, label_visibility="collapsed",
                    help="InvestiGuard tests hypotheses, each with only the columns it needs. Direct AI is the baseline: "
                         "the AI looks for the reason itself with every column open and no checks.")
    styles.side_label("Model")
    model = st.text_input("Model", config.LLM_MODEL, label_visibility="collapsed")
    if ds_name:
        u = make_url(DATASETS[ds_name]["url"])
        where = u.database.rsplit("/", 1)[-1] if u.drivername.startswith("sqlite") else f"{u.host}/{u.database}"
        st.markdown(f'<div class="ig-db">🗄️ {u.drivername.split("+")[0]} · {escape(str(where))}</div>',
                    unsafe_allow_html=True)


def make_llm():
    if model == "scripted-demo":  # offline smoke test of the UI, demo DB only
        from tests.test_agent_graph import ScriptedLLM
        return ScriptedLLM()
    return ChatLLM(model)


if not ds_name:
    styles.hero("Welcome to InvestiGuard", "Upload a dataset in any common format to get started.", [])
    data_tab.render_add(make_llm)
    st.stop()

ds = DATASETS[ds_name]
if st.session_state.get("dataset") != ds_name:  # results belong to one dataset
    st.session_state.dataset, st.session_state.results, st.session_state.asks = ds_name, {}, []
if not ds["catalog"].exists():
    st.error(f"Catalogue {ds['catalog'].name} is missing. Re-add the dataset in the Data tab.")
    data_tab.render_add(make_llm)
    st.stop()
cat = catalog_mod.load(ds["catalog"])
sensitive = sum(cat.sensitivity(c) in ("confidential", "restricted") for c in cat.all_columns())
styles.hero(ds["label"], "Ask questions or investigate why a number changed. Every query is checked against a "
                         "least-privilege policy before it reaches the data.",
            [("tables", len(cat.tables)), ("columns", len(cat.all_columns())), ("sensitive", sensitive),
             ("mode", "InvestiGuard" if mode == "C" else "Direct AI"), ("model", model.split(":")[-1])])

tab_run, tab_ask, tab_cmp, tab_data, tab_how = st.tabs(
    ["🔎  Investigate", "💬  Ask your data", "⚖️  A vs C", "🗂️  Data", "🧭  How it works"])

with tab_how:
    architecture.render(cat)

with tab_data:
    data_tab.render(ds_name, ds, cat, make_llm)

# ---------------- ask ----------------
with tab_ask:
    st.markdown('<div class="ig-muted">Plain-English questions → SQL. The policy grants a one-shot capability '
                'for exactly the columns the query uses; the gateway enforces it.</div>', unsafe_allow_html=True)
    samples = ds.get("sample_questions", [])
    pick = st.selectbox("Example questions", ["—"] + samples, key=f"pick_{ds_name}")
    c1, c2 = st.columns([6, 1])
    question = c1.text_input("Your question", value="" if pick == "—" else pick, key=f"q_{ds_name}_{pick}",
                             placeholder="e.g. Which 10 products earned the most last quarter?",
                             label_visibility="collapsed")
    if c2.button("Ask", type="primary", disabled=not question.strip(), width="stretch"):
        with st.spinner("Writing and checking SQL…"):
            try:
                st.session_state.asks.insert(0, ask_mod.ask(question, cat, make_llm(), ds["url"], mode,
                                                            currency=ds.get("currency", "INR")))
            except Exception as e:
                st.exception(e)

    for r in st.session_state.asks:
        with st.container(border=True):
            st.markdown(f'<div class="ig-q">{escape(r.question)}</div>'
                        f'<div class="ig-answer{" denied" if r.denied else ""}">{escape(r.answer)}</div>',
                        unsafe_allow_html=True)
            if r.df is not None and len(r.df):
                left, right = st.columns([3, 2])
                with left:
                    if r.chart != "none" and r.x in r.df.columns and r.y in r.df.columns:
                        chart_df = r.df[[r.x, r.y]].set_index(r.x)
                        (st.line_chart if r.chart == "line" else st.bar_chart)(chart_df, height=260,
                                                                               color="#8B7CFF")
                    st.dataframe(r.df, width="stretch", hide_index=True, height=220)
                with right:
                    st.code(r.sql, language="sql")
                    granted = " ".join(f"<code>{escape(c.split('.')[-1])}</code>"
                                       + (" (COUNT-only)" if m == "aggregate_only" else "")
                                       for c, m in r.columns_granted.items())
                    st.markdown(f'<div class="ig-muted ig-grant">🔑 Granted: {granted}<br>Revoked after the '
                                f'answer · {r.seconds:.1f}s</div>', unsafe_allow_html=True)
            if len(r.attempts) > 1 or r.denied:
                with st.expander(f"Policy / gateway attempts ({len(r.attempts)})"):
                    for a in r.attempts:
                        st.markdown(f"**#{a['attempt']}** — {a['result']}")
                        st.code(a["sql"], language="sql")


# ---------------- investigation ----------------
def render_hyps(box, hyps: dict):
    if not hyps:
        return
    df = pd.DataFrame([{
        "": STATUS_ICON.get(h["status"], ""), "id": h["id"], "status": h["status"], "hypothesis": h["statement"],
        "priority": h["priority"], "privilege cost": h["privilege_cost"],
        "columns": ", ".join(r.split(".")[-1] for r in h["resources"]), "finding": h.get("finding") or "",
    } for h in hyps.values()])
    box.dataframe(df, width="stretch", hide_index=True, height=440, column_config={
        "": st.column_config.TextColumn(width=30), "id": st.column_config.TextColumn(width=45),
        "priority": st.column_config.ProgressColumn(min_value=0, max_value=max(0.01, df["priority"].max()),
                                                    format="%.2f", width=90),
        "hypothesis": st.column_config.TextColumn(width="large"), "finding": st.column_config.TextColumn(width="large")})


def timeline_html(ev: dict) -> str | None:
    k, e = ev["kind"], escape
    if k == "plan":
        return styles.event_html("🧭", f"Planner picks {e(ev['hypothesis'])}", f"priority {ev['priority']}",
                                 "var(--ig-accent)")
    if k == "cap_granted":
        res = " ".join(f"<code>{e(r.split('.')[-1])}</code>" + (" COUNT-only" if m == "aggregate_only" else "")
                       for r, m in ev["resources"].items())
        return styles.event_html("🔑", f"Capability granted → {e(ev['hypothesis'])}",
                                 f"TTL {ev['ttl_s']}s · {res}", "var(--ig-blue)")
    if k == "policy_denied":
        return styles.event_html("⛔", f"Policy DENY {e(ev['check'])} · {e(ev['hypothesis'])}", e(ev["reason"]),
                                 "var(--ig-red)")
    if k == "query_ok":
        return styles.event_html("✅", f"Query ok · {ev['rows']} rows",
                                 f"{len(ev['columns'])} columns · {ev['latency_ms']:.1f} ms gateway check",
                                 "var(--ig-green)")
    if k == "gateway_denied":
        return styles.event_html("🚫", f"Gateway blocked {e(ev['hypothesis'])}", e(ev["reason"]), "var(--ig-red)")
    if k == "sql_error":
        return styles.event_html("⚠️", "Query rejected, retrying", e(ev["error"]), "var(--ig-amber)")
    if k == "hypothesis_status":
        h = ev["hypothesis"]
        return styles.event_html(STATUS_ICON[h["status"]], f"{e(h['id'])} {styles.pill(h['status'])}",
                                 e(h.get("finding") or ""), styles.COLORS.get(h["status"]))
    if k == "cap_revoked":
        return styles.event_html("🔒", f"Revoked capability for {e(ev['hypothesis'])}", e(str(ev["reason"])))
    if k == "stop":
        return styles.event_html("🏁", "Investigation finished", e(ev["reason"]), "var(--ig-accent-2)")
    return None


with tab_run:
    suggestions = ds.get("suggested_problems") or [ds["problem"]]
    pick = st.selectbox("Suggested from your data (changes found by profiling)", suggestions,
                        key=f"prob_pick_{ds_name}")
    problem = st.text_area("Business problem — describe a number that rose or fell, and ask why", pick,
                           height=90, key=f"problem_{ds_name}_{suggestions.index(pick)}")
    go = st.button(f"Run investigation · {MODES[mode]}", type="primary")

    col_h, col_t = st.columns([3, 2], gap="medium")
    with col_h:
        styles.section("Hypotheses")
        hyp_box = st.empty()
    with col_t:
        styles.section("Live timeline")
        time_box = st.container(height=440, border=False)
    alert_box = st.container()

    if go:
        hyps, events, t0 = {}, [], time.time()
        try:
            rt = Runtime(catalog=cat, llm=make_llm(), mode=mode, url=ds["url"], currency=ds.get("currency", "INR"))
        except Exception as e:
            st.error(f"Could not initialise model `{model}`: {e}. Set OPENAI_API_KEY in .env.")
            st.stop()

        def on_event(ev):
            events.append(ev)
            if ev["kind"] in ("hypothesis_proposed", "hypothesis_status"):
                hyps[ev["hypothesis"]["id"]] = ev["hypothesis"]
                render_hyps(hyp_box, hyps)
            if ev["kind"] in ("cap_granted", "policy_denied") and ev["hypothesis"] in hyps:
                hyps[ev["hypothesis"]]["status"] = "TESTING" if ev["kind"] == "cap_granted" else "BLOCKED"
                render_hyps(hyp_box, hyps)
            html = timeline_html(ev)
            if html:
                time_box.markdown(html, unsafe_allow_html=True)
            if ev["kind"] == "gateway_denied":
                alert_box.warning(f"Security event: gateway blocked a query for {ev['hypothesis']} — {ev['reason']}")

        with st.spinner("Investigating…"):
            try:
                final = (run_direct if mode == "A" else run)(problem, rt, on_event)
            except Exception as e:
                st.exception(e)
                st.stop()
        st.session_state.results[mode] = {"final": final, "events": events, "seconds": time.time() - t0,
                                          "gateway_log": [vars(q) for q in rt.gateway.log]}

    res = st.session_state.results.get(mode)
    if not res:
        hyp_box.markdown('<div class="ig-suggest">Hypotheses appear here as the agent proposes and tests them.</div>',
                         unsafe_allow_html=True)
        time_box.markdown('<div class="ig-suggest">Grants, denials, queries and revocations stream here.</div>',
                          unsafe_allow_html=True)
    elif res["final"]["report"].get("not_investigation"):
        st.warning(res["final"]["report"]["plain_summary"])
    else:
        final = res["final"]
        if not go:
            render_hyps(hyp_box, final["hypotheses"])
            for ev in res["events"]:
                html = timeline_html(ev)
                if html:
                    time_box.markdown(html, unsafe_allow_html=True)
        rep, exp_ = final["report"], final["report"]["exposure"]

        styles.section("In plain words")
        styles.plain_card(rep.get("plain_summary", ""), rep.get("key_facts", []))

        m = st.columns(5)
        m[0].metric("Columns touched", f"{len(exp_['columns_touched'])}/{exp_['columns_total']}")
        m[1].metric("Data exposure", f"{exp_['data_exposure_ratio']:.0%}")
        m[2].metric("Sensitive exposed raw", len(exp_["sensitive_exposed_raw"]))
        m[3].metric("Queries allowed / denied", f"{exp_['queries_allowed']} / {exp_['queries_denied']}")
        m[4].metric("Time", f"{res['seconds']:.0f}s")

        styles.section("Technical report")
        st.markdown(f'<div class="ig-root"><b>Root cause</b> · {escape(rep["root_cause"])}</div>',
                    unsafe_allow_html=True)
        st.write(rep["summary"])
        for c in rep["claims"]:
            st.markdown(f"- {c['text']}  `{' '.join(c['evidence_ids'])}`")
        if rep["unsupported_claims_dropped"]:
            st.caption(f"{rep['unsupported_claims_dropped']} claim(s) without evidence were removed.")
        st.caption(f"Limitations: {rep['limitations']} · Stop reason: {rep['done_reason']}")

        with st.expander("Evidence provenance (hypothesis → capability → query → finding)"):
            st.dataframe(pd.DataFrame(final.get("evidence", [])), width="stretch", hide_index=True)
        with st.expander("Gateway audit log"):
            st.dataframe(pd.DataFrame(res["gateway_log"]), width="stretch", hide_index=True)

# ---------------- comparison ----------------
with tab_cmp:
    rows = []
    for m_, r in sorted(st.session_state.results.items()):
        if r["final"]["report"].get("not_investigation"):
            continue
        e = r["final"]["report"]["exposure"]
        rows.append({"config": MODES[m_], "root cause": r["final"]["report"]["root_cause"],
                     "columns touched": len(e["columns_touched"]), "data exposure": e["data_exposure_ratio"],
                     "sensitive raw": ", ".join(e["sensitive_exposed_raw"]) or "0",
                     "queries denied": e["queries_denied"], "seconds": round(r["seconds"], 1)})
    if not rows:
        st.info("Run the same problem in both modes (sidebar) to compare them here.")
    else:
        st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True, column_config={
            "data exposure": st.column_config.ProgressColumn(min_value=0, max_value=1, format="%.0f%%"),
            "root cause": st.column_config.TextColumn(width="large")})
