"""InvestiGuard web API (FastAPI). Serves the React frontend from frontend/dist when it has been built.

    .venv/bin/uvicorn server.api:app --port 8765
"""
import asyncio
import json
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.engine import make_url

from investiguard import ask as ask_mod
from investiguard import catalog as catalog_mod
from investiguard import config, db, explain, profile
from investiguard.agent.direct import run_direct
from investiguard.agent.graph import Runtime, build_graph, run
from investiguard.ingest import SUPPORTED, ingest_uploads, slug
from investiguard.llm import ChatLLM
from investiguard.onboard import onboard

app = FastAPI(title="InvestiGuard API")
DIST = config.ROOT / "frontend" / "dist"
RUNS: dict[str, dict] = {}             # investigation id -> run record (in memory)
LATEST: dict[tuple[str, str], str] = {}  # (dataset, mode) -> latest run id, for the A vs C comparison


def _plain(obj):
    """JSON-safe copy: numpy scalars -> Python, NaN/inf -> None, Paths/objects -> str/dict."""
    if isinstance(obj, dict):
        return {str(k): _plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_plain(v) for v in obj]
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float):
        return obj if np.isfinite(obj) else None
    if obj is None or isinstance(obj, (str, int, bool)):
        return obj
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if hasattr(obj, "__dict__"):
        return _plain(vars(obj))
    return str(obj)


def _llm(model: str | None):
    if model == "scripted-demo":  # offline smoke test, demo dataset only
        from tests.test_agent_graph import ScriptedLLM
        return ScriptedLLM()
    return ChatLLM(model or config.LLM_MODEL)


def _dataset(name: str) -> dict:
    ds = config.datasets().get(name)
    if not ds:
        raise HTTPException(404, f"unknown dataset {name}")
    if not ds["catalog"].exists():
        raise HTTPException(409, f"catalogue missing for {name}")
    return ds


# ---------------- datasets & catalogue ----------------
@app.get("/api/config")
def get_config():
    return {"model": config.LLM_MODEL, "formats": sorted(e.lstrip(".") for e in SUPPORTED)}


@app.get("/api/datasets")
def list_datasets():
    out = []
    for name, ds in config.datasets().items():
        item = {"name": name, "label": ds["label"], "currency": ds.get("currency", "INR"),
                "problem": ds.get("problem", ""), "suggested_problems": ds.get("suggested_problems") or
                [ds.get("problem", "")], "sample_questions": ds.get("sample_questions", []), "ready": False}
        try:
            u = make_url(ds["url"])
            item["source"] = (f"sqlite · {Path(u.database).name}" if u.drivername.startswith("sqlite")
                              else f"{u.drivername.split('+')[0]} · {u.host}/{u.database}")
        except Exception:
            item["source"] = "unknown"
        if ds["catalog"].exists():
            cat = catalog_mod.load(ds["catalog"])
            cols = cat.all_columns()
            item.update(ready=True, tables=len(cat.tables), columns=len(cols),
                        sensitive=sum(cat.sensitivity(c) in ("confidential", "restricted") for c in cols))
        out.append(item)
    return out


@app.get("/api/datasets/{name}/catalog")
def get_catalog(name: str):
    return catalog_mod.load_raw(_dataset(name)["catalog"])


class CatalogIn(BaseModel):
    tables: dict


@app.put("/api/datasets/{name}/catalog")
def put_catalog(name: str, body: CatalogIn):
    ds = _dataset(name)
    current = catalog_mod.load_raw(ds["catalog"])
    for t, info in body.tables.items():  # only labels, descriptions and gates are editable
        if t not in current["tables"]:
            continue
        cur = current["tables"][t]
        cur["description"] = info.get("description", cur.get("description", ""))
        cur["requires_finding"] = info.get("requires_finding")
        for c, m in info.get("columns", {}).items():
            if c in cur["columns"]:
                if m.get("sensitivity") in catalog_mod.LEVELS:
                    cur["columns"][c]["sensitivity"] = m["sensitivity"]
                cur["columns"][c]["description"] = m.get("description", "")
    catalog_mod.save(current, ds["catalog"])
    return {"ok": True}


@app.delete("/api/datasets/{name}")
def delete_dataset(name: str):
    config.delete_dataset(name)
    return {"ok": True}


@app.post("/api/datasets/{name}/refresh")
def refresh_dataset(name: str, model: str | None = None):
    ds = _dataset(name)
    cat = catalog_mod.load(ds["catalog"])
    entry = dict(config._raw_datasets()[name])
    problems = profile.suggest_problems(cat, ds["url"], ds.get("currency", "INR"))
    if problems:
        entry["suggested_problems"] = [p["problem"] for p in problems]
        entry["problem"] = problems[0]["problem"]
    entry["sample_questions"] = profile.sample_questions(cat, _llm(model))
    config.save_dataset(name, entry)
    return {"ok": True}


@app.post("/api/datasets/upload")
def upload_dataset(files: list[UploadFile] = File(...), name: str = Form(...), label: str = Form(""),
                   currency: str = Form("INR"), describe: bool = Form(True), model: str = Form("")):
    try:
        url, tables = ingest_uploads([(f.filename, f.file.read()) for f in files], name)
        result = onboard(name, label or name, url, currency, _llm(model), describe)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _plain({"dataset": result["name"], "tables": {t: {"rows": r, "columns": c} for t, (r, c) in tables.items()},
                   "problems": result["problems"], "questions": result["questions"]})


class ConnectIn(BaseModel):
    name: str
    label: str = ""
    url: str
    currency: str = "INR"
    describe: bool = True
    model: str = ""


