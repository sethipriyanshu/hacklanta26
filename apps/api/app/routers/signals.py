from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.engines.anomaly import timeline_scores
from app.models.signals import Signal, VenuePair, WalletPanel
from app.services import demo_cases as dc
from app.services import signals as sv
from app.store import store

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[Signal])
async def list_signals(type: str | None = None, min_score: float = Query(0, ge=0, le=100)) -> list[Signal]:
    rows = [s for s in sv.signals.all() if s.score >= min_score and (type is None or s.type == type)]
    # Same universe as the market list, so every flag count in the UI agrees.
    rows = [s for s in rows if (m := store.markets.get(s.market_id)) is not None and sv.is_listable(store, m)]
    rows.sort(key=lambda s: -s.score)
    return rows


@router.get("/pairs", response_model=list[VenuePair])
async def list_pairs() -> list[VenuePair]:
    return sv.signals.pairs


@router.get("/pairs/results")
async def pair_results(flagged: bool = True, limit: int = Query(200, ge=1, le=2000), demo: bool = False) -> dict[str, object]:
    """Cross-venue pair results. Flagged pairs only by default: there are ~14k name matches, too many to ship whole."""
    rows = [(k, v) for k, v in sv.signals.pair_results.items() if not flagged or v["gap"].get("flagged")]
    rows.sort(key=lambda kv: -float(kv[1]["gap"].get("gap") or 0))
    if demo:
        rows = list(dc.demo.pair_results.items()) + rows
    return dict(rows[:limit])


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
    out = [{"ts": t, "score": s} for t, s in timeline_scores(pts or [], headlines=heads)]
    # A frozen demo copy ends at the hour it was flagged; make sure that moment is on its timeline.
    for sig in dc.demo.signals.get(market_id, []):
        if sig.type == "anomaly" and sig.as_of and not any(r["score"] >= 40 for r in out[-3:]):
            out.append({"ts": min(sig.as_of, max((p.ts for p in pts or []), default=sig.as_of)), "score": sig.score})  # pin on the last bar drawn
    return out


@router.get("/{market_id}/wallets", response_model=WalletPanel)
async def wallets(market_id: str, start: int | None = None, end: int | None = None) -> WalletPanel:
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    return sv.wallet_panel(store, m, start=start, end=end)
