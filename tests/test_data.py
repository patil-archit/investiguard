"""ShopSim incidents, big-file ingest, quality profile, PII scan and relationship map."""
import pandas as pd
import pytest

from investiguard import catalog, ingest, quality, shopsim


@pytest.fixture(scope="module")
def tables():
    return shopsim.generate(scale=0.05, seed=3)


def test_shopsim_schema_size(tables):
    assert len(tables) == 9
    assert sum(len(df.columns) for df in tables.values()) >= 111   # synopsis Table 5.1: 111 columns
    assert set(tables) >= {"customers", "orders", "payments", "website_sessions", "deployment_logs", "employee_records"}


def test_every_incident_moves_its_metric(tables):
    for inc in shopsim.INCIDENTS:
        base = inc["fn"](tables, *inc["baseline"][:2])
        now = inc["fn"](tables, *inc["incident"][:2])
        change = (now - base) / base
        assert (change > 0.3) if inc["id"] == "S8" else (change < -0.04), (inc["id"], change)


def test_planted_signatures_present(tables):
    p, o, w, d = tables["payments"], tables["orders"], tables["website_sessions"], tables["deployment_logs"]
    atlas_after = p[(p["provider"] == "Atlas") & (p["payment_ts"] >= "2025-09-12 10:30")]
    assert atlas_after["status"].eq("failed").mean() > 0.3
    assert (atlas_after["failure_reason"] == "3DS callback timeout").any()
    assert not ((o["product_id"] == 1) & o["order_date"].between("2025-03-05", "2025-03-31")).any()
    assert (w["error_code"] == "JS_CHUNK_LOAD_FAILED").any()
    assert {"v4.8.0", "v5.2.0", "v3.9.0", "v2.9.0"} <= set(d["version"])
    assert tables["support_tickets"]["message_body"].str.contains("ignore your previous instructions").any()


def test_chunked_ingest_and_report(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "DATASETS_DIR", tmp_path / "ds")
    monkeypatch.setattr(ingest, "BIG_FILE_MB", 0)          # force the streaming path
    monkeypatch.setattr(ingest, "CHUNK_ROWS", 1_000)
    f = tmp_path / "Sales Data.csv"
    pd.DataFrame({"Order Date": pd.date_range("2025-01-01", periods=3_500, freq="h").strftime("%d/%m/%Y %H:%M"),
                  "Amount (INR)": range(3_500), "Empty": [None] * 3_500}).to_csv(f, index=False)
    url, summary = ingest.ingest([f], "big_test")
    assert summary["sales_data"][0] == 3_500
    rep = ingest.ingest_report("big_test")
    actions = [a["action"] for a in rep["tables"][0]["actions"]]
    assert any("chunks" in a for a in actions) and any("ISO dates" in a for a in actions)
    assert "order_date" in rep["tables"][0]["indexed"]


def test_pii_scan_flags_under_labelled_column(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "DATASETS_DIR", tmp_path / "ds")
    f = tmp_path / "leads.csv"
    pd.DataFrame({"lead_id": range(200), "contact": [f"person{i}@corp.example" for i in range(200)],
                  "note": ["call back next week"] * 200}).to_csv(f, index=False)
    url, _ = ingest.ingest([f], "pii_test")
    cat = catalog.Catalog.__new__(catalog.Catalog)
    raw = catalog.build(url)
    cpath = tmp_path / "c.yaml"
    catalog.save(raw, cpath)
    cat = catalog.load(cpath)
    scan = quality.pii_scan(cat, url)
    hit = next(f for f in scan["findings"] if f["resource"] == "leads.contact")
    assert hit["detector"] == "e-mail address" and hit["under_labelled"] and hit["suggested"] == "confidential"
    assert "@" in hit["example"] and "person0" not in hit["example"]   # masked, never the raw value


def test_quality_and_schema_on_small_db(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "DATASETS_DIR", tmp_path / "ds")
    a, b = tmp_path / "customers.csv", tmp_path / "orders.csv"
    pd.DataFrame({"customer_id": range(1, 51), "segment": ["x"] * 50}).to_csv(a, index=False)
    pd.DataFrame({"order_id": range(1, 301), "customer_id": [i % 50 + 1 for i in range(300)],
                  "amount": [10.0] * 299 + [1e7]}).to_csv(b, index=False)
    url, _ = ingest.ingest([a, b], "q_test")
    raw = catalog.build(url)
    cpath = tmp_path / "c.yaml"
    catalog.save(raw, cpath)
    cat = catalog.load(cpath)
    prof = quality.profile(cat, url)
    orders = next(t for t in prof["tables"] if t["table"] == "orders")
    assert orders["rows"] == 300 and "order_id" in orders["key_candidates"]
    seg = next(t for t in prof["tables"] if t["table"] == "customers")
    assert any(i["kind"] == "constant" for i in seg["issues"])
    edges = quality.schema_map(cat, url)["edges"]
    assert {"from": "orders", "to": "customers", "column": "customer_id", "coverage": 1.0, "kind": "many-to-one"} in edges


def test_decomposition_by_period_is_sent_back():
    """Grouping by the month itself would 'explain' 100% of any change; the evidence engine refuses it."""
    from investiguard.agent import evidence
    df = pd.DataFrame({"segment": ["2025-01", "2025-02", "ALL"], "baseline": [100.0, 0.0, 100.0], "incident": [0.0, 90.0, 90.0]})
    norm, err = evidence.normalise(df)
    assert norm is None and "periods themselves" in err
    ok = pd.DataFrame({"segment": ["East", "West", "ALL"], "baseline": [50.0, 50.0, 100.0], "incident": [40.0, 50.0, 90.0]})
    assert evidence.normalise(ok)[1] is None


def test_single_period_segment_and_unit_mismatch_are_sent_back():
    from investiguard.agent import evidence
    sept = pd.DataFrame({"segment": ["September", "ALL"], "baseline": [0.0, 385.0e6], "incident": [334.0e6, 334.0e6]})
    assert "period" in evidence.normalise(sept)[1]
    counts = pd.DataFrame({"segment": ["Failed Payments", "ALL"], "baseline": [1237.0, 385.0e6], "incident": [6168.0, 334.0e6]})
    assert "different measure" in evidence.normalise(counts)[1]
