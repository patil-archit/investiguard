"""Data health for any dataset: quality profile, content-based PII scan and a relationship (ER) map.

All of this is trusted code reading the database directly; none of it goes to an LLM. Big tables are read
through a systematic sample (every k-th row, at most SAMPLE rows) and every figure says whether it is exact
or estimated. Values from sensitive columns are never returned: only counts, rates and masked examples.
"""
import math
import re
import time
from dataclasses import dataclass

import pandas as pd

from . import db, firewall
from .catalog import LEVELS, Catalog

SAMPLE = 60_000
_cache: dict[tuple, tuple[float, dict]] = {}


def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def row_count(url: str, table: str) -> int:
    return int(db.run_readonly(f"SELECT COUNT(*) AS n FROM {_q(table)}", url)["n"].iloc[0])


def sample(url: str, table: str, rows: int, limit: int = SAMPLE) -> pd.DataFrame:
    """Systematic sample: every k-th row on SQLite (spread across the table), first rows elsewhere."""
    if rows <= limit or not _sqlite(url):
        return db.run_readonly(f"SELECT * FROM {_q(table)} LIMIT {limit}", url)
    k = math.ceil(rows / limit)
    return db.run_readonly(f"SELECT * FROM {_q(table)} WHERE rowid % {k} = 0 LIMIT {limit}", url)


def cached(key: tuple, fn, ttl: float = 900):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


# ------------------------------------------------------------------ quality profile

def _is_sensitive(cat: Catalog, table: str, col: str) -> bool:
    return cat.sensitivity(f"{table}.{col}") in ("confidential", "restricted")


def profile_table(cat: Catalog, url: str, table: str) -> dict:
    rows = row_count(url, table)
    df = sample(url, table, rows)
    exact = len(df) == rows
    cols, issues = [], []
    for c in df.columns:
        s = df[c]
        sens = _is_sensitive(cat, table, c)
        nn = s.dropna()
        if s.dtype == object:
            nn = nn[nn.astype(str).str.strip() != ""]
        null_pct = 1 - len(nn) / len(s) if len(s) else 0.0
        distinct = int(nn.nunique())
        num = pd.to_numeric(nn, errors="coerce") if s.dtype == object else nn
        numeric = pd.api.types.is_numeric_dtype(s) or (len(nn) > 0 and num.notna().mean() > 0.95)
        info = {"column": c, "type": cat.tables[table].columns.get(c, {}).get("type", str(s.dtype)),
                "sensitivity": cat.sensitivity(f"{table}.{c}"), "null_pct": round(null_pct, 4),
                "distinct": distinct, "unique_ratio": round(distinct / len(nn), 4) if len(nn) else 0.0,
                "numeric": bool(numeric)}
        if numeric and len(nn) and pd.api.types.is_bool_dtype(s) is False:
            x = pd.to_numeric(nn, errors="coerce").dropna()
            if len(x):
                q1, q3 = x.quantile(0.25), x.quantile(0.75)
                iqr = q3 - q1
                out = ((x < q1 - 3 * iqr) | (x > q3 + 3 * iqr)).mean() if iqr > 0 else 0.0
                info.update(outlier_pct=round(float(out), 4))
                if not sens:
                    info.update(min=float(x.min()), max=float(x.max()), mean=round(float(x.mean()), 3),
                                hist=[int(v) for v in pd.cut(x, 12, labels=False).value_counts().sort_index().reindex(range(12), fill_value=0)])
        elif len(nn) and not sens:
            vc = nn.astype(str).value_counts().head(5)
            info["top"] = [{"value": v[:40], "share": round(n / len(nn), 3)} for v, n in vc.items()]
            if str(nn.iloc[0])[:4].isdigit() and re.match(r"^\d{4}-\d{2}-\d{2}", str(nn.iloc[0])):
                info.update(min=str(nn.min())[:19], max=str(nn.max())[:19])
        # issues
        if null_pct > 0.3:
            issues.append({"column": c, "kind": "missing", "detail": f"{null_pct:.0%} empty"})
        if distinct == 1 and len(nn) > 10:
            issues.append({"column": c, "kind": "constant", "detail": "every row has the same value"})
        if info.get("outlier_pct", 0) > 0.01:
            issues.append({"column": c, "kind": "outliers", "detail": f"{info['outlier_pct']:.1%} far outside the usual range"})
        if s.dtype == object and len(nn) > 20 and 0.2 < pd.to_numeric(nn, errors="coerce").notna().mean() < 0.95:
            issues.append({"column": c, "kind": "mixed types", "detail": "mix of numbers and text"})
        cols.append(info)
    keys = [c["column"] for c in cols if c["unique_ratio"] == 1.0 and c["null_pct"] == 0 and c["distinct"] == len(df)]
    dup = int(df.duplicated().sum())
    if dup:
        issues.append({"column": "*", "kind": "duplicates", "detail": f"{dup:,} duplicate rows in the sample"})
    penalty = sum({"missing": 6, "constant": 3, "outliers": 2, "mixed types": 8, "duplicates": 10}[i["kind"]] for i in issues)
    return {"table": table, "rows": rows, "columns": len(df.columns), "sampled": len(df), "exact": exact,
            "key_candidates": keys[:3], "duplicate_rows": dup, "issues": issues,
            "score": max(0, 100 - penalty), "columns_detail": cols}


