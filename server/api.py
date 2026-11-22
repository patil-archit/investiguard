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
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.engine import make_url

from investiguard import ask as ask_mod
from investiguard import catalog as catalog_mod
from investiguard import config, db, explain, ledger, profile, quality, sandbox, shopsim, threats
from server import security
from investiguard.bench import runner as bench_runner
from investiguard.agent.direct import run_direct
from investiguard.agent.graph import Runtime, build_graph, run
from investiguard.ingest import SUPPORTED, ingest, ingest_report, ingest_uploads, slug
from investiguard.llm import ChatLLM
from investiguard.onboard import onboard

app = FastAPI(title="InvestiGuard API", docs_url=None, redoc_url=None, openapi_url=None)
app.middleware("http")(security.middleware)
THREAT_LAST: dict = {"results": [], "summary": None, "finished_at": None, "sandbox": None}
DIST = config.ROOT / "frontend" / "dist"
RUNS: dict[str, dict] = {}             # investigation id -> run record (in memory)
LATEST: dict[tuple[str, str], str] = {}  # (dataset, mode) -> latest run id, for the A vs C comparison
RUNS_DIR = config.ROOT / "data" / "runs"
APPROVAL_TIMEOUT_S = 180
BENCH: dict = {"status": "idle", "progress": None, "error": None}
_PRIVATE = {"events", "pending"}       # run-record keys that are not returned with the record itself


def _load_saved_runs() -> None:
    """Finished runs are kept on disk so reports, receipts and the comparison survive a restart."""
    saved = sorted(RUNS_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime)[-60:] if RUNS_DIR.exists() else []
    for f in saved:
        try:
            rec = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        RUNS[rec["id"]] = rec
        if rec.get("status") == "done":
            LATEST[(rec["dataset"], rec["mode"])] = rec["id"]


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
                "problem": ds.get("problem", ""), "incidents": len(ds.get("incidents") or []),
                "generated": ds.get("generated"), "suggested_problems": ds.get("suggested_problems") or
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
    dataset: str = Field(max_length=120)
    question: str = Field(min_length=2, max_length=1000)
    mode: str = "C"
    model: str = ""


@app.post("/api/ask")
def ask(body: AskIn):
    ds = _dataset(body.dataset)
    cat = catalog_mod.load(ds["catalog"])
    mode = "A" if body.mode == "A" else "C"   # Ask has no table allowlist, so System B asks like C
    r = ask_mod.ask(body.question, cat, _llm(body.model), ds["url"], mode, currency=ds.get("currency", "INR"))
    rows = [] if r.df is None else json.loads(r.df.head(500).to_json(orient="records", date_format="iso"))
    return _plain({
        "question": r.question, "answer": r.answer, "sql": r.sql, "denied": r.denied, "seconds": round(r.seconds, 2),
        "columns": [] if r.df is None else [str(c) for c in r.df.columns], "rows": rows,
        "total_rows": 0 if r.df is None else len(r.df), "chart": r.chart, "x": r.x, "y": r.y,
        "granted": r.columns_granted, "attempts": r.attempts, "analysis": r.analysis,
        "injections_blocked": r.injections_blocked})


# ---------------- investigations (background thread + server-sent events) ----------------
class InvestigateIn(BaseModel):
    dataset: str = Field(max_length=120)
    problem: str = Field(min_length=3, max_length=2000)
    mode: Literal["A", "B", "C"] = "C"
    model: str = Field("", max_length=120)
    approvals: bool = False   # ask the analyst before an evidence-gate or budget denial is final
    allow_tables: list[str] = Field(default_factory=list, max_length=50)  # System B allowlist


