import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'demo_data' / 'demo.db'}")
CATALOG_PATH = Path(os.getenv("CATALOG_PATH", ROOT / "catalog.yaml"))
LLM_MODEL = os.getenv("LLM_MODEL", "openai:gpt-4o-mini")
CAP_SECRET = os.getenv("CAP_SECRET", "dev-only-insecure-secret-change-me-in-env-0001")
DATASETS_PATH = ROOT / "datasets.yaml"


def _raw_datasets() -> dict:
    import yaml

    if not DATASETS_PATH.exists():
        return {}
    return yaml.safe_load(DATASETS_PATH.read_text()) or {}


def datasets() -> dict[str, dict]:
    """datasets.yaml with sqlite paths and catalogue paths made absolute.

    A connected database keeps its URL (which may hold a password) in .env, referenced by `url_env`.
    """
    load_dotenv(ROOT / ".env", override=True)
    out = {}
    for name, d in _raw_datasets().items():
        d = dict(d)
        if d.get("url_env"):
            d["url"] = os.getenv(d["url_env"], "")
        if d["url"].startswith("sqlite:///") and not d["url"].startswith("sqlite:////"):
            d["url"] = f"sqlite:///{ROOT / d['url'].removeprefix('sqlite:///')}"
        d["catalog"] = ROOT / d["catalog"]
        out[name] = d
    return out


def save_dataset(name: str, entry: dict) -> None:
    """Add or replace one dataset in datasets.yaml, storing paths relative to the project root."""
    import yaml

    entry = dict(entry)
    url = entry.get("url", "")
    if url.startswith(f"sqlite:///{ROOT}/"):
        entry["url"] = "sqlite:///" + url.removeprefix(f"sqlite:///{ROOT}/")
    if isinstance(entry.get("catalog"), Path):
        entry["catalog"] = str(entry["catalog"].relative_to(ROOT))
    data = _raw_datasets()
    data[name] = entry
    DATASETS_PATH.write_text("# Datasets the Studio can switch between. Managed by the Data tab; editable by hand.\n"
                             + yaml.safe_dump(data, sort_keys=False, allow_unicode=True))


def delete_dataset(name: str) -> None:
    import yaml

    data = _raw_datasets()
    data.pop(name, None)
    DATASETS_PATH.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))


def store_secret_url(name: str, url: str) -> str:
    """Keep a connection URL out of datasets.yaml: write it to .env and return the variable name."""
    key = "IG_DS_" + "".join(ch if ch.isalnum() else "_" for ch in name).upper() + "_URL"
    env = ROOT / ".env"
    lines = [l for l in (env.read_text().splitlines() if env.exists() else []) if not l.startswith(f"{key}=")]
    env.write_text("\n".join(lines + [f"{key}={url}"]) + "\n")
    env.chmod(0o600)
    os.environ[key] = url
    return key


# Table 5.3 of the synopsis
CAP_TTL_DEFAULT_S = 300
CAP_TTL_MAX_S = 900
K_MAX_ACTIVE_CAPS = 4
SENSITIVE_COLUMN_BUDGET = 6
GATEWAY_ROW_LIMIT = 10_000
GATEWAY_TIMEOUT_S = 10
MAX_ITERATIONS = 16
MAX_QUERY_ATTEMPTS = 3
STOP_EXPLAINED_SHARE = 0.8
PLANNER_LAMBDA = 0.5
