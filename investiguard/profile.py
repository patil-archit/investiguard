"""Dataset profiling for newly added datasets.

- suggest_problems: deterministic. Finds date and value columns, computes period-over-period change in
  code, and proposes "X fell/rose by N% ... find the root cause" problems for the Investigation tab.
- sample_questions / describe_catalog: LLM drafts example questions and column descriptions from the
  catalogue. Only non-sensitive columns ever have sample values shown to the LLM.

Profiling is an owner action at registration time and reads the database directly (read-only),
not through the agent's capability gateway.
"""
import re
from datetime import date

import pandas as pd
from pydantic import BaseModel, Field

from . import db
from .agent.evidence import money
from .catalog import Catalog

_NUMERIC = re.compile(r"INT|FLOAT|REAL|NUM|DOUBLE|DEC", re.I)
_ID_LIKE = re.compile(r"(^id$|_id$|^id_|_no$|_code$|code$|_key$|zip|pin|phone|year|_num$|number$|lat|lon)")
_NON_ADDITIVE = re.compile(r"price|rate|ratio|pct|percent|avg|mean|score|level|share|margin|age$|_rank")
_MEASURE_HINT = ["revenue", "sales", "amount", "value", "total", "spend", "cost", "price", "profit",
                 "qty", "quantity", "units", "count", "volume"]
_PERIOD = re.compile(r"date|time|_at$|_ts$|month|period|day")
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _month_expr(col: str, dialect: str) -> str:
    if dialect == "postgres":
        return f"to_char({col}, 'YYYY-MM')"
    if dialect == "mysql":
        return f"DATE_FORMAT({col}, '%Y-%m')"
    return f"substr({col}, 1, 7)"


def _measures(cat: Catalog, table: str) -> list[str]:
    cols = [c for c, m in cat.tables[table].columns.items()
            if _NUMERIC.search(m.get("type", "")) and m["sensitivity"] in ("public", "internal")
            and not _ID_LIKE.search(c) and not _NON_ADDITIVE.search(c)]

    def rank(c):
        hits = [i for i, h in enumerate(_MEASURE_HINT) if h in c]
        return hits[0] if hits else len(_MEASURE_HINT)
    return sorted(cols, key=rank)


def _date_columns(cat: Catalog, table: str, url: str) -> list[str]:
    out = []
    for c, m in cat.tables[table].columns.items():
        if m["sensitivity"] not in ("public", "internal"):
            continue
        typ = m.get("type", "").upper()
        if "DATE" in typ or "TIME" in typ or _PERIOD.search(c):
            try:
                v = db.run_readonly(f"SELECT MIN({c}) AS lo, MAX({c}) AS hi FROM {table}", url).iloc[0]
            except Exception:
                continue
            if v["lo"] is not None and _ISO.match(str(v["lo"])) and _ISO.match(str(v["hi"])):
                out.append(c)
    return out


def date_spans(cat: Catalog, table: str, url: str) -> dict[str, tuple[str, str]]:
    out = {}
    for c in _date_columns(cat, table, url):
        v = db.run_readonly(f"SELECT MIN({c}) AS lo, MAX({c}) AS hi FROM {table}", url).iloc[0]
        out[c] = (str(v["lo"])[:10], str(v["hi"])[:10])
    return out


def _label(months: list[str]) -> tuple[str, str, str]:
    """('Apr 2024 – Mar 2025', '2024-04-01', '2025-03-31') for a list of 'YYYY-MM'."""
    first, last = months[0], months[-1]
    y, m = map(int, last.split("-"))
    end = (date(y + (m == 12), m % 12 + 1, 1) - pd.Timedelta(days=1)).isoformat()
    fmt = lambda ym: date(int(ym[:4]), int(ym[5:]), 1).strftime("%b %Y")
    name = fmt(first) if first == last else f"{fmt(first)} – {fmt(last)}"
    return name, f"{first}-01", str(end)


def suggest_problems(cat: Catalog, url: str, currency: str = "INR", limit: int = 3) -> list[dict]:
    dialect = db.sqlglot_dialect(url)
    found = []
    for table in cat.tables:
        dates, measures = _date_columns(cat, table, url), _measures(cat, table)
        if not dates or not measures:
            continue
        dcol = dates[0]
        for mcol in measures[:2]:
            sql = (f"SELECT {_month_expr(dcol, dialect)} AS ym, SUM({mcol}) AS v, MAX({dcol}) AS last_day "
                   f"FROM {table} WHERE {dcol} IS NOT NULL GROUP BY 1 ORDER BY 1")
            try:
                monthly = db.run_readonly(sql, url).dropna(subset=["ym"])
            except Exception:
                continue
            if len(monthly) >= 2 and int(str(monthly["last_day"].iloc[-1])[8:10]) < 25:
                monthly = monthly.iloc[:-1]  # latest month looks incomplete
            n = len(monthly)
            windows = []
            if n >= 24:
                windows.append(12)
            if n >= 6:
                windows.append(3)
            if n >= 2:
                windows.append(1)
            for w in windows:
                inc, base = monthly.iloc[-w:], monthly.iloc[-2 * w:-w]
                _add(found, table, mcol, dcol, base, inc, currency, rank=w)
            if n >= 3:  # sharpest single-month move in the last year
                recent = monthly.tail(13).reset_index(drop=True)
                ch = (recent["v"] / recent["v"].shift(1) - 1).abs()
                i = int(ch.idxmax()) if ch.notna().any() else None
                if i:
                    _add(found, table, mcol, dcol, recent.iloc[i - 1:i], recent.iloc[i:i + 1], currency, rank=0)
    best, seen = [], set()
    # Longer windows first (a year-on-year change is more meaningful than one noisy month), then size.
    for p in sorted(found, key=lambda p: (-p["rank"], -abs(p["daily_change_pct"]))):
        key = (p["table"], p["measure"], p["period"])
        if key not in seen and abs(p["daily_change_pct"]) >= 0.03:
            seen.add(key)
            best.append(p)
    return best[:limit]