@app.post("/api/investigations")
def start_investigation(body: InvestigateIn):
    ds = _dataset(body.dataset)
    cat = catalog_mod.load(ds["catalog"])
    rid = uuid.uuid4().hex[:10]
    rec = {"id": rid, "dataset": body.dataset, "mode": body.mode, "problem": body.problem, "status": "running",
           "events": [], "result": None, "error": None, "started": time.time(), "seconds": None, "pending": {}}
    RUNS[rid] = rec

    def approver(ask: dict) -> bool:
        """Blocks the run until the analyst answers in the UI (or the wait times out, which means no)."""
        slot = {"event": threading.Event(), "approved": False}
        rec["pending"][ask["hypothesis"]] = slot
        slot["event"].wait(APPROVAL_TIMEOUT_S)
        rec["pending"].pop(ask["hypothesis"], None)
        return slot["approved"]

    def work():
        try:
            allow = [t for t in body.allow_tables if t in cat.tables] or (
                sorted(cat.tables)[:2] if body.mode == "B" else [])
            rt = Runtime(catalog=cat, llm=_llm(body.model), mode=body.mode, url=ds["url"],
                         currency=ds.get("currency", "INR"), allow_tables=allow,
                         approver=approver if body.approvals and body.mode == "C" else None)
            # Mode C: hypothesis-driven InvestiGuard. Mode A: the Direct AI baseline it is compared against.
            runner = run_direct if body.mode in ("A", "B") else run
            final = runner(body.problem, rt, lambda ev: rec["events"].append(_plain(ev)))
            rec["result"] = _plain({"report": final["report"], "hypotheses": final.get("hypotheses", {}),
                                    "evidence": final.get("evidence", []), "steps": final.get("steps", []),
                                    "gateway_log": [vars(q) for q in rt.gateway.log]})
            sensitive = {c for c in cat.all_columns() if cat.sensitivity(c) in ("confidential", "restricted")}
            rec["result"]["privilege"] = ledger.privilege_timeline(rec["events"], len(cat.all_columns()), sensitive)
            rec["result"]["firewall"] = _plain(rt.firewall_hits)
            rec["result"]["answer_check"] = answer_check(ds, body.problem, final["report"])
            # Seal the hash chain over every event of the run: the tamper-evident access receipt.
            rec["result"]["receipt"] = ledger.seal(rid, rec["events"])
            rec["status"] = "done"
            LATEST[(body.dataset, body.mode)] = rid
        except Exception as e:
            rec["error"], rec["status"] = str(e), "error"
        finally:
            rec["seconds"] = round(time.time() - rec["started"], 1)
            try:
                RUNS_DIR.mkdir(parents=True, exist_ok=True)
                (RUNS_DIR / f"{rid}.json").write_text(json.dumps({k: v for k, v in rec.items() if k != "pending"}))
            except OSError:
                pass

    threading.Thread(target=work, daemon=True).start()
    return {"id": rid}


@app.get("/api/investigations/{rid}")
def get_investigation(rid: str):
    rec = RUNS.get(rid)
    if not rec:
        raise HTTPException(404, "unknown investigation")
    return {k: v for k, v in rec.items() if k not in _PRIVATE} | {"event_count": len(rec["events"])}


class ApprovalIn(BaseModel):
    hypothesis: str
    approve: bool


@app.post("/api/investigations/{rid}/approvals")
def decide_approval(rid: str, body: ApprovalIn):
    slot = (RUNS.get(rid) or {}).get("pending", {}).get(body.hypothesis)
    if not slot:
        raise HTTPException(404, "no approval is waiting for that hypothesis")
    slot["approved"] = body.approve
    slot["event"].set()
    return {"ok": True}


@app.get("/api/investigations/{rid}/ledger")
def get_ledger(rid: str, tamper: bool = False):
    """The hash-chained event log and its receipt, re-verified now. `tamper=true` shows what a single
    edited entry does to the verification (on a copy; the stored log is untouched)."""
    rec = RUNS.get(rid)
    if not rec or not rec.get("result") or not rec["result"].get("receipt"):
        raise HTTPException(404, "no sealed ledger for that investigation")
    events = rec["events"]
    if tamper and events:
        events = [dict(e) for e in events]
        victim = next((e for e in events if e["kind"] == "cap_granted"), events[0])
        victim["resources"] = {"*": "clear"}
    hashes = ledger.chain(events)
    return {"receipt": rec["result"]["receipt"], "verification": ledger.verify(events, rec["result"]["receipt"]),
            "tampered": tamper,
            "entries": [{"i": i, "t": e["t"], "kind": e["kind"], "hypothesis": e.get("hypothesis") if isinstance(
                e.get("hypothesis"), str) else (e.get("hypothesis") or {}).get("id"), "hash": h}
                        for i, (e, h) in enumerate(zip(events, hashes))]}


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
    for mode in ("C", "B", "A"):
        rid = LATEST.get((dataset, mode))
        if rid and RUNS[rid]["result"] and not RUNS[rid]["result"]["report"].get("not_investigation"):
            rep = RUNS[rid]["result"]["report"]
            out.append({"mode": mode, "root_cause": rep["root_cause"], "exposure": rep["exposure"],
                        "privilege": RUNS[rid]["result"].get("privilege"),
                        "verified": not rep.get("unverified", False),
                        "seconds": RUNS[rid]["seconds"], "problem": RUNS[rid]["problem"]})
    return out


# ---------------- system status and benchmark ----------------
@app.get("/api/system")
def system_status(refresh: bool = False):
    return {"sandbox": sandbox.status(refresh), "sandbox_image": sandbox.IMAGE}


