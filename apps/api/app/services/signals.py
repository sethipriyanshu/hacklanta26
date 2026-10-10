"""Compute every signal from what the store holds. Runs after each poll in live mode and once at startup in demo mode."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from app.engines import anomaly as an
from app.engines import matching
from app.engines import mispricing as mp
from app.engines.wallets import build_panel
from app.models import Market
from app.models.signals import Signal, VenuePair, WalletPanel
from app.scenarios import SCENARIOS
from app.store import MarketStore

log = logging.getLogger("tmb.signals")
HOUR = 3600


class SignalIndex:
    def __init__(self) -> None:
        self.by_market: dict[str, list[Signal]] = {}
        self.pairs: list[VenuePair] = []
        self.pair_results: dict[str, dict[str, object]] = {}
        self.computed_at: datetime | None = None

    def all(self) -> list[Signal]:
        return [s for rows in self.by_market.values() for s in rows]


signals = SignalIndex()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def anomaly_signal(store: MarketStore, m: Market, *, until: int | None = None, use_minute: bool = False) -> Signal | None:
    pts = store.history_1m.get(m.id) if use_minute else store.history.get(m.id)
    if not pts:
        return None
    heads = store.news.get(m.id) or None
    wallet_share: float | None = None
    if m.venue == "polymarket" and store.trades.get(m.id):
        end = until or int(time.time())
        panel = build_panel(m.id, store.trades[m.id], start=end - 24 * HOUR, end=end, wallet_meta=store.wallet_meta.get(m.id))
        if panel.total_buy_size > 0 and store.wallet_meta.get(m.id):
            wallet_share = panel.fresh_share
    r = an.anomaly_score(pts, until=until, wallet_fresh_share=wallet_share, headlines=heads)
    return Signal(market_id=m.id, type="anomaly", score=r.score, sub_scores=r.sub_scores, weights=r.weights, explanation=r.explanation, detected_at=_now(), as_of=until, details=r.details)


def gap_signals(store: MarketStore, pairs: list[VenuePair]) -> list[Signal]:
    out: list[Signal] = []
    for p in pairs:
        k = store.markets.get(p.kalshi_id)
        polys = [store.markets[i] for i in p.poly_ids if i in store.markets]
        if not k or not polys or p.match == "different":
            continue
        g = mp.cross_venue_gap(k, polys)
        signals.pair_results[p.id] = {"pair": p.model_dump(by_alias=True), "gap": g.__dict__}
        score = min(100.0, max(0.0, g.edge_cents * 12)) if g.flagged else max(0.0, g.gap * 100 * 2)
        expl = g.explanation + (f" Rule check ({p.checked_by}): {p.match} — {p.reason}" if p.reason else "")
        for mid in [k.id] + [x.id for x in polys]:
            out.append(Signal(market_id=mid, type="gap", score=round(score, 1), sub_scores={"gapCents": round(g.gap * 100, 1), "thresholdCents": round(g.threshold * 100, 1), "edgeCents": g.edge_cents}, explanation=expl, detected_at=_now(), details={"pairId": p.id, "kalshiId": k.id, "polyIds": [x.id for x in polys], "kalshiPrice": g.kalshi_price, "polyPrice": g.poly_price, "match": p.match, "flagged": g.flagged}))
    return out


def inconsistency_signals(store: MarketStore) -> list[Signal]:
    out: list[Signal] = []
    for ev in store.events.values():
        ms = [store.markets[i] for i in ev.market_ids if i in store.markets and store.markets[i].status != "closed"]
        if ev.total_markets is None or len(ms) < ev.total_markets:
            continue  # unknown or partial event in the snapshot; a sum would be meaningless
        r = mp.inconsistency(ev, ms)
        if r is None:
            continue
        if r.flagged and r.deviation > 0:
            score = min(100.0, r.deviation * 100 * 8)
        elif r.flagged:
            score = min(45.0, abs(r.deviation) * 100 * 1.5)  # under 100: list may simply not be exhaustive
        else:
            score = min(30.0, abs(r.deviation) * 100 * 2)
        for m in ms:
            out.append(Signal(market_id=m.id, type="inconsistency", score=round(score, 1), sub_scores={"sumPct": round(r.total * 100, 1), "deviationPts": round(r.deviation * 100, 1), "tolerancePts": round((r.total_spread + 0.01) * 100, 1)}, explanation=r.explanation, detected_at=_now(), details={"eventId": ev.id, "outcomes": len(ms), "flagged": r.flagged}))
    return out


def recompute(store: MarketStore) -> None:
    t0 = time.monotonic()
    by: dict[str, list[Signal]] = {}
    for m in store.markets.values():
        s = anomaly_signal(store, m)
        if s:
            by.setdefault(m.id, []).append(s)
    for s in gap_signals(store, signals.pairs) + inconsistency_signals(store):
        by.setdefault(s.market_id, []).append(s)
    # Replay scenarios: score the minute window as of one hour before the headline, so the pin lands before the news.
    for sc in SCENARIOS:
        if sc.market_id and sc.headline and sc.market_id in store.history_1m:
            head = int(sc.headline.at.timestamp())
            best: Signal | None = None
            for t in range(head - 12 * HOUR, head, HOUR):  # the peak hour before the news is the pin
                s = anomaly_signal(store, store.markets[sc.market_id], until=t, use_minute=True)
                if s and (best is None or s.score > best.score):
                    best = s
            if best:
                best.details["scenario"] = sc.id
                best.details["headlineAt"] = head
                by.setdefault(sc.market_id, []).append(best)
    signals.by_market = by
    signals.computed_at = _now()
    flagged = sum(1 for s in signals.all() if s.score >= 40)
    log.info("signals: %d markets scored, %d flagged (>=40) in %.2fs", len(by), flagged, time.monotonic() - t0)


def load_pairs() -> None:
    signals.pairs = matching.load_pairs()


def wallet_panel(store: MarketStore, m: Market, *, start: int | None, end: int | None) -> WalletPanel:
    trades = store.trades.get(m.id, [])
    e = end or (max((t.ts for t in trades), default=int(time.time())))
    s = start or (e - 24 * HOUR)
    return build_panel(m.id, trades, start=s, end=e, wallet_meta=store.wallet_meta.get(m.id))


def sparkline(store: MarketStore, market_id: str, n: int = 24) -> list[float]:
    pts = store.history.get(market_id)
    if not pts:
        return []
    bars = an.resample_hourly(pts)
    return [round(b.close, 4) for b in bars[-n:]]


def max_score(market_id: str) -> float:
    return max((s.score for s in signals.by_market.get(market_id, []) if "scenario" not in s.details), default=0.0)
