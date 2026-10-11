from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.models import (
    Category,
    Event,
    HistoryResponse,
    Market,
    MarketRow,
    MarketsResponse,
    Model,
    NewsResponse,
    OrderBook,
    TradesResponse,
)
from app.services import demo_cases as dc
from app.services import games
from app.services import market_data as md
from app.services import signals as sv
from app.services import stream as st
from app.services import summary as summ
from app.settings import get_settings
from app.store import store

router = APIRouter(prefix="/markets", tags=["markets"])
# The only meta a list row needs (game state and league); token ids, condition ids and the like stay on the market page.
LIST_META = {"league", "gameStartTime", "gameStatus", "gameLive", "gameEnded", "score", "period", "game", "acceptingOrders", "resolved"}
settings = get_settings()


def _get(market_id: str) -> Market:
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    return m


def _frozen(m: Market) -> bool:
    """Serve from the store only: fixture-only demo mode, or a frozen /demo copy."""
    return settings.demo_mode or dc.is_demo(m.id)


def _is_live_now(m: Market, now: datetime) -> bool:
    """A game in progress, judged by the venue's own game state (see services.games)."""
    return games.is_live(m, int(now.timestamp()))


@router.get("", response_model=MarketsResponse)
async def list_markets(
    category: Category | None = None,
    venue: str | None = None,
    q: str | None = None,
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
    include_closed: bool = False,
    live: bool = False,
    league: str | None = None,
    sort: str = Query("volume", pattern="^(volume|score)$"),
    demo: bool = False,
) -> MarketsResponse:
    now = datetime.now(timezone.utc)
    rows = list(store.markets.values())
    if not include_closed:
        # A search looks across every polled market, not just the scanner's top-by-volume set.
        rows = [m for m in rows if sv.is_listable(store, m, now, everything=bool(q))]
    if demo:
        # /demo: the frozen past flags first, then the live list as usual.
        rows = [store.markets[i] for i in dc.demo.order if i in store.markets] + rows
    if live:
        rows = [m for m in rows if _is_live_now(m, now)]
    if league:
        rows = [m for m in rows if m.meta.get("league") == league]
    if category:
        rows = [m for m in rows if m.category == category]
    if venue:
        rows = [m for m in rows if m.venue == venue]
    if q:
        ql = q.lower()
        rows = [m for m in rows if ql in m.title.lower() or ql in m.event_title.lower() or ql in m.ticker.lower()]
    if sort == "score" and demo:
        pinned = {i: n for n, i in enumerate(dc.demo.order)}
        rows.sort(key=lambda m: (0, pinned[m.id]) if m.id in pinned else (1, -(s if (s := sv.max_score(m.id)) >= 40 else 0.0), -m.volume_24h))
    elif sort == "score":
        # Flagged markets first (by their strongest signal), then everything else by volume.
        # Only a flag (40+) earns a place above volume order; sub-flag scores are noise to a reader.
        rows.sort(key=lambda m: (-(s if (s := sv.max_score(m.id)) >= 40 else 0.0), -m.volume_24h))
    else:
        rows.sort(key=lambda m: -m.volume_24h)
    out: list[MarketRow] = []
    for m in rows[offset : offset + limit]:
        flags = [{"type": s.type, "score": s.score, "explanation": s.explanation, "subScores": s.sub_scores} for s in sorted(sv.signals.by_market.get(m.id, []), key=lambda s: -s.score) if s.score >= 40 and "scenario" not in s.details]
        # List rows never carry the rules text: it is the bulk of every market and only the market page shows it.
        row = m.model_dump(by_alias=True)
        row["rulesText"] = ""
        row["meta"] = {k: v for k, v in m.meta.items() if k in LIST_META}
        out.append(MarketRow(**row, spark=sv.sparkline(store, m.id), flags=flags, max_score=sv.max_score(m.id), live=not dc.is_demo(m.id) and _is_live_now(m, now)))
    return MarketsResponse(markets=out, total=len(rows), snapshot=store.snapshot())


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
    pts = store.history.get(m.id, []) if _frozen(m) else await md.history(store, m)
    return HistoryResponse(market_id=m.id, resolution="1h", points=pts)


@router.get("/{market_id}/book", response_model=OrderBook)
async def get_book(market_id: str) -> OrderBook:
    m = _get(market_id)
    if _frozen(m):
        return store.books.get(m.id) or OrderBook(market_id=m.id, ts=0)
    return await md.book(store, m)


@router.get("/{market_id}/book/stream")
async def stream_book(market_id: str) -> EventSourceResponse:
    """Live order book over SSE: a `book` event per update. Polymarket pushes via WebSocket; Kalshi is fast-polled."""
    m = _get(market_id)

    async def gen():
        if _frozen(m):  # a frozen book never changes: send it once and hold the stream open
            yield {"event": "book", "data": (store.books.get(m.id) or OrderBook(market_id=m.id, ts=0)).model_dump_json(by_alias=True)}
            while True:
                await asyncio.sleep(3600)
        try:
            async for ob in st.book_events(m):
                yield {"event": "book", "data": ob.model_dump_json(by_alias=True)}
        except asyncio.CancelledError:  # client disconnected; close the upstream socket/poll
            raise

    return EventSourceResponse(gen())


@router.get("/{market_id}/trades", response_model=TradesResponse)
async def get_trades(market_id: str) -> TradesResponse:
    m = _get(market_id)
    rows = store.trades.get(m.id, []) if _frozen(m) else await md.trades(store, m)
    return TradesResponse(market_id=m.id, trades=rows)


@router.get("/{market_id}/summary")
async def market_summary(market_id: str) -> dict[str, object]:
    """Plain-language 'understand this market' summary for the learning view. LLM when live, templated otherwise."""
    m = _get(market_id)
    s, source = await summ.generate(store, m)
    return {"plainTitle": s.plain_title, "summary": s.summary, "whatsNotable": s.whats_notable, "concepts": s.concepts, "source": source}


@router.get("/{market_id}/news", response_model=NewsResponse)
async def get_news(market_id: str) -> NewsResponse:
    m = _get(market_id)
    rows = store.news.get(m.id, []) if _frozen(m) else await md.news(store, m)
    return NewsResponse(query=m.event_title or m.title, headlines=rows)
