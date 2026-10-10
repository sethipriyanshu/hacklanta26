"""Polymarket wallet concentration. Aggregates recent YES buying per wallet and flags fresh wallets.
UI copy must never name or accuse anyone: addresses are shown truncated with the venue's own pseudonym."""

from __future__ import annotations

from app.models import Trade
from app.models.signals import WalletPanel, WalletStat

FRESH_DAYS = 7
FRESH_TRADES = 5


def build_panel(market_id: str, trades: list[Trade], *, start: int, end: int, wallet_meta: dict[str, dict[str, int | None]] | None = None, top: int = 10) -> WalletPanel:
    """wallet_meta maps wallet -> {firstSeen, priorTrades} gathered from the venue's activity feed (optional)."""
    meta = wallet_meta or {}
    agg: dict[str, WalletStat] = {}
    for t in trades:
        if t.side != "yes" or not t.wallet or not (start <= t.ts <= end):
            continue
        s = agg.get(t.wallet)
        if s is None:
            s = agg[t.wallet] = WalletStat(wallet=t.wallet, label=t.wallet_label, buy_size=0.0, trades=0)
        s.buy_size += t.size
        s.trades += 1
    total = sum(s.buy_size for s in agg.values())
    for s in agg.values():
        m = meta.get(s.wallet, {})
        s.first_seen = m.get("firstSeen")
        s.prior_trades = m.get("priorTrades")
        covered = s.first_seen is not None and s.first_seen <= end  # the activity feed reaches back past the window
        age_fresh = covered and 0 <= (end - s.first_seen) < FRESH_DAYS * 86400  # type: ignore[operator]
        count_fresh = covered and s.prior_trades is not None and s.prior_trades < FRESH_TRADES
        s.fresh = bool(age_fresh or count_fresh)
        s.share = round(s.buy_size / total, 4) if total else 0.0
        s.buy_size = round(s.buy_size, 2)
    ranked = sorted(agg.values(), key=lambda s: -s.buy_size)[:top]
    fresh_share = round(sum(s.buy_size for s in agg.values() if s.fresh) / total, 4) if total else 0.0
    return WalletPanel(market_id=market_id, window_start=start, window_end=end, total_buy_size=round(total, 2), fresh_share=fresh_share, wallets=ranked)
