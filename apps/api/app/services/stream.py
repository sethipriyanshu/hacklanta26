"""Live order-book streaming. Polymarket pushes over WebSocket; Kalshi has no public socket (needs an API key),
so it is fast-polled. Both yield the same normalized OrderBook, so the UI renders one shape either way."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator

from app.clients import poly_ws
from app.models import BookLevel, Market, OrderBook
from app.services import market_data as md

log = logging.getLogger("tmb.stream")

KALSHI_POLL_SECONDS = 1.5
MIN_EMIT_INTERVAL = 0.15  # coalesce bursty price deltas so we emit at most ~7/s


def _orderbook(market_id: str, bids: dict[float, float], asks: dict[float, float]) -> OrderBook:
    b = sorted((BookLevel(price=p, size=s) for p, s in bids.items() if s > 0), key=lambda l: -l.price)[:12]
    a = sorted((BookLevel(price=p, size=s) for p, s in asks.items() if s > 0), key=lambda l: l.price)[:12]
    return OrderBook(market_id=market_id, ts=int(time.time()), bids=b, asks=a)


async def _poly_book_events(m: Market) -> AsyncIterator[OrderBook]:
    token = (m.meta.get("tokens") or [None])[0]
    if not token:
        while True:  # nothing to stream; hold the SSE open so the client shows a snapshot rather than reconnect-looping
            await asyncio.sleep(30)
    bids: dict[float, float] = {}
    asks: dict[float, float] = {}
    last_emit = 0.0
    async for e in poly_ws.stream_token(token):
        et = e.get("event_type")
        if et == "book" and e.get("asset_id") == token:
            bids = {float(l["price"]): float(l["size"]) for l in e.get("bids", [])}
            asks = {float(l["price"]): float(l["size"]) for l in e.get("asks", [])}
        elif et == "price_change":
            touched = False
            for c in e.get("price_changes", []):
                if c.get("asset_id") != token:
                    continue
                price, size = float(c["price"]), float(c["size"])
                side = (c.get("side") or "").upper()
                book = bids if side == "BUY" else asks
                if size <= 0:
                    book.pop(price, None)
                else:
                    book[price] = size
                touched = True
            if not touched:
                continue
        else:
            continue
        now = time.monotonic()
        if now - last_emit < MIN_EMIT_INTERVAL:
            continue
        last_emit = now
        yield _orderbook(m.id, bids, asks)


async def _kalshi_book_events(m: Market) -> AsyncIterator[OrderBook]:
    while True:
        try:
            yield await md.fetch_book(m)
        except Exception as e:  # noqa: BLE001
            log.warning("kalshi book poll %s failed: %s", m.id, e)
        await asyncio.sleep(KALSHI_POLL_SECONDS)


def book_events(m: Market) -> AsyncIterator[OrderBook]:
    """Live order book for a market: WebSocket for Polymarket, fast poll for Kalshi."""
    return _poly_book_events(m) if m.venue == "polymarket" else _kalshi_book_events(m)