def _add(found, table, mcol, dcol, base, inc, currency, rank):
    b, i = float(base["v"].sum()), float(inc["v"].sum())
    if not b:
        return
    pct = (i - b) / abs(b)
    inc_name, inc_lo, inc_hi = _label(list(inc["ym"]))
    base_name, base_lo, base_hi = _label(list(base["ym"]))
    days = lambda lo, hi: (date.fromisoformat(hi) - date.fromisoformat(lo)).days + 1
    # Per-day comparison so a 31-day month is not "up 11%" on a 28-day month.
    daily = (i / days(inc_lo, inc_hi)) / (b / days(base_lo, base_hi)) - 1
    measure = mcol.replace("_", " ")
    direction = "fell" if pct < 0 else "rose"
    money_like = any(h in mcol for h in ("revenue", "sales", "amount", "value", "spend", "cost", "price", "inr"))
    fmt = (lambda x: money(x, currency)) if money_like else (lambda x: f"{x:,.0f}")
    found.append({
        "table": table, "measure": mcol, "period": inc_name, "change_pct": round(pct, 4),
        "daily_change_pct": round(daily, 4), "rank": rank,
        "problem": (f"Total {measure} (sum of {table}.{mcol}) {direction} by {abs(pct):.0%} in {inc_name} "
                    f"({inc_lo} to {inc_hi}) compared with {base_name} ({base_lo} to {base_hi}), "
                    f"from {fmt(b)} to {fmt(i)}, using {table}.{dcol} as the date. Find the root cause."),
    })


# ---------------- LLM-assisted (catalogue only; sample values only for non-sensitive columns) ----------------
class SampleQuestions(BaseModel):
    questions: list[str] = Field(description="Plain-English questions a business user could ask of this data")


class ColumnNote(BaseModel):
    column: str
    description: str = Field(description="One short line: what the column means, units, coding")


class TableNotes(BaseModel):
    table_description: str = Field(description="One or two lines: what one row represents and the time span")
    columns: list[ColumnNote]


def sample_questions(cat: Catalog, llm, n: int = 8) -> list[str]:
    out = llm.ask(SampleQuestions, "You help business users explore a database.",
                  f"Catalogue:\n{cat.describe()}\n\nWrite {n} varied, concrete questions answerable with ONE SQL "
                  "query over these tables: totals over time, top-N rankings, comparisons between periods, "
                  "breakdowns by category, counts. Use real table/column meanings, not column names. Never ask "
                  "for personal details of individuals.")
    return out.questions[:n]


def describe_catalog(raw: dict, url: str, llm) -> dict:
    """Fill empty descriptions in a raw catalogue dict. Returns the updated dict."""
    for table, info in raw["tables"].items():
        samples = {}
        for c, m in info["columns"].items():
            if m["sensitivity"] in ("public", "internal"):
                try:
                    vals = db.run_readonly(f"SELECT DISTINCT {c} AS v FROM {table} WHERE {c} IS NOT NULL LIMIT 5",
                                           url)["v"].tolist()
                except Exception:
                    vals = []
                samples[c] = [str(v)[:40] for v in vals]
            else:
                samples[c] = ["<sensitive: values withheld>"]
        rows = db.run_readonly(f"SELECT COUNT(*) AS n FROM {table}", url)["n"].iloc[0]
        cols = "\n".join(f"- {c} ({m.get('type', '')}): e.g. {samples[c]}" for c, m in info["columns"].items())
        notes = llm.ask(TableNotes, "You document database tables for analysts. Be factual and brief.",
                        f"Table {table} ({rows} rows). Columns with example values:\n{cols}\n\n"
                        "Describe the table and every column. Mention units and code meanings when evident.")
        if not info.get("description"):
            info["description"] = notes.table_description
        for note in notes.columns:
            col = note.column.strip().lower()
            if col in info["columns"] and not info["columns"][col].get("description"):
                info["columns"][col]["description"] = note.description
    return raw
