from app import normalize as nz

KALSHI_EVENT = {
    "event_ticker": "KXFED-26OCT", "series_ticker": "KXFED", "title": "Fed funds rate after Oct 2026 meeting?", "category": "Economics", "mutually_exclusive": False,
    "markets": [{
        "ticker": "KXFED-26OCT-T4.00", "title": "Will the upper bound be above 4.00%?", "yes_sub_title": "Above 4.00%", "status": "active",
        "yes_bid_dollars": "0.1400", "yes_ask_dollars": "0.1600", "last_price_dollars": "0.1600", "previous_price_dollars": "0.2000",
        "volume_fp": "100.5", "volume_24h_fp": "40.25", "open_interest_fp": "900", "close_time": "2026-10-28T17:55:00Z", "rules_primary": "If above 4.00%, Yes.",
    }],
}
POLY_EVENT = {
    "id": "606422", "slug": "fed-decision-in-october", "title": "Fed Decision in October?", "negRisk": True, "tags": [{"label": "Fed"}, {"label": "Economy"}], "endDate": "2026-10-29T03:59:00Z",
    "markets": [{
        "id": "2589813", "slug": "fed-increase-25", "question": "Will the Fed increase interest rates by 25 bps?", "groupItemTitle": "25 bps increase", "conditionId": "0x12aa",
        "outcomes": '["Yes", "No"]', "outcomePrices": '["0.155", "0.845"]', "clobTokenIds": '["111", "222"]', "bestBid": 0.15, "bestAsk": 0.16, "spread": 0.01,
        "volumeNum": 6677673.0, "volume24hr": 1000.0, "liquidityNum": 50000.0, "endDate": "2026-10-29T03:59:00Z", "description": "Rules…", "closed": False, "oneDayPriceChange": -0.02,
    }],
}


def test_kalshi_event_normalizes_prices_and_category():
    ev, ms = nz.kalshi_event(KALSHI_EVENT)
    assert ev.id == "kalshi:KXFED-26OCT" and ev.category == "Economics"
    m = ms[0]
    assert m.id == "kalshi:KXFED-26OCT-T4.00" and m.yes_price == 0.15 and m.spread == 0.02
    assert m.change_24h == -0.05 and m.volume_24h == 40.25 and m.meta["series"] == "KXFED"


def test_poly_event_normalizes_tokens_and_category():
    ev, ms = nz.poly_event(POLY_EVENT)
    assert ev.mutually_exclusive is True and ev.category == "Economics"
    m = ms[0]
    assert m.id == "poly:2589813" and m.yes_price == 0.155 and m.meta["tokens"] == ["111", "222"]
    assert m.outcomes == ["Yes", "No"] and m.change_24h == -0.02


def test_poly_trades_become_yes_side_view():
    rows = [
        {"side": "BUY", "outcomeIndex": 0, "price": 0.3, "size": 10, "timestamp": 1, "proxyWallet": "0xa", "pseudonym": "Spry-Chair", "outcome": "Yes"},
        {"side": "BUY", "outcomeIndex": 1, "price": 0.7, "size": 5, "timestamp": 2, "proxyWallet": "0xb"},
        {"side": "SELL", "outcomeIndex": 0, "price": 0.3, "size": 1, "timestamp": 3, "proxyWallet": "0xc"},
    ]
    t = nz.poly_trades("poly:1", rows)
    assert (t[0].side, t[0].price) == ("yes", 0.3)
    assert (t[1].side, t[1].price) == ("no", 0.3)   # buying NO at 0.70 == selling YES at 0.30
    assert (t[2].side, t[2].price) == ("no", 0.3)
    assert t[0].wallet_label == "Spry-Chair"


def test_kalshi_book_converts_no_bids_to_yes_asks():
    ob = nz.kalshi_book("kalshi:X", {"yes_dollars": [["0.07", "10"], ["0.09", "5"]], "no_dollars": [["0.89", "7"], ["0.87", "3"]]}, ts=0)
    assert ob.bids[0].price == 0.09 and ob.asks[0].price == 0.11 and ob.asks[1].price == 0.13


def test_bucket_volume_fills_missing_volume():
    from app.models import PricePoint, Trade

    pts = [PricePoint(market_id="p", ts=3600, price=0.5), PricePoint(market_id="p", ts=7200, price=0.6)]
    tr = [Trade(market_id="p", ts=3700, side="yes", price=0.5, size=4), Trade(market_id="p", ts=3900, side="no", price=0.5, size=6)]
    out = nz.bucket_volume(pts, tr, 3600)
    assert out[0].volume == 10 and out[1].volume == 0


def test_categorize():
    assert nz.categorize_kalshi("Financials", "Bitcoin above 100k?") == "Crypto"
    assert nz.categorize_poly([{"label": "Esports"}], "CS2 match") == "Sports"
    assert nz.categorize_poly([], "Will CPI print above 3%?") == "Economics"
