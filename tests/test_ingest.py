"""Generalisation: any-format ingest, schema-driven catalogue, deterministic problem suggestions."""
import json

import pandas as pd
import pytest

from investiguard import catalog, db, ingest, profile


@pytest.fixture
def workdir(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "DATASETS_DIR", tmp_path / "datasets")
    return tmp_path


def _monthly_sales(n_months=15, drop_from=12):
    rows = []
    for m in range(n_months):
        y, mo = 2024 + (m // 12), m % 12 + 1
        for d in (1, 10, 20, 28):
            for region in ("North", "South", "East"):
                amt = 0.0 if (region == "South" and m >= drop_from) else 1000.0
                rows.append({"Order Date": f"{d:02d}/{mo:02d}/{y}", "Region": region, "Sales Amount": amt,
                             "Customer Email": f"c{d}@x.example", "Unit Price": 5.0})
    return pd.DataFrame(rows)


def test_semicolon_csv_with_day_first_dates(workdir):
    p = workdir / "Sales Data 2024.csv"
    _monthly_sales().to_csv(p, sep=";", index=False)
    url, tables = ingest.ingest([p], "t1")
    assert tables == {"sales_data_2024": (len(_monthly_sales()), 5)}
    df = db.run_readonly("SELECT order_date, region, sales_amount FROM sales_data_2024 LIMIT 1", url)
    assert df["order_date"].iloc[0] == "2024-01-01"


def test_excel_sheets_json_parquet_and_collisions(workdir):
    x = workdir / "book.xlsx"
    with pd.ExcelWriter(x) as w:
        _monthly_sales(2).to_excel(w, sheet_name="Orders", index=False)
        pd.DataFrame({"Region": ["North"], "Manager": ["A"]}).to_excel(w, sheet_name="Regions", index=False)
    j = workdir / "regions.json"
    j.write_text(json.dumps({"regions": [{"region": "South", "meta": {"tier": 1}}]}))
    q = workdir / "orders.parquet"
    pd.DataFrame({"id": [1], "group": ["g"]}).to_parquet(q)
    url, tables = ingest.ingest([x, j, q], "t2")
    assert set(tables) == {"orders", "regions", "regions_regions", "orders_orders"}
    assert "meta_tier" in db.introspect(url)["regions_regions"]          # nested JSON flattened
    assert "group_name" in db.introspect(url)["orders_orders"]           # reserved word renamed


def test_unsupported_type_rejected(workdir):
    p = workdir / "notes.docx"
    p.write_bytes(b"x")
    with pytest.raises(ValueError, match="unsupported"):
        ingest.ingest([p], "t3")


def test_catalogue_and_problem_suggestion_on_new_domain(workdir):
    p = workdir / "sales.csv"
    _monthly_sales().to_csv(p, index=False)
    url, _ = ingest.ingest([p], "t4")
    raw = catalog.build(url)
    cols = raw["tables"]["sales"]["columns"]
    assert cols["customer_email"]["sensitivity"] == "confidential"
    catalog.save(raw, workdir / "c.yaml")
    cat = catalog.load(workdir / "c.yaml")
    assert profile._measures(cat, "sales") == ["sales_amount"]           # unit_price is non-additive
    probs = profile.suggest_problems(cat, url, "INR")
    assert probs and "fell by 33%" in probs[0]["problem"] and "sales.order_date" in probs[0]["problem"]