@app.get("/api/security")
def security_status():
    return {"controls": security.controls(), "stats": security.STATS,
            "signing_key": {"key_id": ledger.key_id(config.CAP_SECRET), "source":
                            "CAP_SECRET env" if config.os.getenv("CAP_SECRET") == config.CAP_SECRET else "data/.signing_key (0600)"},
            "sandbox": sandbox.status()}


# ---------------- threat lab (synopsis Table 7.2) ----------------
@app.get("/api/threats")
def threat_catalogue():
    return threats.catalogue() | {"last": THREAT_LAST}


@app.get("/api/threats/run")
def run_threats(only: str = ""):
    """Streams one result per attack as it is tried against the real components, then a summary."""
    classes = [c for c in only.split(",") if c in threats.CLASSES] or None
    sandbox.status(refresh=True)

    def gen():
        results = []
        for r in threats.run_suite(classes):
            results.append(r)
            yield f"data: {json.dumps(_plain(r))}\n\n"
        summary = threats.summarise(results)
        if not classes:
            THREAT_LAST.update(results=results, summary=summary, finished_at=time.time(), sandbox=sandbox.status())
        yield f"event: end\ndata: {json.dumps(_plain(summary))}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/benchmark")
def get_benchmark():
    shop = config.ROOT / "benchmarks" / "shopsim_latest.json"
    return {"state": {k: BENCH[k] for k in ("status", "progress", "error")}, "results": bench_runner.load(),
            "shopsim": json.loads(shop.read_text()) if shop.exists() else None}


class BenchIn(BaseModel):
    model: str = ""
    scenarios: list[str] | None = None


@app.post("/api/benchmark/run")
def run_benchmark(body: BenchIn):
    if BENCH["status"] == "running":
        raise HTTPException(409, "a benchmark is already running")
    if body.model == "scripted-demo":
        raise HTTPException(400, "the benchmark needs a real model; the scripted demo model only knows the demo dataset")
    BENCH.update(status="running", progress=None, error=None)

    def work():
        try:
            model = body.model or config.LLM_MODEL
            bench_runner.run_all(_llm(model), model, body.scenarios, progress=lambda p: BENCH.update(progress=p))
            BENCH.update(status="idle", progress=None)
        except Exception as e:
            BENCH.update(status="idle", error=str(e)[:300])

    threading.Thread(target=work, daemon=True).start()
    return {"ok": True}


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


# ---------------- known answers (datasets with planted incidents) ----------------
def answer_check(ds: dict, problem: str, report: dict) -> dict | None:
    """When the problem is one of a dataset's planted incidents, score the report against the answer key."""
    incidents = ds.get("incidents") or []
    inc = next((i for i in incidents if i["problem"].strip() == problem.strip()), None)
    if not inc:
        return None
    text = " ".join([report.get("root_cause", ""), report.get("plain_summary", ""), report.get("summary", ""),
                     " ".join(report.get("key_facts", []))]).lower()
    missing = [g for g in inc["keywords"] if not any(k in text for k in g)]
    return {"incident": inc["id"], "title": inc["title"], "cause": inc["cause"], "found": not missing,
            "missing": [" / ".join(g) for g in missing], "required": inc["required"]}


@app.get("/api/datasets/{name}/answers")
def dataset_answers(name: str):
    ds = _dataset(name)
    return {"incidents": ds.get("incidents") or [], "decoys": ds.get("decoys") or [], "generated": ds.get("generated")}


# ---------------- data health: quality, PII scan, relationship map, ingest log ----------------
def _cat_url(name: str):
    ds = _dataset(name)
    return catalog_mod.load(ds["catalog"]), ds["url"], ds


def _stamp(url: str) -> float:
    try:
        u = make_url(url)
        return Path(u.database).stat().st_mtime if u.drivername.startswith("sqlite") else 0.0
    except Exception:
        return 0.0


@app.get("/api/datasets/{name}/quality")
def dataset_quality(name: str):
    cat, url, _ = _cat_url(name)
    return _plain(quality.cached(("q", name, _stamp(url)), lambda: quality.profile(cat, url)))


@app.get("/api/datasets/{name}/pii")
def dataset_pii(name: str):
    cat, url, ds = _cat_url(name)
    return _plain(quality.cached(("p", name, _stamp(url), ds["catalog"].stat().st_mtime), lambda: quality.pii_scan(cat, url)))


class PiiApplyIn(BaseModel):
    resources: list[str] = Field(max_length=500)


