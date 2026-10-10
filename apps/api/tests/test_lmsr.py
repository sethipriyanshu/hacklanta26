import math

from app.engines.lmsr import LMSR


def test_starts_at_requested_price():
    for p in (0.1, 0.5, 0.875):
        assert math.isclose(LMSR.at_price(p, 1000).price(), p, abs_tol=1e-9)


def test_price_bounded_and_monotonic():
    m = LMSR.at_price(0.5, 500)
    last = m.price()
    for _ in range(50):
        m.buy("yes", 200)
        p = m.price()
        assert last < p < 1.0
        last = p
    for _ in range(120):
        m.buy("no", 200)
        p = m.price()
        assert 0.0 < p < last
        last = p


def test_buy_cost_matches_dollars():
    m = LMSR.at_price(0.3, 800)
    before = m.cost()
    m.buy("yes", 123.4)
    assert math.isclose(m.cost() - before, 123.4, rel_tol=1e-9)


def test_liquidity_dampens_moves():
    thin, deep = LMSR.at_price(0.5, 100), LMSR.at_price(0.5, 10_000)
    thin.buy("yes", 500)
    deep.buy("yes", 500)
    assert thin.price() - 0.5 > 10 * (deep.price() - 0.5)