@app.post("/api/datasets/connect")
def connect_dataset(body: ConnectIn):
    try:
        tables = db.introspect(body.url)
    except Exception as e:
        raise HTTPException(400, f"could not connect: {str(e).splitlines()[0]}")
    env_key = config.store_secret_url(slug(body.name), body.url) if make_url(body.url).password else None
    result = onboard(body.name, body.label or body.name, body.url, body.currency, _llm(body.model),
                     body.describe, url_env=env_key)
    return _plain({"dataset": result["name"], "tables": len(tables), "problems": result["problems"]})


# ---------------- ask ----------------
class AskIn(BaseModel):
    dataset: str
    question: str
    mode: str = "C"
    model: str = ""


@app.post("/api/ask")
def ask(body: AskIn):
    ds = _dataset(body.dataset)
    cat = catalog_mod.load(ds["catalog"])
    r = ask_mod.ask(body.question, cat, _llm(body.model), ds["url"], body.mode, currency=ds.get("currency", "INR"))
    rows = [] if r.df is None else json.loads(r.df.head(500).to_json(orient="records", date_format="iso"))
    return _plain({
        "question": r.question, "answer": r.answer, "sql": r.sql, "denied": r.denied, "seconds": round(r.seconds, 2),
        "columns": [] if r.df is None else [str(c) for c in r.df.columns], "rows": rows,
        "total_rows": 0 if r.df is None else len(r.df), "chart": r.chart, "x": r.x, "y": r.y,
        "granted": r.columns_granted, "attempts": r.attempts})


# ---------------- investigations (background thread + server-sent events) ----------------
class InvestigateIn(BaseModel):
    dataset: str
    problem: str
    mode: str = "C"
    model: str = ""


@app.post("/api/investigations")
def start_investigation(body: InvestigateIn):
    ds = _dataset(body.dataset)
    cat = catalog_mod.load(ds["catalog"])
    rid = uuid.uuid4().hex[:10]
    rec = {"id": rid, "dataset": body.dataset, "mode": body.mode, "problem": body.problem, "status": "running",
           "events": [], "result": None, "error": None, "started": time.time(), "seconds": None}
    RUNS[rid] = rec

    def work():
        try:
            rt = Runtime(catalog=cat, llm=_llm(body.model), mode=body.mode, url=ds["url"],
                         currency=ds.get("currency", "INR"))
            # Mode C: hypothesis-driven InvestiGuard. Mode A: the Direct AI baseline it is compared against.
            runner = run_direct if body.mode == "A" else run
            final = runner(body.problem, rt, lambda ev: rec["events"].append(_plain(ev)))
            rec["result"] = _plain({"report": final["report"], "hypotheses": final.get("hypotheses", {}),
                                    "evidence": final.get("evidence", []), "steps": final.get("steps", []),
                                    "gateway_log": [vars(q) for q in rt.gateway.log]})
            rec["status"] = "done"
            LATEST[(body.dataset, body.mode)] = rid
        except Exception as e:
            rec["error"], rec["status"] = str(e), "error"
        finally:
            rec["seconds"] = round(time.time() - rec["started"], 1)

    threading.Thread(target=work, daemon=True).start()
    return {"id": rid}


@app.get("/api/investigations/{rid}")
def get_investigation(rid: str):
    rec = RUNS.get(rid)
    if not rec:
        raise HTTPException(404, "unknown investigation")
    return {k: v for k, v in rec.items() if k != "events"} | {"event_count": len(rec["events"])}


@app.get("/api/investigations/{rid}/events")
async def stream_events(rid: str):
    rec = RUNS.get(rid)
    if not rec:
        raise HTTPException(404, "unknown investigation")

    async def gen():
        sent = 0
        while True:
            while sent < len(rec["events"]):
                yield f"data: {json.dumps(rec['events'][sent])}\n\n"
                sent += 1
            if rec["status"] != "running" and sent >= len(rec["events"]):
                yield f"event: end\ndata: {json.dumps({'status': rec['status'], 'error': rec['error']})}\n\n"
                return
            await asyncio.sleep(0.25)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/compare/{dataset}")
def compare(dataset: str):
    out = []
    for mode in ("C", "A"):
        rid = LATEST.get((dataset, mode))
        if rid and RUNS[rid]["result"] and not RUNS[rid]["result"]["report"].get("not_investigation"):
            rep = RUNS[rid]["result"]["report"]
            out.append({"mode": mode, "root_cause": rep["root_cause"], "exposure": rep["exposure"],
                        "verified": not rep.get("unverified", False),
                        "seconds": RUNS[rid]["seconds"], "problem": RUNS[rid]["problem"]})
    return out


# ---------------- architecture ----------------
@app.get("/api/architecture/{dataset}")
def architecture(dataset: str):
    cat = catalog_mod.load(_dataset(dataset)["catalog"])
    graph = build_graph(Runtime(catalog=cat, llm=None))
    rows = lambda data, keys: [dict(zip(keys, r)) for r in data]
    return {
        "orchestration": explain.orchestration_mermaid(graph),
        "nodes": rows(explain.NODES, ["node", "who", "reads", "produces", "guards"]),
        "state": rows(explain.STATE, ["field", "holds"]),
        "threats": rows(explain.THREATS, ["threat", "stopped_by", "status"]),
        "policy": rows(explain.POLICY, ["rule", "name", "enforces"]),
        "evidence": rows(explain.EVIDENCE_RULES, ["condition", "verdict"]),
        "stop": {"share": config.STOP_EXPLAINED_SHARE, "iterations": config.MAX_ITERATIONS},
    }


# ---------------- frontend ----------------
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    target = DIST / path
    if path and target.is_file():
        return FileResponse(target)
    if (DIST / "index.html").exists():  # never cache the shell, so a new build is picked up immediately
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
    return {"message": "Frontend not built. Run: cd frontend && npm install && npm run build"}
