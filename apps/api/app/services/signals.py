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
from app.services import games
from app.settings import get_settings
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


# A game market trades hardest from shortly before kickoff to the final whistle; that is expected, not anomalous.
GAME_WINDOW_BEFORE = 3 * HOUR
GAME_WINDOW_AFTER = 8 * HOUR
GAME_WINDOW_CAP = 30.0


def in_game_window(m: Market, ts: int) -> bool:
    """True from three hours before a game's real kickoff until the game is over."""
    start = m.meta.get("gameStartTime")
    if not start or ts < start - GAME_WINDOW_BEFORE:
        return False
    return games.game_state(m, ts) != "over" or ts <= start + GAME_WINDOW_AFTER


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
    if in_game_window(m, until or int(time.time())) and r.score > GAME_WINDOW_CAP:
        # Around a game, a surge in trading and big price swings are the game itself, not a signal. Keep the
        # score for the record but hold it under the flag line, and say why.
        r.details["gameWindow"] = True
        r.details["rawScore"] = r.score
        r.score = GAME_WINDOW_CAP
        r.explanation += " The game is under way or about to start, when heavy trading and big moves are normal, so this is not flagged."
    return Signal(market_id=m.id, type="anomaly", score=r.score, sub_scores=r.sub_scores, weights=r.weights, explanation=r.explanation, detected_at=_now(), as_of=until, details=r.details)


def gap_signals(store: MarketStore, pairs: list[VenuePair]) -> list[Signal]:
    out: list[Signal] = []
    for p in pairs:
        k = store.markets.get(p.kalshi_id)
        polys = [store.markets[i] for i in p.poly_ids if i in store.markets]
        if not k or not polys or p.match == "different":
            continue
        g = mp.cross_venue_gap(k, polys)
        # A gap only means something if both sides actually trade. Future games sit at a default price on one
        # venue, so a "20¢ edge" there is noise, not arbitrage — keep the pair, but do not flag it.
        thin = (k.volume_24h or 0) < 1000 or any((x.volume_24h or 0) < 1000 for x in polys)
        # Entity matches (same name, but resolution rules unverified) are informational, never flagged as an edge.
        # During a game both venues reprice every play, at different speeds; a gap then is stale quotes, not an edge.
        live_game = any(in_game_window(x, int(time.time())) for x in [k, *polys])
        flagged = g.flagged and not thin and not live_game and not p.id.startswith("autoent:")
        signals.pair_results[p.id] = {"pair": p.model_dump(by_alias=True), "gap": {**g.__dict__, "flagged": flagged, "thin": thin, "liveGame": live_game}}
        # Unflagged gaps (thin, inside costs, or name-only matches) are information, never a flag: keep them under 40.
        # A real edge beyond costs is always a flag (40+); stronger edges score higher.
        score = min(100.0, max(40.0, g.edge_cents * 12)) if flagged else min(30.0, max(0.0, g.gap * 100))
        note = " One side is thinly traded, so the gap is not a real edge yet." if (g.flagged and thin) else " The game is under way or about to start, when the two venues reprice at different speeds, so the gap is not flagged." if (g.flagged and live_game) else ""
        # The rules verdict travels as structured details (match, checkedBy, reason), not appended to the sentence.
        expl = g.explanation + note
        for mid in [k.id] + [x.id for x in polys]:
            out.append(Signal(market_id=mid, type="gap", score=round(score, 1), sub_scores={"gapCents": round(g.gap * 100, 1), "thresholdCents": round(g.threshold * 100, 1), "edgeCents": g.edge_cents}, explanation=expl, detected_at=_now(), details={"pairId": p.id, "kalshiId": k.id, "polyIds": [x.id for x in polys], "kalshiPrice": g.kalshi_price, "polyPrice": g.poly_price, "match": p.match, "checkedBy": p.checked_by, "reason": p.reason, "flagged": flagged}))
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
        # An outcome sum is context, never a flag: venues list partial fields and thin legs rarely fill as a set.
        score = min(30.0, max(0.0, (max(r.sum_bids - 1.0, 1.0 - r.sum_asks, 0.0)) * 100 * 3))
        for m in ms:
            out.append(Signal(market_id=m.id, type="inconsistency", score=round(score, 1), sub_scores={"sumPct": round(r.total * 100, 1), "bidSumCents": round(r.sum_bids * 100, 1), "askSumCents": round(r.sum_asks * 100, 1), "edgeCents": round(r.edge * 100, 1)}, explanation=r.explanation, detected_at=_now(), details={"eventId": ev.id, "outcomes": len(ms), "flagged": False, "side": r.side}))
    return out


def recompute(store: MarketStore) -> None:
    t0 = time.monotonic()
    from app.services.demo_cases import demo, is_demo

    by: dict[str, list[Signal]] = {}
    for m in list(store.markets.values()):
        if is_demo(m.id):
            continue  # frozen demo copies keep the signals they were captured with
        s = anomaly_signal(store, m)
        if s:
            by.setdefault(m.id, []).append(s)
    # Curated/LLM-verified pairs, plus live auto-matched games and same-name outcomes (politics, awards, etc.).
    mkts = [m for m in store.markets.values() if not is_demo(m.id)]
    auto = matching.sports_pairs(mkts) + matching.entity_pairs(mkts)
    all_pairs: list = list(signals.pairs)
    seen = {(p.kalshi_id, frozenset(p.poly_ids)) for p in all_pairs}
    for p in auto:
        key = (p.kalshi_id, frozenset(p.poly_ids))
        if key not in seen:
            seen.add(key)
            all_pairs.append(p)
    for s in gap_signals(store, all_pairs) + inconsistency_signals(store):
        by.setdefault(s.market_id, []).append(s)
    for mid, sigs in demo.signals.items():
        by[mid] = list(sigs)
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


def is_listable(store: MarketStore, m: Market, now: datetime | None = None, *, everything: bool = False) -> bool:
    """One definition of 'a market the scanner shows', shared by the market list and every flag count.

    Live mode seeds the frozen snapshot for scenario replays, then polls fresh markets on top. Keep the scanner
    to genuinely live, tradeable contracts: only the latest poll's markets, nothing past close, and nothing the
    venue has stopped accepting orders on (settled or paused, even if not yet flagged closed).
    `everything` (used by search) skips the top-by-volume trim and admits every market in the latest poll.
    """
    if m.status == "closed" or m.meta.get("resolved") or m.id.startswith("demo:"):
        return False  # demo copies are listed only on /demo
    if get_settings().demo_mode:
        return True
    now = now or datetime.now(timezone.utc)
    if m.close_time is not None and m.close_time <= now:
        return False
    if m.meta.get("acceptingOrders", True) is False:
        return False
    ids = store.polled_ids if everything else store.live_ids
    return not ids or m.id in ids


def sparkline(store: MarketStore, market_id: str, n: int = 24) -> list[float]:
    pts = store.history.get(market_id)
    if not pts:
        return []
    bars = an.resample_hourly(pts)
    return [round(b.close, 4) for b in bars[-n:]]


def max_score(market_id: str) -> float:
    return max((s.score for s in signals.by_market.get(market_id, []) if "scenario" not in s.details), default=0.0)
