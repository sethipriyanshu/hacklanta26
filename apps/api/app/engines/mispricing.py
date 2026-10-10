"""Cross-venue gap and multi-outcome inconsistency. Simple, explainable, deterministic."""

from __future__ import annotations

from dataclasses import dataclass

from app.models import Event, Market

EST_FEES = 0.02  # round-trip fees across both venues, in price units


@dataclass
class GapResult:
    gap: float
    threshold: float
    edge_cents: float
    flagged: bool
    kalshi_price: float
    poly_price: float
    explanation: str


def cross_venue_gap(kalshi: Market, polys: list[Market]) -> GapResult:
    """Compare a Kalshi contract to the sum of the Polymarket brackets it spans."""
    pk = kalshi.yes_price
    pp = sum(m.yes_price for m in polys)
    gap = abs(pk - pp)
    spread_k = kalshi.spread or 0.02
    spread_p = sum(m.spread or 0.01 for m in polys)
    threshold = spread_k + spread_p + EST_FEES
    edge = round((gap - threshold) * 100, 1)
    flagged = gap > threshold
    cheaper = "Kalshi" if pk < pp else "Polymarket"
    expl = (
        f"Kalshi prices YES at {pk * 100:.1f}¢, Polymarket at {pp * 100:.1f}¢ — a {gap * 100:.1f}¢ gap. "
        f"Spreads and fees cost about {threshold * 100:.1f}¢, so the theoretical edge is {max(edge, 0):.1f}¢ buying on {cheaper}."
        if flagged
        else f"Kalshi {pk * 100:.1f}¢ vs Polymarket {pp * 100:.1f}¢: the {gap * 100:.1f}¢ gap is inside spreads plus fees ({threshold * 100:.1f}¢). No edge."
    )
    return GapResult(gap=round(gap, 4), threshold=round(threshold, 4), edge_cents=edge, flagged=flagged, kalshi_price=pk, poly_price=round(pp, 4), explanation=expl)


@dataclass
class InconsistencyResult:
    total: float
    total_spread: float
    deviation: float
    flagged: bool
    explanation: str


def inconsistency(event: Event, markets: list[Market]) -> InconsistencyResult | None:
    """For mutually exclusive outcomes, YES prices should sum to about 100%."""
    if not event.mutually_exclusive or len(markets) < 3:
        return None
    total = sum(m.yes_price for m in markets)
    total_spread = sum(m.spread or 0.01 for m in markets)
    deviation = total - 1.0
    tolerance = total_spread + 0.01
    flagged = abs(deviation) > tolerance
    direction = "over" if deviation > 0 else "under"
    if flagged and deviation > 0:
        expl = f"The {len(markets)} outcomes sum to {total * 100:.1f}%, {deviation * 100:.1f} points over 100%, beyond the {tolerance * 100:.1f}-point tolerance from spreads. Buying every NO would lock in a profit if fills were available."
    elif flagged:
        expl = f"The {len(markets)} outcomes sum to {total * 100:.1f}%, {abs(deviation) * 100:.1f} points under 100%. Either the listed outcomes are not exhaustive or the market is underpricing the field. Buying every YES only pays if the list is complete."
    else:
        expl = f"The {len(markets)} outcomes sum to {total * 100:.1f}%, within the {tolerance * 100:.1f}-point tolerance from spreads."
    return InconsistencyResult(total=round(total, 4), total_spread=round(total_spread, 4), deviation=round(deviation, 4), flagged=flagged, explanation=expl)
