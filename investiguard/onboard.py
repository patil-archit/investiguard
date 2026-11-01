"""One call to make a new dataset usable: catalogue -> descriptions -> problems -> questions -> registry."""
from . import catalog, config, profile
from .ingest import slug

CATALOG_DIR = config.ROOT / "catalogs"


def onboard(name: str, label: str, url: str, currency: str, llm=None, describe: bool = True,
            url_env: str | None = None, progress=lambda msg: None) -> dict:
    name = slug(name)
    CATALOG_DIR.mkdir(exist_ok=True)
    cat_path = CATALOG_DIR / f"{name}.yaml"

    progress("Reading schema and labelling column sensitivity…")
    raw = catalog.build(url)
    if describe and llm is not None:
        progress("Drafting table and column descriptions (sensitive values withheld)…")
        raw = profile.describe_catalog(raw, url, llm)
    catalog.save(raw, cat_path)
    cat = catalog.load(cat_path)
    # Date coverage computed by code, so the LLM can resolve "last month" / "this year" correctly.
    for table in raw["tables"]:
        spans = profile.date_spans(cat, table, url)
        if spans:
            raw["tables"][table]["description"] = (raw["tables"][table].get("description", "").rstrip() + " "
                                                   + "; ".join(f"{c} covers {lo} to {hi}" for c, (lo, hi) in spans.items())
                                                   + ".").strip()
    catalog.save(raw, cat_path)
    cat = catalog.load(cat_path)

    progress("Finding period-over-period changes worth investigating…")
    problems = profile.suggest_problems(cat, url, currency)
    questions = []
    if llm is not None:
        progress("Drafting example questions…")
        questions = profile.sample_questions(cat, llm)

    entry = {
        "label": label,
        "url": url if not url_env else "",
        "catalog": cat_path,
        "currency": currency,
        "problem": problems[0]["problem"] if problems else
        "Describe a metric that rose or fell between two periods, then ask for the root cause.",
        "suggested_problems": [p["problem"] for p in problems],
        "sample_questions": questions,
    }
    if url_env:
        entry["url_env"] = url_env
    config.save_dataset(name, entry)
    return {"name": name, "catalog": cat_path, "problems": problems, "questions": questions,
            "tables": len(raw["tables"]), "columns": sum(len(t["columns"]) for t in raw["tables"].values())}