@app.post("/api/datasets/{name}/pii/apply")
def dataset_pii_apply(name: str, body: PiiApplyIn):
    """Raise the sensitivity of the chosen columns to what the scan suggested (never lowers a label)."""
    cat, url, ds = _cat_url(name)
    scan = quality.pii_scan(cat, url)
    want = {f["resource"]: f["suggested"] for f in scan["findings"] if f["resource"] in body.resources}
    raw = catalog_mod.load_raw(ds["catalog"])
    changed = []
    for res, level in want.items():
        t, c = res.split(".", 1)
        meta = raw["tables"][t]["columns"][c]
        if catalog_mod.LEVELS.index(level) > catalog_mod.LEVELS.index(meta["sensitivity"]):
            meta["sensitivity"] = level
            changed.append(res)
    catalog_mod.save(raw, ds["catalog"])
    return {"changed": changed}


@app.get("/api/datasets/{name}/schema")
def dataset_schema(name: str):
    cat, url, _ = _cat_url(name)
    return _plain(quality.cached(("s", name, _stamp(url)), lambda: quality.schema_map(cat, url)))


@app.get("/api/datasets/{name}/ingest-report")
def dataset_ingest_report(name: str):
    return ingest_report(name) or {"dataset": name, "tables": [], "note": "no ingest log (built-in or connected dataset)"}


# ---------------- background jobs: big uploads and dataset generation ----------------
JOBS: dict[str, dict] = {}


def _job(kind: str, fn) -> str:
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "kind": kind, "status": "running", "message": "Starting…", "progress": 0.0, "result": None,
           "error": None, "started": time.time()}
    JOBS[jid] = job

    def step(msg: str, frac: float):
        job.update(message=msg, progress=round(min(1.0, max(job["progress"], frac)), 3))

    def work():
        try:
            job["result"] = _plain(fn(step))
            job.update(status="done", progress=1.0, message="Done")
        except Exception as e:
            job.update(status="error", error=str(e)[:400])
        finally:
            job["seconds"] = round(time.time() - job["started"], 1)

    threading.Thread(target=work, daemon=True).start()
    return jid


@app.get("/api/jobs/{jid}")
def get_job(jid: str):
    if jid not in JOBS:
        raise HTTPException(404, "unknown job")
    return JOBS[jid]


@app.post("/api/datasets/shopsim")
def generate_shopsim(scale: float = 1.0):
    if not 0.01 <= scale <= 1.0:
        raise HTTPException(400, "scale must be between 0.01 and 1")
    if any(j["kind"] == "shopsim" and j["status"] == "running" for j in JOBS.values()):
        raise HTTPException(409, "ShopSim is already being generated")
    return {"job": _job("shopsim", lambda step: shopsim.build(scale, progress=step))}


@app.post("/api/datasets/upload-stream")
async def upload_stream(files: list[UploadFile] = File(...), name: str = Form(...), label: str = Form(""),
                        currency: str = Form("INR"), describe: bool = Form(True), model: str = Form("")):
    """Big-file upload: each file is streamed to disk in 1 MB pieces (never held in memory), then loaded in
    the background (CSV in chunks) while the client polls /api/jobs/{id} for progress."""
    tmp = config.ROOT / "data" / "datasets" / f".upload_{slug(name)}_{uuid.uuid4().hex[:6]}"
    tmp.mkdir(parents=True, exist_ok=True)
    paths, limit = [], security.MAX_BODY_MB * 1024 * 1024
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in SUPPORTED:
            raise HTTPException(400, f"unsupported file type {ext or '(none)'}")
        dest = tmp / Path(f.filename).name
        written = 0
        with dest.open("wb") as out:
            while chunk := await f.read(1024 * 1024):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(413, f"{f.filename} is over {security.MAX_BODY_MB} MB")
                out.write(chunk)
        paths.append(dest)

    def run(step):
        try:
            url, tables = ingest(paths, name, progress=lambda m, fr: step(m, 0.05 + 0.6 * fr))
            step("Labelling sensitivity, writing descriptions, finding problems", 0.7)
            result = onboard(name, label or name, url, currency, _llm(model), describe,
                             progress=lambda m: step(m, 0.8))
            return {"dataset": result["name"], "tables": {t: {"rows": r, "columns": c} for t, (r, c) in tables.items()},
                    "problems": result["problems"]}
        finally:
            for p in paths:
                p.unlink(missing_ok=True)
            tmp.rmdir()

    return {"job": _job("upload", run)}


_load_saved_runs()

# ---------------- frontend ----------------
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    target = (DIST / path).resolve()
    if path and target.is_file() and target.is_relative_to(DIST.resolve()):
        return FileResponse(target)
    if (DIST / "index.html").exists():  # never cache the shell, so a new build is picked up immediately
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
    return {"message": "Frontend not built. Run: cd frontend && npm install && npm run build"}