def profile(cat: Catalog, url: str) -> dict:
    t0 = time.time()
    tables = [profile_table(cat, url, t) for t in cat.tables]
    return {"tables": tables, "rows": sum(t["rows"] for t in tables), "columns": sum(t["columns"] for t in tables),
            "score": round(sum(t["score"] * t["rows"] for t in tables) / max(1, sum(t["rows"] for t in tables))),
            "seconds": round(time.time() - t0, 2)}


# ------------------------------------------------------------------ PII scan

@dataclass
class Detector:
    name: str
    level: str
    rx: re.Pattern
    check: object = None


def _luhn(digits: str) -> bool:
    d = [int(x) for x in re.sub(r"\D", "", digits)][::-1]
    return len(d) >= 13 and sum(d[0::2]) + sum(sum(divmod(2 * x, 10)) for x in d[1::2]) % 10 == 0 or (
        len(d) >= 13 and (sum(d[0::2]) + sum(sum(divmod(2 * x, 10)) for x in d[1::2])) % 10 == 0)


DETECTORS = [
    Detector("e-mail address", "confidential", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    Detector("PAN (tax id)", "restricted", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")),
    Detector("card number", "restricted", re.compile(r"\b(?:\d[ -]?){13,19}\b"), _luhn),
    Detector("Aadhaar-like 12-digit id", "restricted", re.compile(r"^\d{4}\s\d{4}\s\d{4}$")),
    Detector("bank account number", "restricted", re.compile(r"^\d{11,18}$")),
    Detector("phone number", "confidential", re.compile(r"(?:\+91[\s-]?|\b0)?[6-9]\d{9}\b|\+\d{1,3}[\s-]\d{6,12}")),
    Detector("IP address", "confidential", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")),
]


def _mask(v: str) -> str:
    v = str(v)
    if "@" in v:
        user, _, dom = v.partition("@")
        return f"{user[:1]}•••@{dom}"
    return v[:2] + "•" * max(0, min(8, len(v) - 4)) + v[-2:] if len(v) > 4 else "••••"


def pii_scan(cat: Catalog, url: str) -> dict:
    findings, injections = [], []
    for table in cat.tables:
        rows = row_count(url, table)
        df = sample(url, table, rows, limit=5_000)
        for c in df.columns:
            vals = df[c].dropna().astype(str)
            vals = vals[vals.str.len() >= 4]
            if vals.empty:
                continue
            current = cat.sensitivity(f"{table}.{c}")
            for d in DETECTORS:
                hits = vals[vals.str.contains(d.rx)]
                if d.check:
                    hits = hits[hits.map(lambda v: bool(d.check(v)))]
                rate = len(hits) / len(vals)
                if rate >= 0.3 or (rate >= 0.02 and vals.str.len().mean() > 40):   # whole column, or embedded in free text
                    under = LEVELS.index(current) < LEVELS.index(d.level)
                    findings.append({"resource": f"{table}.{c}", "detector": d.name, "match_rate": round(rate, 3),
                                     "current": current, "suggested": d.level if under else current, "under_labelled": under,
                                     "example": _mask(hits.iloc[0]), "free_text": bool(vals.str.len().mean() > 40)})
                    break
            if vals.str.len().mean() > 30:
                n = int(vals.head(2000).map(lambda v: firewall.scan_text(v) is not None).sum())
                if n:
                    injections.append({"resource": f"{table}.{c}", "cells": n, "scanned": int(min(2000, len(vals)))})
    return {"findings": findings, "injections": injections,
            "under_labelled": sum(f["under_labelled"] for f in findings)}


# ------------------------------------------------------------------ relationship map

def schema_map(cat: Catalog, url: str) -> dict:
    """Tables, row counts and foreign-key-like links found from names and verified on the values."""
    tables = {t: {"rows": row_count(url, t), "columns": len(info.columns),
                  "sensitive": sum(_is_sensitive(cat, t, c) for c in info.columns), "gate": info.requires_finding}
              for t, info in cat.tables.items()}
    edges = []
    names = list(cat.tables)
    for a in names:
        for col in cat.tables[a].columns:
            if not (col.endswith("_id") or col == "id"):
                continue
            for b in names:
                if b == a or col not in cat.tables[b].columns:
                    continue
                stem = col[:-3]
                b_is_owner = b.rstrip("s") == stem or b.startswith(stem) or (list(cat.tables[b].columns)[0] == col)
                if not b_is_owner:
                    continue
                try:   # share of linked values (0 / blank mean "no link") that exist in the owning table
                    sa = db.run_readonly(f"SELECT DISTINCT {_q(col)} AS v FROM {_q(a)} WHERE {_q(col)} IS NOT NULL "
                                         f"AND {_q(col)} NOT IN (0, '') LIMIT 400", url)["v"].tolist()
                    sb = set(db.run_readonly(f"SELECT DISTINCT {_q(col)} AS v FROM {_q(b)} WHERE {_q(col)} IN "
                                             f"({','.join(repr(v) for v in sa) or 'NULL'})", url)["v"])
                    coverage = sum(v in sb for v in sa) / len(sa) if sa else None
                except Exception:
                    coverage = None
                edges.append({"from": a, "to": b, "column": col, "coverage": None if coverage is None else round(coverage, 3),
                              "kind": "many-to-one"})
    return {"tables": tables, "edges": edges}
