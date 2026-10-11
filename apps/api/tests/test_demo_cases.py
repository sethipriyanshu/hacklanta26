import json

from app.services import demo_cases as dc
from app.services import signals as sv
from app.store import MarketStore


def _store_with_cases() -> MarketStore:
    s = MarketStore()
    dc.install(s, json.loads(dc.CASES_FILE.read_text()))
    return s


def test_fixture_has_anomalies_and_gaps():
    cases = json.loads(dc.CASES_FILE.read_text())
    kinds = {c["kind"] for c in cases}
    assert {"anomaly", "gap"} <= kinds
    assert all(sig["score"] >= 40 for c in cases for sig in c["signals"])


def test_demo_copies_are_frozen_and_never_listed_live():
    s = _store_with_cases()
    ids = [i for i in s.markets if dc.is_demo(i)]
    assert ids and dc.demo.order
    assert all(i in s.fixture_ids for i in ids)  # the live poller never evicts them
    assert not any(sv.is_listable(s, s.markets[i]) for i in ids)  # only /demo lists them


def test_recompute_keeps_frozen_signals():
    s = _store_with_cases()
    sv.recompute(s)
    for mid in dc.demo.order:
        assert sv.max_score(mid) >= 40


def test_gap_case_links_both_demo_sides():
    s = _store_with_cases()
    for res in dc.demo.pair_results.values():
        pair = res["pair"]
        assert dc.is_demo(pair["id"]) and pair["kalshiId"] in s.markets
        assert all(p in s.markets for p in pair["polyIds"])
