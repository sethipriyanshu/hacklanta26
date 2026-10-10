from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.engines.anomaly import timeline_scores
from app.models.signals import Signal, VenuePair, WalletPanel
from app.services import signals as sv
from app.store import store

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[Signal])
async def list_signals(type: str | None = None, min_score: float = Query(0, ge=0, le=100), scenario: bool = False) -> list[Signal]:
    rows = [s for s in sv.signals.all() if s.score >= min_score and (type is None or s.type == type)]
    if not scenario:
        rows = [s for s in rows if "scenario" not in s.details]
    rows.sort(key=lambda s: -s.score)
    return rows


@router.get("/pairs", response_model=list[VenuePair])
async def list_pairs() -> list[VenuePair]:
    return sv.signals.pairs


@router.get("/pairs/results")
async def pair_results() -> dict[str, object]:
    return sv.signals.pair_results


@router.get("/{market_id}", response_model=list[Signal])
async def market_signals(market_id: str, at: int | None = None) -> list[Signal]:
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    if at is not None:
        s = sv.anomaly_signal(store, m, until=at, use_minute=market_id in store.history_1m)
        return [s] if s else []
    return sorted(sv.signals.by_market.get(market_id, []), key=lambda s: -s.score)


@router.get("/{market_id}/timeline")
async def market_timeline(market_id: str, res: str = Query("1h", pattern="^(1h|1m)$")) -> list[dict[str, float]]:
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    pts = store.history_1m.get(market_id) if res == "1m" else store.history.get(market_id)
    heads = store.news.get(market_id) or None
    return [{"ts": t, "score": s} for t, s in timeline_scores(pts or [], headlines=heads)]


@router.get("/{market_id}/wallets", response_model=WalletPanel)
async def wallets(market_id: str, start: int | None = None, end: int | None = None) -> WalletPanel:
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    return sv.wallet_panel(store, m, start=start, end=end)
