"""Data tab: add a dataset (upload any format or connect a database) and edit the active catalogue."""
import pandas as pd
import streamlit as st
from sqlalchemy.engine import make_url

from .. import catalog as catalog_mod
from .. import config, db, profile
from ..catalog import LEVELS
from ..ingest import SUPPORTED, ingest_uploads, slug
from ..onboard import onboard
from .styles import section

CURRENCIES = ["INR", "USD", "EUR", "GBP", "none"]


def _finish(result: dict):
    st.session_state["select_dataset"] = result["name"]
    st.session_state["onboarded"] = result
    st.rerun()


def render_add(make_llm):
    section("Add a dataset", "any format · stays on this machine")
    up_tab, db_tab = st.tabs(["⬆️  Upload files", "🔌  Connect a database"])

    with up_tab:
        files = st.file_uploader(
            "Drop one or more files. Every CSV/JSON/Parquet file becomes a table; every Excel sheet becomes a table.",
            type=sorted(e.lstrip(".") for e in SUPPORTED), accept_multiple_files=True)
        c1, c2, c3 = st.columns([2, 3, 1])
        default = slug(files[0].name.rsplit(".", 1)[0]) if files else ""
        name = c1.text_input("Short name", value=default, key="up_name", help="Letters, digits and _ only")
        label = c2.text_input("Display name", value=name.replace("_", " ").title() if name else "", key="up_label")
        currency = c3.selectbox("Currency", CURRENCIES, key="up_cur")
        describe = st.checkbox("Let the AI draft column descriptions (values of sensitive columns are never sent)",
                               value=True, key="up_desc")
        if st.button("Create dataset", type="primary", disabled=not (files and name), key="up_go"):
            with st.status("Setting up dataset…", expanded=True) as status:
                try:
                    status.write("Reading files and loading them into a private read-only database…")
                    url, tables = ingest_uploads([(f.name, f.getvalue()) for f in files], name)
                    for t, (r, c) in tables.items():
                        status.write(f"• `{t}` — {r:,} rows, {c} columns")
                    result = onboard(name, label or name, url, currency, make_llm(), describe, progress=status.write)
                    status.update(label="Dataset ready", state="complete")
                except Exception as e:
                    status.update(label="Could not load the dataset", state="error")
                    st.error(str(e))
                    return
            _finish(result)

    with db_tab:
        st.caption("PostgreSQL, MySQL or SQLite via a SQLAlchemy URL, e.g. "
                   "`postgresql+psycopg://user:password@host/dbname`. The URL is stored in `.env`, not in "
                   "datasets.yaml. Use an account with read-only rights.")
        c1, c2, c3 = st.columns([2, 3, 1])
        name = c1.text_input("Short name", key="db_name")
        label = c2.text_input("Display name", key="db_label")
        currency = c3.selectbox("Currency", CURRENCIES, key="db_cur")
        url = st.text_input("Database URL", type="password", key="db_url")
        describe = st.checkbox("Let the AI draft column descriptions", value=True, key="db_desc")
        if st.button("Connect", type="primary", disabled=not (name and url), key="db_go"):
            with st.status("Connecting…", expanded=True) as status:
                try:
                    tables = db.introspect(url)
                    status.write(f"Connected · {len(tables)} tables found")
                    env_key = config.store_secret_url(slug(name), url) if make_url(url).password else None
                    result = onboard(name, label or name, url, currency, make_llm(), describe,
                                     url_env=env_key, progress=status.write)
                    status.update(label="Dataset ready", state="complete")
                except Exception as e:
                    status.update(label="Could not connect", state="error")
                    st.error(str(e).splitlines()[0])
                    return
            _finish(result)


def render_catalog(ds_name: str, ds: dict, cat, make_llm):
    section("Catalogue & sensitivity", "the policy engine reads this — review it before running")
    raw = catalog_mod.load_raw(ds["catalog"])
    rows = [{"table": t, "column": c, "type": m.get("type", ""), "sensitivity": m["sensitivity"],
             "description": m.get("description", "")}
            for t, info in raw["tables"].items() for c, m in info["columns"].items()]
    edited = st.data_editor(
        pd.DataFrame(rows), hide_index=True, width="stretch", height=380, key=f"cat_editor_{ds_name}",
        disabled=["table", "column", "type"],
        column_config={
            "sensitivity": st.column_config.SelectboxColumn(
                options=LEVELS, required=True,
                help="internal → readable · confidential → COUNT-only · restricted → never granted"),
            "description": st.column_config.TextColumn(width="large"),
        })

    section("Evidence gates (P4)", "tables that open only after a confirmed finding")
    gates = {}
    cols = st.columns(min(4, max(1, len(raw["tables"]))))
    for i, (t, info) in enumerate(raw["tables"].items()):
        gates[t] = cols[i % len(cols)].selectbox(
            t, ["none", "any finding"], index=1 if info.get("requires_finding") else 0, key=f"gate_{ds_name}_{t}")

    c1, c2, c3 = st.columns([1, 1, 3])
    if c1.button("Save catalogue", type="primary", key=f"save_cat_{ds_name}"):
        for r in edited.to_dict("records"):
            col = raw["tables"][r["table"]]["columns"][r["column"]]
            col["sensitivity"], col["description"] = r["sensitivity"], r["description"] or ""
        for t, g in gates.items():
            raw["tables"][t]["requires_finding"] = "any" if g == "any finding" else None
        catalog_mod.save(raw, ds["catalog"])
        st.toast("Catalogue saved", icon="✅")
        st.rerun()
    if c2.button("Refresh suggestions", key=f"refresh_{ds_name}"):
        with st.spinner("Profiling…"):
            entry = {k: v for k, v in config._raw_datasets()[ds_name].items()}
            problems = profile.suggest_problems(cat, ds["url"], ds.get("currency", "INR"))
            entry["suggested_problems"] = [p["problem"] for p in problems]
            if problems:
                entry["problem"] = problems[0]["problem"]
            try:
                entry["sample_questions"] = profile.sample_questions(cat, make_llm())
            except Exception as e:
                st.warning(f"Could not draft questions: {e}")
            config.save_dataset(ds_name, entry)
        st.rerun()

    with st.expander("Danger zone"):
        st.caption("Removes the dataset from the Studio. Uploaded data files are kept on disk.")
        if st.button(f"Remove '{ds['label']}' from the Studio", key=f"del_{ds_name}"):
            config.delete_dataset(ds_name)
            st.session_state.pop("select_dataset", None)
            st.rerun()


def render(ds_name: str, ds: dict, cat, make_llm):
    if st.session_state.get("onboarded"):
        r = st.session_state.pop("onboarded")
        st.success(f"**{r['name']}** is ready: {r['tables']} tables, {r['columns']} columns. Review the "
                   f"sensitivity labels below, then try the Investigation or Ask tabs.")
    render_add(make_llm)
    st.divider()
    render_catalog(ds_name, ds, cat, make_llm)
