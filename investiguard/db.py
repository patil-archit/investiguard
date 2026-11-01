"""Database access. Works with any SQLAlchemy URL (PostgreSQL, MySQL, SQLite)."""
from functools import lru_cache

import pandas as pd
from sqlalchemy import create_engine, inspect, text

from . import config

_DIALECTS = {"postgresql": "postgres", "mysql": "mysql", "sqlite": "sqlite", "mssql": "tsql"}


@lru_cache
def engine(url: str = config.DATABASE_URL):
    if url.startswith("sqlite:///") and "mode=ro" not in url:
        # Open SQLite read-only at the driver level (defence in depth for the gateway).
        path = url.removeprefix("sqlite:///")
        return create_engine(f"sqlite:///file:{path}?mode=ro&uri=true")
    return create_engine(url, pool_pre_ping=True)


def sqlglot_dialect(url: str = config.DATABASE_URL) -> str:
    backend = url.split(":", 1)[0].split("+", 1)[0]
    return _DIALECTS.get(backend, "postgres")


def introspect(url: str = config.DATABASE_URL) -> dict[str, dict[str, str]]:
    """Return {table: {column: type}} with lower-cased names."""
    insp = inspect(engine(url))
    return {
        t.lower(): {c["name"].lower(): str(c["type"]) for c in insp.get_columns(t)}
        for t in insp.get_table_names()
    }


def run_readonly(sql: str, url: str = config.DATABASE_URL) -> pd.DataFrame:
    backend = sqlglot_dialect(url)
    with engine(url).connect() as conn:
        if backend == "postgres":
            conn.execute(text("SET TRANSACTION READ ONLY"))
            conn.execute(text(f"SET LOCAL statement_timeout = '{config.GATEWAY_TIMEOUT_S}s'"))
        elif backend == "mysql":
            conn.execute(text("SET SESSION TRANSACTION READ ONLY"))
            conn.execute(text(f"SET SESSION max_execution_time = {config.GATEWAY_TIMEOUT_S * 1000}"))
        df = pd.read_sql_query(text(sql), conn)
        conn.rollback()
    return df
