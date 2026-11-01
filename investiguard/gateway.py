"""SQL data gateway (novelty N3).

Every query must carry a capability token. The gateway parses it into an AST, resolves every
column it touches (projections, filters, joins, GROUP BY, aggregate args, sub-queries, CTEs,
SELECT *), checks each against the capability of the current hypothesis, enforces a row limit,
and only then runs it on a read-only connection. Fails closed on anything it cannot resolve.
"""
import time
from dataclasses import dataclass, field

import pandas as pd
import sqlglot
from sqlglot import exp
from sqlglot.errors import OptimizeError, ParseError
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import traverse_scope

from . import config, db
from .capabilities import CapabilityError, CapabilityStore
from .catalog import Catalog

_FORBIDDEN_NODES = (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter,
                    exp.Command, exp.Merge, exp.TruncateTable, exp.Into, exp.Copy, exp.Set)
_FORBIDDEN_FUNC_PREFIXES = ("pg_", "dblink", "lo_", "load_extension", "sleep", "benchmark",
                            "readfile", "writefile", "current_setting", "set_config", "query_to_xml", "xp_")


def _output_names(scope) -> set[str]:
    names, s = set(), scope
    while s is not None:
        names |= set(getattr(s.expression, "named_selects", []) or [])
        s = s.parent
    return names


def db_error_message(e: BaseException) -> str:
    """The database's own error text (pandas/SQLAlchemy wrap it after an echo of the whole SQL)."""
    while e.__cause__ is not None:
        e = e.__cause__
    return str(getattr(e, "orig", e)).splitlines()[0][:300]


class DatabaseQueryError(Exception):
    pass


class GatewayDenied(Exception):
    def __init__(self, reason: str, columns: list[str] | None = None):
        super().__init__(reason)
        self.reason = reason
        self.columns = columns or []


@dataclass
class QueryRecord:
    hypothesis_id: str
    sql: str
    verdict: str                      # "allowed" | "denied" | "error"
    reason: str = ""
    columns_used: list[str] = field(default_factory=list)
    rewritten_sql: str = ""
    rows: int = 0
    latency_ms: float = 0.0


@dataclass
class Gateway:
    catalog: Catalog
    store: CapabilityStore
    url: str = config.DATABASE_URL
    log: list[QueryRecord] = field(default_factory=list)

    def __post_init__(self):
        self.dialect = db.sqlglot_dialect(self.url)

    # ---- static analysis -------------------------------------------------
    def analyse(self, sql: str) -> tuple[exp.Expression, dict[str, bool]]:
        """Return (original AST, {table.column: used_only_inside_COUNT})."""
        try:
            stmts = [s for s in sqlglot.parse(sql, read=self.dialect) if s is not None]
        except ParseError as e:
            raise GatewayDenied(f"unparseable SQL: {str(e).splitlines()[0]}")
        if len(stmts) != 1:
            raise GatewayDenied("exactly one statement is allowed")
        tree = stmts[0]
        if not isinstance(tree, (exp.Select, exp.Union, exp.Subquery)) and not tree.find(exp.Select):
            raise GatewayDenied("only SELECT queries are allowed")
        if not isinstance(tree, exp.Query):
            raise GatewayDenied("only SELECT queries are allowed")
        for node in tree.walk():
            if isinstance(node, _FORBIDDEN_NODES):
                raise GatewayDenied(f"forbidden construct: {type(node).__name__}")
            if isinstance(node, exp.Func):
                name = (node.sql_name() if not isinstance(node, exp.Anonymous) else node.name).lower()
                if name.startswith(_FORBIDDEN_FUNC_PREFIXES):
                    raise GatewayDenied(f"forbidden function: {name}")

        cte_names = {c.alias_or_name.lower() for c in tree.find_all(exp.CTE)}
        for t in tree.find_all(exp.Table):
            name = t.name.lower()
            if name in cte_names and not t.db:
                continue
            if t.db or t.catalog or name not in self.catalog.tables:
                raise GatewayDenied(f"table not in catalogue: {t.sql()}")

        original = tree.copy()  # qualified tree is for analysis only; execute the original
        try:
            tree = qualify(tree, schema=self.catalog.schema(), dialect=self.dialect,
                           validate_qualify_columns=True, quote_identifiers=False)
        except OptimizeError as e:
            raise GatewayDenied(f"could not resolve columns: {e}")

        used: dict[str, bool] = {}
        for scope in traverse_scope(tree):
            for col in scope.columns:
                source, s = None, scope
                while s is not None and source is None:
                    source = s.sources.get(col.table)
                    s = s.parent
                if source is None:
                    # qualify() qualifies every base-table column, so an unqualified survivor can only be a
                    # reference to an output alias (e.g. ORDER BY after UNION). Allow exactly that case.
                    if not col.table and col.name in _output_names(scope):
                        continue
                    raise GatewayDenied(f"unresolved column {col.sql()}")
                if isinstance(source, exp.Table):
                    key = f"{source.name.lower()}.{col.name.lower()}"
                    in_count = col.find_ancestor(exp.Count) is not None
                    used[key] = used.get(key, True) and in_count
        return original, used

    # ---- enforcement -----------------------------------------------------
    def check(self, sql: str, token: str, hypothesis_id: str) -> tuple[str, list[str]]:
        try:
            cap = self.store.verify(token, hypothesis_id)
        except CapabilityError as e:
            raise GatewayDenied(str(e))
        tree, used = self.analyse(sql)
        if not used:
            raise GatewayDenied("query touches no catalogued columns")
        not_granted = sorted(c for c in used if c not in cap.resources)
        if not_granted:
            raise GatewayDenied(f"columns outside capability: {not_granted}", not_granted)
        raw_sensitive = sorted(c for c, only_count in used.items()
                               if cap.resources[c] == "aggregate_only" and not only_count)
        if raw_sensitive:
            raise GatewayDenied(f"aggregate-only columns used outside COUNT(): {raw_sensitive}", raw_sensitive)

        limit = tree.args.get("limit")
        current = None
        if limit is not None:
            try:
                current = int(limit.expression.name)
            except (AttributeError, ValueError):
                current = None
        if current is None or current > config.GATEWAY_ROW_LIMIT:
            tree = tree.limit(config.GATEWAY_ROW_LIMIT)
        return tree.sql(dialect=self.dialect), sorted(used)

    def execute(self, sql: str, token: str, hypothesis_id: str) -> tuple[pd.DataFrame, QueryRecord]:
        t0 = time.perf_counter()
        rec = QueryRecord(hypothesis_id=hypothesis_id, sql=sql, verdict="allowed")
        try:
            rec.rewritten_sql, rec.columns_used = self.check(sql, token, hypothesis_id)
        except GatewayDenied as e:
            rec.verdict, rec.reason, rec.columns_used = "denied", e.reason, e.columns
            rec.latency_ms = (time.perf_counter() - t0) * 1000
            self.log.append(rec)
            raise
        check_ms = (time.perf_counter() - t0) * 1000
        try:
            df = db.run_readonly(rec.rewritten_sql, self.url)
        except Exception as e:  # SQL error from the database itself
            rec.verdict, rec.reason = "error", db_error_message(e)
            rec.latency_ms = check_ms
            self.log.append(rec)
            raise DatabaseQueryError(rec.reason) from e
        rec.rows, rec.latency_ms = len(df), check_ms
        self.log.append(rec)
        return df, rec
