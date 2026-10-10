from app.engines.wallets import build_panel
from app.models import Trade


def tr(w, size, ts=100, side="yes"):
    return Trade(market_id="m", ts=ts, side=side, price=0.1, size=size, wallet=w)


def test_panel_ranks_and_flags_fresh_wallets():
    trades = [tr("a", 100), tr("a", 50), tr("b", 30), tr("c", 20, side="no"), tr("d", 10, ts=5)]
    meta = {"a": {"firstSeen": 100 - 2 * 86400, "priorTrades": 1}, "b": {"firstSeen": 100 - 400 * 86400, "priorTrades": 900}}
    p = build_panel("m", trades, start=50, end=200, wallet_meta=meta)
    assert [w.wallet for w in p.wallets] == ["a", "b"]
    assert p.wallets[0].fresh and not p.wallets[1].fresh
    assert p.total_buy_size == 180 and p.fresh_share == round(150 / 180, 4)
    assert p.wallets[0].share == round(150 / 180, 4)
