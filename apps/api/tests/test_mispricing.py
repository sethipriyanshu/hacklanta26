from app.engines.mispricing import cross_venue_gap, inconsistency
from app.models import Event, Market


def mk(id, venue, price, spread=0.01, **kw):
    return Market(id=id, venue=venue, ticker=id, title=id, event_id="e", event_title="e", category="Economics", yes_price=price, spread=spread, url="u", **kw)


def test_gap_flags_only_beyond_spreads_and_fees():
    k = mk("k", "kalshi", 0.15, spread=0.02)
    p = mk("p", "polymarket", 0.16, spread=0.01)
    r = cross_venue_gap(k, [p])
    assert not r.flagged and "No edge" in r.explanation
    r2 = cross_venue_gap(k, [mk("p", "polymarket", 0.30, spread=0.01)])
    assert r2.flagged and r2.edge_cents == 10.0 and "Kalshi" in r2.explanation


def test_gap_sums_polymarket_brackets():
    k = mk("k", "kalshi", 0.16, spread=0.02)
    r = cross_venue_gap(k, [mk("a", "polymarket", 0.155), mk("b", "polymarket", 0.0035)])
    assert r.poly_price == 0.1585 and not r.flagged


def test_inconsistency_needs_mutually_exclusive_event():
    ev = Event(id="e", venue="polymarket", title="e", category="Politics", mutually_exclusive=False)
    assert inconsistency(ev, [mk("a", "polymarket", 0.5)] * 3) is None


def test_inconsistency_flags_sum_far_from_100():
    ev = Event(id="e", venue="polymarket", title="e", category="Politics", mutually_exclusive=True)
    ok = inconsistency(ev, [mk("a", "polymarket", 0.5), mk("b", "polymarket", 0.3), mk("c", "polymarket", 0.21)])
    assert ok and not ok.flagged
    bad = inconsistency(ev, [mk("a", "polymarket", 0.6), mk("b", "polymarket", 0.4), mk("c", "polymarket", 0.2)])
    assert bad and bad.flagged and bad.deviation == 0.2 and "every NO" in bad.explanation
