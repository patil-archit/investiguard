"""Threat lab, web hardening, System B, ablations, synopsis score and benchmark metrics."""
from fastapi.testclient import TestClient

from investiguard import config, ledger, threats
from investiguard.agent import evidence
from investiguard.bench import runner, scenarios
from server.api import app

client = TestClient(app)


def test_threat_suite_blocks_every_tested_attack_and_allows_legit():
    results = list(threats.run_suite())
    s = threats.summarise(results)
    assert s["attacks"] == 40 and len(results) == 44
    assert s["block_rate"] == 1.0, [r for r in results if r["cls"] != "OK" and r["outcome"] == "allowed"]
    assert s["false_denials"] == 0
    assert all(r["outcome"] in ("blocked", "skipped") for r in results if r["cls"] != "OK")
    # only sandbox runtime cases may be skipped, and only when Docker is absent
    assert all(r["cls"] in ("T1", "T4") for r in results if r["outcome"] == "skipped")


def test_threat_classes_match_synopsis_table_7_2():
    counts = {k: v["cases"] for k, v in threats.catalogue()["classes"].items()}
    assert counts == {"T1": 8, "T2": 10, "T3": 6, "T4": 6, "T5": 4, "T6": 6, "OK": 4}


def test_security_headers_and_request_id():
    r = client.get("/api/config")
    assert r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff" and len(r.headers["x-request-id"]) == 12


def test_cross_origin_write_and_foreign_host_refused():
    assert client.post("/api/ask", json={"dataset": "x", "question": "hi"},
                       headers={"origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/datasets", headers={"host": "evil.example"}).status_code == 400


def test_static_files_cannot_escape_dist():
    r = client.get("/%2e%2e/.env")
    assert "OPENAI" not in r.text


def test_oversized_input_rejected():
    r = client.post("/api/investigations", json={"dataset": "demo", "problem": "x" * 5000})
    assert r.status_code == 422


def test_signing_key_is_random_and_receipts_carry_only_its_fingerprint():
    assert config.CAP_SECRET != config.LEGACY_DEV_SECRET and len(config.CAP_SECRET) >= 32
    rec = ledger.seal("r1", [{"t": 1, "kind": "x"}])
    assert rec["key_id"] == ledger.key_id(config.CAP_SECRET) and config.CAP_SECRET not in str(rec)
    assert ledger.verify([{"t": 1, "kind": "x"}], rec)["valid"]


def test_synopsis_score_parts():
    parts = evidence.score_parts(0.8, 3.0)
    assert parts["S"] > 0.99 and parts["T"] == 0.5
    assert evidence.combined(parts) == round(0.5 * 0.8 + 0.3 * parts["S"] + 0.2 * 0.5, 3)
    assert evidence.temporal_alignment({"verdict": "SUPPORTED", "specific_to_segment": True}) == 1.0
    assert evidence.temporal_alignment({"verdict": "INCONCLUSIVE"}) == 0.0


def test_system_b_allowlist_and_ablations_configure_runtime():
    sc = next(s for s in scenarios.SPECS if s.name == "sensitive_decoy")
    from investiguard import catalog
    built = scenarios.build("sensitive_decoy")
    cat = catalog.load(built.catalog_path)
    rt = runner._runtime(built, cat, None, "B")
    assert rt.mode == "B" and rt.allow_tables == ["customers", "orders"]
    assert runner._runtime(built, cat, None, "C-table").ablate == {"table_scope"}
    assert sc.required and all(cat.has(c) for c in built.required)


def test_permission_precision_recall():
    from investiguard import catalog
    from investiguard.agent.graph import Runtime
    sc = scenarios.build("segment_drop")
    rt = Runtime(catalog=catalog.load(sc.catalog_path), llm=None, url=sc.url)
    rt.store.mint("H1", {c: "clear" for c in sc.required}, "READ_ROWS", "t", 60)
    rt.store.mint("H2", {"orders.channel": "clear"}, "READ_ROWS", "t", 60)
    p = runner.permissions(rt, sc.required)
    assert p["permission_recall"] == 1.0 and p["permission_precision"] == round(4 / 5, 3)


def test_compound_scenario_needs_both_drivers():
    sc = next(s for s in scenarios.SPECS if s.name == "compound")
    one = {"report": {"root_cause": "Orders from West fell"}, "evidence": []}
    both = {"report": {"root_cause": "West region and the Store channel both fell"}, "evidence": []}
    assert not runner.score(sc, one)["correct"] and runner.score(sc, both)["correct"]
