"""Load a dataset in (almost) any format into its own read-only SQLite database.

Supported: .csv .tsv .txt (delimiter sniffed), .xlsx .xls (one table per sheet), .json (records or a
dict of record lists), .jsonl/.ndjson, .parquet, and SQLite files (.db .sqlite .sqlite3).

    python -m investiguard.ingest my_data.xlsx other.csv --name sales
"""
import argparse
import csv
import json
import re
import sqlite3
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

from . import config

SUPPORTED = {".csv", ".tsv", ".txt", ".xlsx", ".xls", ".json", ".jsonl", ".ndjson", ".parquet",
             ".db", ".sqlite", ".sqlite3"}
DATASETS_DIR = config.ROOT / "data" / "datasets"

_RESERVED = {"group": "group_name", "order": "order_no", "select": "select_", "from": "from_",
             "where": "where_", "table": "table_name", "user": "user_name", "limit": "limit_", "key": "key_",
             "index": "index_", "desc": "desc_", "asc": "asc_", "by": "by_", "all": "all_", "case": "case_"}
_DATE_NAME = re.compile(r"date|_at$|_ts$|time|month|year|period|day")
_DATE_VALUE = re.compile(r"^\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})([ T]\d{1,2}:\d{2}.*)?\s*$")


def slug(text: str) -> str:
    s = re.sub(r"\W+", "_", str(text)).strip("_").lower()
    if not s or s[0].isdigit():
        s = f"t_{s}"
    return _RESERVED.get(s, s)


def _read_csv(path: Path) -> pd.DataFrame:
    raw = path.open("rb").read(65536)
    for enc in ("utf-8-sig", "latin-1"):
        try:
            sample = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    try:
        sep = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        sep = "\t" if path.suffix.lower() == ".tsv" else ","
    return pd.read_csv(path, sep=sep, encoding=enc, low_memory=False)


def _read_json(path: Path) -> dict[str, pd.DataFrame]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() in (".jsonl", ".ndjson"):
        return {slug(path.stem): pd.json_normalize([json.loads(l) for l in text.splitlines() if l.strip()])}
    data = json.loads(text)
    if isinstance(data, list):
        return {slug(path.stem): pd.json_normalize(data)}
    if isinstance(data, dict):
        tables = {slug(k): pd.json_normalize(v) for k, v in data.items()
                  if isinstance(v, list) and v and isinstance(v[0], dict)}
        return tables or {slug(path.stem): pd.json_normalize(data)}
    raise ValueError("JSON must be a list of records or an object holding lists of records")


def read_tables(path: Path) -> dict[str, pd.DataFrame]:
    """Return {table_name: DataFrame} for one input file."""
    ext = path.suffix.lower()
    if ext not in SUPPORTED:
        raise ValueError(f"unsupported file type {ext}; supported: {', '.join(sorted(SUPPORTED))}")
    if ext in (".csv", ".tsv", ".txt"):
        return {slug(path.stem): _read_csv(path)}
    if ext in (".xlsx", ".xls"):
        sheets = pd.read_excel(path, sheet_name=None)
        sheets = {n: df for n, df in sheets.items() if not df.dropna(how="all").empty}
        if len(sheets) == 1:
            return {slug(path.stem): next(iter(sheets.values()))}
        return {slug(n): df for n, df in sheets.items()}
    if ext in (".json", ".jsonl", ".ndjson"):
        return _read_json(path)
    if ext == ".parquet":
        return {slug(path.stem): pd.read_parquet(path)}
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        names = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' "
                                           "AND name NOT LIKE 'sqlite_%'")]
        return {slug(n): pd.read_sql_query(f'SELECT * FROM "{n}"', con) for n in names}
    finally:
        con.close()


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """SQL-safe unique column names, empty columns dropped, dates stored as sortable ISO text."""
    df = df.dropna(axis=1, how="all").copy()
    names, seen = [], {}
    for i, c in enumerate(df.columns):
        n = slug(c) if str(c).strip() and not str(c).startswith("Unnamed") else f"col_{i + 1}"
        seen[n] = seen.get(n, 0) + 1
        names.append(n if seen[n] == 1 else f"{n}_{seen[n]}")
    df.columns = names
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_datetime64_any_dtype(s):
            df[c] = _iso(s)
        elif s.dtype == object or pd.api.types.is_string_dtype(s):
            sample = s.dropna().astype(str).head(500)
            looks_like_date = len(sample) and sample.map(lambda v: bool(_DATE_VALUE.match(v))).mean() > 0.9
            if looks_like_date or (_DATE_NAME.search(c) and len(sample)):
                parsed = pd.to_datetime(s, errors="coerce", dayfirst=not sample.str.match(r"^\d{4}").all())
                if parsed.notna().sum() >= 0.9 * s.notna().sum():
                    df[c] = _iso(parsed)
            elif sample.map(lambda v: isinstance(v, (dict, list))).any():
                df[c] = s.map(lambda v: json.dumps(v) if isinstance(v, (dict, list)) else v)
    return df


def _iso(s: pd.Series) -> pd.Series:
    has_time = (s.dropna().dt.normalize() != s.dropna()).any()
    return s.dt.strftime("%Y-%m-%d %H:%M:%S" if has_time else "%Y-%m-%d")


def ingest(paths: list[Path], name: str) -> tuple[str, dict[str, tuple[int, int]]]:
    """Load files into data/datasets/<name>.db (replacing it). Returns (sqlite url, {table: (rows, cols)})."""
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    db_path = DATASETS_DIR / f"{slug(name)}.db"
    db_path.unlink(missing_ok=True)
    eng = create_engine(f"sqlite:///{db_path}")
    summary = {}
    for path in map(Path, paths):
        for table, df in read_tables(path).items():
            df = clean(df)
            if df.empty:
                continue
            if table in summary:  # two files produced the same table name: keep both
                table = f"{table}_{slug(path.stem)}"
            df.to_sql(table, eng, if_exists="replace", index=False, chunksize=10_000)
            summary[table] = (len(df), len(df.columns))
    eng.dispose()
    if not summary:
        db_path.unlink(missing_ok=True)
        raise ValueError("no non-empty tables found in the uploaded files")
    return f"sqlite:///{db_path}", summary


def ingest_uploads(files: list[tuple[str, bytes]], name: str) -> tuple[str, dict]:
    """Same as ingest() for in-memory uploads [(filename, bytes)] from the UI."""
    tmp = DATASETS_DIR / f".upload_{slug(name)}"
    tmp.mkdir(parents=True, exist_ok=True)
    paths = []
    for fname, data in files:
        p = tmp / Path(fname).name
        p.write_bytes(data)
        paths.append(p)
    try:
        return ingest(paths, name)
    finally:
        for p in paths:
            p.unlink(missing_ok=True)
        tmp.rmdir()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--name", required=True)
    a = ap.parse_args()
    url, summ = ingest([Path(f) for f in a.files], a.name)
    for t, (r, c) in summ.items():
        print(f"{t}: {r} rows, {c} columns")
    print(url)
