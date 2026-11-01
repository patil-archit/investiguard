"""Data catalogue: per-column sensitivity and per-table evidence gates.

`python -m investiguard.catalog` introspects DATABASE_URL and writes catalog.yaml with
heuristic sensitivity labels. Review and edit the YAML by hand before running investigations.
"""
import re
from pathlib import Path
from dataclasses import dataclass, field

import yaml

from . import config, db

LEVELS = ["public", "internal", "confidential", "restricted"]
SENSITIVITY_WEIGHT = {"public": 0, "internal": 1, "confidential": 3, "restricted": 10}

_RESTRICTED = re.compile(r"salary|pan\b|pan_|aadhaar|ssn|bank|account_?(no|num)|iban|card|cvv|password|passwd|secret|token")
_CONFIDENTIAL = re.compile(
    r"^(first|last|full|customer|user|employee|contact)_?name$|email|phone|mobile|address|dob|birth|"
    r"^ip(_|$)|ip_address|user_agent|message|body|note|comment|gender|national"
)
_GATED_TABLE = re.compile(r"log|deploy|release|ticket|audit|employee|hr_|payroll")


def guess_sensitivity(table: str, column: str) -> str:
    if _RESTRICTED.search(column):
        return "restricted"
    if column == "name" and table in {"customers", "users", "employees", "employee_records"}:
        return "confidential"
    if _CONFIDENTIAL.search(column):
        return "confidential"
    return "internal"


@dataclass
class TableInfo:
    name: str
    columns: dict[str, dict]
    description: str = ""
    # P4: table may only be granted once a SUPPORTED finding exists.
    # "any" = any supported finding; a list = a finding that touched one of these tables.
    requires_finding: str | list[str] | None = None


@dataclass
class Catalog:
    tables: dict[str, TableInfo] = field(default_factory=dict)

    def has(self, resource: str) -> bool:
        t, _, c = resource.partition(".")
        return t in self.tables and c in self.tables[t].columns

    def resolve(self, name: str) -> str | None:
        """'table.column' or an unambiguous bare 'column' -> 'table.column'; None if unknown."""
        name = name.strip().strip('"`').lower()
        if self.has(name):
            return name
        if "." not in name:
            hits = [f"{t}.{name}" for t, info in self.tables.items() if name in info.columns]
            if len(hits) == 1:
                return hits[0]
        return None

    def join_keys(self, tables: set[str]) -> list[str]:
        """Shared id-like column names between each pair of the given tables, as table.column."""
        tables, keys = sorted(tables), []
        for i, a in enumerate(tables):
            for b in tables[i + 1:]:
                shared = set(self.tables[a].columns) & set(self.tables[b].columns)
                for c in sorted(shared):
                    if (c == "id" or c.endswith(("_id", "_code", "_no", "_key")) or c in ("material", "sku")) \
                            and self.sensitivity(f"{a}.{c}") in ("public", "internal"):
                        keys += [f"{a}.{c}", f"{b}.{c}"]
        return keys

    def sensitivity(self, resource: str) -> str:
        t, _, c = resource.partition(".")
        return self.tables[t].columns[c]["sensitivity"]

    def schema(self, tables: set[str] | None = None) -> dict[str, dict[str, str]]:
        return {
            t: {c: meta.get("type", "TEXT") for c, meta in info.columns.items()}
            for t, info in self.tables.items()
            if tables is None or t in tables
        }

    def all_columns(self) -> list[str]:
        return [f"{t}.{c}" for t, info in self.tables.items() for c in info.columns]

    def describe(self, resources: list[str] | None = None) -> str:
        """Compact text form for prompts. Never includes data values."""
        wanted = set(resources) if resources is not None else None
        lines = []
        for t, info in self.tables.items():
            cols = [
                f"{c} ({m.get('type', '')}, {m['sensitivity']}"
                + (f"; {m['description']})" if m.get("description") else ")")
                for c, m in info.columns.items()
                if wanted is None or f"{t}.{c}" in wanted
            ]
            if cols:
                gate = f" [needs prior finding: {info.requires_finding}]" if info.requires_finding else ""
                desc = f" -- {info.description}" if info.description else ""
                lines.append(f"- {t}{gate}{desc}: " + ", ".join(cols))
        return "\n".join(lines)


def build(url: str = config.DATABASE_URL) -> dict:
    out = {"tables": {}}
    for table, cols in db.introspect(url).items():
        out["tables"][table] = {
            "description": "",
            "requires_finding": "any" if _GATED_TABLE.search(table) else None,
            "columns": {c: {"type": typ, "sensitivity": guess_sensitivity(table, c)} for c, typ in cols.items()},
        }
    return out


def save(data: dict, path) -> None:
    Path(path).write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))


def load_raw(path) -> dict:
    return yaml.safe_load(open(path))


def load(path=config.CATALOG_PATH) -> Catalog:
    raw = yaml.safe_load(open(path))
    return Catalog(
        tables={
            t: TableInfo(
                name=t,
                columns=v["columns"],
                description=v.get("description", ""),
                requires_finding=v.get("requires_finding"),
            )
            for t, v in raw["tables"].items()
        }
    )


if __name__ == "__main__":
    import sys

    # python -m investiguard.catalog [dataset-name]   (no name = DATABASE_URL -> CATALOG_PATH)
    if len(sys.argv) > 1:
        ds = config.datasets()[sys.argv[1]]
        url, path = ds["url"], ds["catalog"]
    else:
        url, path = config.DATABASE_URL, config.CATALOG_PATH
    data = build(url)
    path.write_text(yaml.safe_dump(data, sort_keys=False))
    n = sum(len(t["columns"]) for t in data["tables"].values())
    print(f"Wrote {path} ({len(data['tables'])} tables, {n} columns). Review sensitivity labels!")
