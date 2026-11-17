"""Runs inside the sandbox container: load /work/input.csv as `df`, exec /work/code.py, print `result`."""
import json
import sys
import traceback

import numpy as np
import pandas as pd

MARK = "<<<IG_RESULT>>>"


def main():
    df = pd.read_csv("/work/input.csv")
    scope = {"pd": pd, "np": np, "df": df}
    try:
        exec(compile(open("/work/code.py").read(), "analysis.py", "exec"), scope)
    except BaseException:
        print(MARK + json.dumps({"ok": False, "error": traceback.format_exc(limit=3)[-1500:]}))
        return
    res = scope.get("result")
    if res is None:
        print(MARK + json.dumps({"ok": False, "error": "the code must assign its output to a variable named `result`"}))
        return
    if isinstance(res, pd.Series):
        res = res.reset_index()
        res.columns = [str(c) for c in res.columns]
    if isinstance(res, pd.DataFrame):
        payload = {"type": "table", "columns": [str(c) for c in res.columns],
                   "rows": json.loads(res.head(500).to_json(orient="records", date_format="iso"))}
    elif isinstance(res, dict):
        payload = {"type": "table", "columns": ["key", "value"],
                   "rows": [{"key": str(k), "value": v if isinstance(v, (int, float, str, bool)) or v is None else str(v)}
                            for k, v in list(res.items())[:500]]}
    else:
        v = res.item() if hasattr(res, "item") else res
        payload = {"type": "table", "columns": ["value"], "rows": [{"value": v if isinstance(v, (int, float, str, bool)) else str(v)}]}
    print(MARK + json.dumps({"ok": True, **payload}, default=str))


if __name__ == "__main__":
    sys.exit(main())
