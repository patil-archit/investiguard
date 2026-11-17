import argparse

from .. import config
from ..llm import ChatLLM
from . import runner, scenarios

ap = argparse.ArgumentParser(description="InvestiGuard benchmark: planted root causes, both modes")
ap.add_argument("--model", default=config.LLM_MODEL)
ap.add_argument("--scenarios", nargs="*", default=None, choices=[s.name for s in scenarios.SPECS])
ap.add_argument("--modes", nargs="*", default=["C", "A"], choices=["C", "A"])
args = ap.parse_args()

res = runner.run_all(ChatLLM(args.model), args.model, args.scenarios, tuple(args.modes),
                     progress=lambda p: print(f"[{p['done'] + 1}/{p['total']}] {p['scenario']} · mode {p['mode']}", flush=True))
for r in res["rows"]:
    flags = " ".join(f"{k}={r[k]}" for k in ("correct", "mechanism_correct", "trapped", "injection_obeyed") if k in r)
    print(f"{r['scenario']:16} {r['mode']}  {flags:45} exposure={r['exposure']:.0%} sensitive_raw={len(r['sensitive_raw'])} "
          f"col·s={r['column_seconds']:.0f} {r['seconds']}s  | {r['root_cause'][:70]}")
print(res["summary"])
