"""Cross-venue gap and multi-outcome inconsistency. Simple, explainable, deterministic."""

from __future__ import annotations

import math

from dataclasses import dataclass

from app.models import Event, Market

@dataclass
class GapResult:
    gap: float
    threshold: float
    edge_cents: float
    flagged: bool
    kalshi_price: float
    poly_price: float
    explanation: str


# A gap must leave at least this much per $1 after costs to flag; a cent flickers in and out with every quote.
MIN_EDGE = 0.02


def quotes(m: Market) -> tuple[float, float]:
    """Best YES bid and ask. Without a book, fall back to mid ± half the spread; with neither, assume no fill (0 / $1)."""
    if m.yes_bid is not None and m.yes_ask is not None:
        return m.yes_bid, m.yes_ask
    if m.spread is not None:
        return max(0.0, m.yes_price - m.spread / 2), min(1.0, m.yes_price + m.spread / 2)
    return 0.0, 1.0


def cross_venue_gap(kalshi: Market, polys: list[Market]) -> GapResult:
    """Compare a Kalshi contract to the sum of the Polymarket brackets it spans, as an executable trade:
    buy YES where it is cheap at the ask, buy NO where it is dear at (1 - bid). Both legs pay $1 together."""
    pk = kalshi.yes_price
    pp = sum(m.yes_price for m in polys)
    gap = abs(pk - pp)
    kb, ka = quotes(kalshi)
    pq = [quotes(m) for m in polys]
    pb, pa = sum(b for b, _ in pq), sum(a for _, a in pq)
    if pk < pp:  # YES on Kalshi, NO on Polymarket
        fees = leg_fee("kalshi", ka) + sum(leg_fee("polymarket", 1 - b) for b, _ in pq)
        edge_d = pb - ka - fees
        cheaper = "Kalshi"
    else:  # YES on Polymarket, NO on Kalshi
        fees = leg_fee("kalshi", 1 - kb) + sum(leg_fee("polymarket", a) for _, a in pq)
        edge_d = kb - pa - fees
        cheaper = "Polymarket"
    edge = round(edge_d * 100, 1)
    threshold = max(0.0, gap - edge_d)  # everything the trade loses to spreads and fees
    flagged = edge_d >= MIN_EDGE
    expl = (
        f"Kalshi prices YES at {pk * 100:.1f}¢, Polymarket at {pp * 100:.1f}¢ — a {gap * 100:.1f}¢ gap. "
        f"Crossing both spreads and paying fees costs about {threshold * 100:.1f}¢, leaving {edge:.1f}¢ buying YES on {cheaper} and NO on the other."
        if flagged
        else f"Kalshi {pk * 100:.1f}¢ vs Polymarket {pp * 100:.1f}¢: the {gap * 100:.1f}¢ gap is eaten by spreads and fees ({threshold * 100:.1f}¢). No edge."
    )
    return GapResult(gap=round(gap, 4), threshold=round(threshold, 4), edge_cents=max(edge, 0.0), flagged=flagged, kalshi_price=pk, poly_price=round(pp, 4), explanation=expl)


@dataclass
class InconsistencyResult:
    total: float
    total_spread: float
    deviation: float
    flagged: bool
    explanation: str
    side: str | None = None  # "over": buy every NO; "under": buy every YES (only if the list is complete)
    edge: float = 0.0  # dollars per set after the fee allowance
    sum_bids: float = 0.0
    sum_asks: float = 0.0


def leg_fee(venue: str, price: float) -> float:
    """Cost of one contract on one leg. Kalshi charges 7% of p(1-p), rounded up to a whole cent per order;
    Polymarket charges no trading fee on most markets, so allow half a cent of slippage per leg."""
    if venue == "kalshi":
        return math.ceil(0.07 * price * (1 - price) * 100 - 1e-9) / 100 or 0.01
    return 0.005


def inconsistency(event: Event, markets: list[Market]) -> InconsistencyResult | None:
    """For mutually exclusive outcomes exactly one YES pays $1, so a full set of YES is worth $1.

    Judged on executable quotes, not mids: if the YES bids add to more than $1, buying every NO locks in the excess
    (true even if the list is incomplete); if the YES asks add to less than $1, buying every YES pays the shortfall,
    but only when the list is complete. A missing quote counts against the trade (bid 0, ask $1)."""
    if not event.mutually_exclusive or len(markets) < 2:
        return None
    n = len(markets)
    total = sum(m.yes_price for m in markets)
    sum_bids = sum(m.yes_bid if m.yes_bid is not None else 0.0 for m in markets)
    sum_asks = sum(m.yes_ask if m.yes_ask is not None else 1.0 for m in markets)
    # Over: buy every NO, each at (1 - YES bid). Under: buy every YES at its ask.
    fee_over = sum(leg_fee(m.venue, 1.0 - (m.yes_bid or 0.0)) for m in markets)
    fee_under = sum(leg_fee(m.venue, m.yes_ask if m.yes_ask is not None else 1.0) for m in markets)
    over = sum_bids - 1.0 - fee_over
    under = 1.0 - sum_asks - fee_under
    fee = fee_over if over > 0 else fee_under
    deviation = total - 1.0
    if over > 0:
        side, edge = "over", over
        expl = f"The best YES bids across all {n} outcomes add up to {sum_bids * 100:.1f}¢, but only one outcome can pay $1. Buying every NO locks in about {over * 100:.1f}¢ per set after a {fee * 100:.1f}¢ fee and slippage allowance, if the quotes fill."
    elif under > 0:
        side, edge = "under", under
        expl = f"Buying every YES at the asking price costs {sum_asks * 100:.1f}¢ for a set that pays $1 when one of the {n} listed outcomes wins: about {under * 100:.1f}¢ left after a {fee * 100:.1f}¢ fee and slippage allowance. It only pays if the list is complete."
    else:
        side, edge = None, 0.0
        expl = f"The {n} outcomes' mid prices sum to {total * 100:.1f}%. Buying every YES costs {sum_asks * 100:.1f}¢ and selling every YES fetches {sum_bids * 100:.1f}¢, so no set trade clears $1 after costs."
    return InconsistencyResult(
        total=round(total, 4), total_spread=round(sum_asks - sum_bids, 4), deviation=round(deviation, 4), flagged=side is not None,
        explanation=expl, side=side, edge=round(edge, 4), sum_bids=round(sum_bids, 4), sum_asks=round(sum_asks, 4),
    )