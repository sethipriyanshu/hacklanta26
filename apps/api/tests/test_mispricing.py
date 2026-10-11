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
    assert r2.flagged and r2.edge_cents == 12.0 and "Kalshi" in r2.explanation


def test_gap_sums_polymarket_brackets():
    k = mk("k", "kalshi", 0.16, spread=0.02)
    r = cross_venue_gap(k, [mk("a", "polymarket", 0.155), mk("b", "polymarket", 0.0035)])
    assert r.poly_price == 0.1585 and not r.flagged


def test_inconsistency_needs_mutually_exclusive_event():
    ev = Event(id="e", venue="polymarket", title="e", category="Politics", mutually_exclusive=False)
    assert inconsistency(ev, [mk("a", "polymarket", 0.5)] * 3) is None


def test_inconsistency_judges_bids_and_asks_not_mids():
    ev = Event(id="e", venue="polymarket", title="e", category="Politics", mutually_exclusive=True)
    # Mids sum to 120% but the bids only reach 96¢: no set trade clears $1, so no flag.
    wide = inconsistency(ev, [mk("a", "polymarket", 0.6, yes_bid=0.5, yes_ask=0.7), mk("b", "polymarket", 0.4, yes_bid=0.3, yes_ask=0.5), mk("c", "polymarket", 0.2, yes_bid=0.16, yes_ask=0.24)])
    assert wide and not wide.flagged and wide.deviation == 0.2


def test_inconsistency_flags_bids_over_a_dollar():
    ev = Event(id="e", venue="polymarket", title="e", category="Politics", mutually_exclusive=True)
    r = inconsistency(ev, [mk("a", "polymarket", 0.6, yes_bid=0.59, yes_ask=0.61), mk("b", "polymarket", 0.4, yes_bid=0.39, yes_ask=0.41), mk("c", "polymarket", 0.1, yes_bid=0.09, yes_ask=0.11)])
    assert r and r.flagged and r.side == "over" and abs(r.edge - (1.07 - 1 - 0.015)) < 1e-9 and "every NO" in r.explanation


def test_kalshi_fees_round_up_per_leg():
    from app.engines.mispricing import leg_fee
    assert leg_fee("kalshi", 0.5) == 0.02 and leg_fee("kalshi", 0.95) == 0.01 and leg_fee("polymarket", 0.5) == 0.005
    ev = Event(id="e", venue="kalshi", title="e", category="Politics", mutually_exclusive=True)
    # Bids reach 105¢, but eight one-cent Kalshi fees eat it: no flag.
    legs = [mk(str(i), "kalshi", 0.13, yes_bid=0.13125, yes_ask=0.14) for i in range(8)]
    r = inconsistency(ev, legs)
    assert r and not r.flagged


def test_inconsistency_under_needs_asks_below_a_dollar_and_missing_quotes_count_against():
    ev = Event(id="e", venue="kalshi", title="e", category="Politics", mutually_exclusive=True)
    r = inconsistency(ev, [mk("a", "kalshi", 0.4, yes_bid=0.39, yes_ask=0.4), mk("b", "kalshi", 0.4, yes_bid=0.39, yes_ask=0.4), mk("c", "kalshi", 0.1, yes_bid=0.09, yes_ask=0.1)])
    assert r and r.flagged and r.side == "under" and "list is complete" in r.explanation
    missing = inconsistency(ev, [mk("a", "kalshi", 0.4, yes_bid=0.39, yes_ask=0.4), mk("b", "kalshi", 0.4, yes_bid=0.39, yes_ask=None), mk("c", "kalshi", 0.1)])
    assert missing and not missing.flagged
