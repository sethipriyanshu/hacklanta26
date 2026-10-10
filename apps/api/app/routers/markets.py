from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import Category, Event, HistoryResponse, Market, MarketRow, MarketsResponse, Model, NewsResponse, OrderBook, TradesResponse
from app.services import signals as sv
from app.services import market_data as md
from app.settings import get_settings
from app.store import store

router = APIRouter(prefix="/markets", tags=["markets"])
settings = get_settings()


def _get(market_id: str) -> Market:
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    return m


@router.get("", response_model=MarketsResponse)
async def list_markets(
    category: Category | None = None,
    venue: str | None = None,
    q: str | None = None,
    limit: int = Query(200, le=500),
    include_closed: bool = False,
) -> MarketsResponse:
    rows = list(store.markets.values())
    if not include_closed:
        rows = [m for m in rows if m.status != "closed" and not m.meta.get("resolved")]
    if category:
        rows = [m for m in rows if m.category == category]
    if venue:
        rows = [m for m in rows if m.venue == venue]
    if q:
        ql = q.lower()
        rows = [m for m in rows if ql in m.title.lower() or ql in m.event_title.lower() or ql in m.ticker.lower()]
    rows.sort(key=lambda m: -m.volume_24h)
    out: list[MarketRow] = []
    for m in rows[:limit]:
        flags = [{"type": s.type, "score": s.score} for s in sorted(sv.signals.by_market.get(m.id, []), key=lambda s: -s.score) if s.score >= 40 and "scenario" not in s.details]
        out.append(MarketRow(**m.model_dump(by_alias=True), spark=sv.sparkline(store, m.id), flags=flags, max_score=sv.max_score(m.id)))
    return MarketsResponse(markets=out, snapshot=store.snapshot())


@router.get("/{market_id}", response_model=Market)
async def get_market(market_id: str) -> Market:
    return _get(market_id)


class EventResponse(Model):
    event: Event | None
    markets: list[Market]


@router.get("/{market_id}/event", response_model=EventResponse)
async def get_event(market_id: str) -> EventResponse:
    m = _get(market_id)
    ev: Event | None = store.events.get(m.event_id)
    siblings = [store.markets[i] for i in (ev.market_ids if ev else []) if i in store.markets]
    return EventResponse(event=ev, markets=sorted(siblings, key=lambda x: -x.yes_price))


@router.get("/{market_id}/history", response_model=HistoryResponse)
async def get_history(market_id: str, res: str = Query("1h", pattern="^(1h|1m)$")) -> HistoryResponse:
    m = _get(market_id)
    if res == "1m":
        return HistoryResponse(market_id=m.id, resolution="1m", points=store.history_1m.get(m.id, []))
    pts = store.history.get(m.id, []) if settings.demo_mode else await md.history(store, m)
    return HistoryResponse(market_id=m.id, resolution="1h", points=pts)


@router.get("/{market_id}/book", response_model=OrderBook)
async def get_book(market_id: str) -> OrderBook:
    m = _get(market_id)
    if settings.demo_mode:
        return store.books.get(m.id) or OrderBook(market_id=m.id, ts=0)
    return await md.book(store, m)


@router.get("/{market_id}/trades", response_model=TradesResponse)
async def get_trades(market_id: str) -> TradesResponse:
    m = _get(market_id)
    rows = store.trades.get(m.id, []) if settings.demo_mode else await md.trades(store, m)
    return TradesResponse(market_id=m.id, trades=rows)


@router.get("/{market_id}/news", response_model=NewsResponse)
async def get_news(market_id: str) -> NewsResponse:
    m = _get(market_id)
    rows = store.news.get(m.id, []) if settings.demo_mode else await md.news(store, m)
    return NewsResponse(query=m.event_title or m.title, headlines=rows)
