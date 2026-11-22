"""Run InvestiGuard on each of ShopSim's planted incidents and grade the answers against the answer key.

    .venv/bin/python -m investiguard.bench.shopsim_eval            # all eight, writes benchmarks/shopsim_latest.json
    .venv/bin/python -m investiguard.bench.shopsim_eval S1 S4
"""
import json
import sys
import time

from .. import catalog, config, ledger
from ..agent.graph import Runtime, run
from ..llm import ChatLLM
from .runner import CountingLLM

OUT = config.ROOT / "benchmarks" / "shopsim_latest.json"


def grade(inc: dict, report: dict) -> dict:
    text = " ".join([report.get("root_cause", ""), report.get("plain_summary", ""), report.get("summary", ""),
                     " ".join(report.get("key_facts", []))]).lower()
    missing = [" / ".join(g) for g in inc["keywords"] if not any(k in text for k in g)]
    return {"found": not missing, "missing": missing}


def main(ids: list[str]) -> dict:
    ds = config.datasets()["shopsim"]
    cat = catalog.load(ds["catalog"])
    sensitive = {c for c in cat.all_columns() if cat.sensitivity(c) in ("confidential", "restricted")}
    rows = []
    for inc in ds["incidents"]:
        if ids and inc["id"] not in ids:
            continue
        llm = CountingLLM(ChatLLM(config.LLM_MODEL))
        rt = Runtime(catalog=cat, llm=llm, url=ds["url"], currency="INR")
        events: list[dict] = []
        t0 = time.time()
        try:
            final, error = run(inc["problem"], rt, events.append), None
        except Exception as e:  # a crash is a miss, not a crashed evaluation
            final, error = {"report": {"root_cause": "", "exposure": {}}}, str(e)[:300]
        rep = final["report"]
        exp = rep.get("exposure", {})
        need = set(inc["required"])
        granted = {r for c in rt.store.caps.values() for r in c.resources}
        row = {"id": inc["id"], "title": inc["title"], "month": inc["month"], "change": inc["change"], "error": error,
               "root_cause": rep.get("root_cause", ""), **grade(inc, rep),
               "columns_read": len(exp.get("columns_touched", [])), "columns_total": exp.get("columns_total", len(cat.all_columns())),
               "sensitive_raw": exp.get("sensitive_exposed_raw", []), "injections_blocked": exp.get("injections_blocked", 0),
               "permission_recall": round(len(granted & need) / len(need), 3) if need else None,
               "permission_precision": round(len(granted & need) / len(granted), 3) if granted else None,
               "column_seconds": ledger.privilege_timeline(events, len(cat.all_columns()), sensitive)["column_seconds"],
               "seconds": round(time.time() - t0, 1), "llm_calls": llm.calls}
        rows.append(row)
        print(f"{row['id']} found={row['found']} read={row['columns_read']}/{row['columns_total']} "
              f"{row['seconds']}s | {row['root_cause'][:110]}", flush=True)
    out = {"model": config.LLM_MODEL, "finished_at": time.time(), "rows": rows,
           "found": sum(r["found"] for r in rows), "total": len(rows)}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


if __name__ == "__main__":
    r = main(sys.argv[1:])
    print(f"found {r['found']} of {r['total']}")
