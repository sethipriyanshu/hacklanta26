"""Live orchestration: pull venues, normalize, fill the store. Demo mode never calls anything here except reads."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

from app import normalize as nz
from app.clients import kalshi, polymarket
from app.models import Event, Headline, Market, OrderBook, PricePoint, Trade
from app.store import MarketStore

log = logging.getLogger("tmb.data")

HOUR = 3600
_ttl: dict[str, float] = {}


def _fresh(key: str, ttl: float) -> bool:
    return time.monotonic() - _ttl.get(key, 0.0) < ttl


def _touch(key: str) -> None:
    _ttl[key] = time.monotonic()


# ---------- market lists ----------

async def pull_kalshi(limit: int = 200, pages: int = 2) -> tuple[list[Event], list[Market]]:
    events: list[Event] = []
    markets: list[Market] = []
    cursor: str | None = None
    for _ in range(pages):
        data = await kalshi.events(status="open", limit=limit, cursor=cursor, nested=True)
        for ev in data.get("events", []):
            e, ms = nz.kalshi_event(ev)
            if not ms:
                continue
            events.append(e)
            markets.extend(ms)
        cursor = data.get("cursor")
        if not cursor:
            break
    return events, markets


async def pull_polymarket(limit: int = 100, pages: int = 2) -> tuple[list[Event], list[Market]]:
    events: list[Event] = []
    markets: list[Market] = []
    for page in range(pages):
        rows = await polymarket.gamma_events(limit=limit, offset=page * limit, closed=False, order="volume24hr")
        for ev in rows:
            e, ms = nz.poly_event(ev)
            if not ms:
                continue
            events.append(e)
            markets.extend(ms)
        if len(rows) < limit:
            break
    return events, markets


def _trim(events: list[Event], markets: list[Market], top: int) -> tuple[list[Event], list[Market]]:
    """Keep the top markets by 24h volume plus their siblings' events; drop dust."""
    keep = sorted(markets, key=lambda m: -m.volume_24h)[:top]
    keep_ids = {m.id for m in keep}
    ev_ids = {m.event_id for m in keep}
    evs = [e.model_copy(update={"market_ids": [i for i in e.market_ids if i in keep_ids]}) for e in events if e.id in ev_ids]
    return evs, keep


async def refresh_markets(store: MarketStore, top_per_venue: int = 200) -> None:
    results = await asyncio.gather(pull_kalshi(), pull_polymarket(), return_exceptions=True)
    for venue, res in zip(("kalshi", "polymarket"), results):
        if isinstance(res, BaseException):
            log.warning("%s pull failed: %s", venue, res)
            continue
        evs, ms = _trim(*res, top=top_per_venue)
        store.upsert_markets(evs, ms)
        log.info("%s: %d markets in %d events", venue, len(ms), len(evs))
    store.mode = "live"


# ---------- per-market detail ----------

async def fetch_history(m: Market, *, start_ts: int, end_ts: int, minutes: int) -> list[PricePoint]:
    if m.venue == "kalshi":
        rows = await kalshi.candlesticks(m.meta.get("series", ""), m.ticker, start_ts, end_ts, minutes)
        return nz.kalshi_candles(m.id, rows)
    tokens = m.meta.get("tokens") or []
    if not tokens:
        return []
    rows = await polymarket.prices_history(tokens[0], fidelity_minutes=minutes, start_ts=start_ts, end_ts=end_ts)
    return nz.poly_history(m.id, rows)


async def fetch_trades(m: Market, *, limit: int = 200, start_ts: int | None = None, end_ts: int | None = None) -> list[Trade]:
    if m.venue == "kalshi":
        rows = await kalshi.trades(m.ticker, limit=min(limit, 1000), min_ts=start_ts, max_ts=end_ts)
        return nz.kalshi_trades(m.id, rows)
    cond = m.meta.get("conditionId")
    if not cond:
        return []
    out: list[Trade] = []
    offset = 0
    while len(out) < limit:
        rows = await polymarket.trades(cond, limit=min(500, limit - len(out)), offset=offset)
        if not rows:
            break
        batch = nz.poly_trades(m.id, rows)
        out.extend(batch)
        offset += len(rows)
        if limit > 1000:
            await asyncio.sleep(0.8)  # be polite on long pulls
        if start_ts and batch and batch[-1].ts < start_ts:
            break
        if len(rows) < 100:
            break
    if start_ts or end_ts:
        out = [t for t in out if (not start_ts or t.ts >= start_ts) and (not end_ts or t.ts <= end_ts)]
    return out


async def fetch_book(m: Market) -> OrderBook:
    now = int(datetime.now(timezone.utc).timestamp())
    if m.venue == "kalshi":
        return nz.kalshi_book(m.id, await kalshi.orderbook(m.ticker), now)
    tokens = m.meta.get("tokens") or []
    return nz.poly_book(m.id, await polymarket.book(tokens[0])) if tokens else OrderBook(market_id=m.id, ts=now)


async def fetch_news(m: Market) -> list[Headline]:
    from app.clients import news

    return await news.for_market_title(m.event_title or m.title)


# ---------- cached accessors (live mode) ----------

async def history(store: MarketStore, m: Market, *, hours: int = 168) -> list[PricePoint]:
    key = f"h:{m.id}"
    if not _fresh(key, 120) or m.id not in store.history:
        now = int(time.time())
        try:
            store.history[m.id] = await fetch_history(m, start_ts=now - hours * HOUR, end_ts=now, minutes=60)
            _touch(key)
        except Exception as e:
            log.warning("history %s failed: %s", m.id, e)
    return store.history.get(m.id, [])


async def book(store: MarketStore, m: Market) -> OrderBook:
    key = f"b:{m.id}"
    if not _fresh(key, 20) or m.id not in store.books:
        try:
            store.books[m.id] = await fetch_book(m)
            _touch(key)
        except Exception as e:
            log.warning("book %s failed: %s", m.id, e)
    return store.books.get(m.id) or OrderBook(market_id=m.id, ts=int(time.time()))


async def trades(store: MarketStore, m: Market) -> list[Trade]:
    key = f"t:{m.id}"
    if not _fresh(key, 30) or m.id not in store.trades:
        try:
            store.trades[m.id] = await fetch_trades(m, limit=200)
            _touch(key)
        except Exception as e:
            log.warning("trades %s failed: %s", m.id, e)
    return store.trades.get(m.id, [])


async def news(store: MarketStore, m: Market) -> list[Headline]:
    key = f"n:{m.id}"
    if not _fresh(key, 600) or m.id not in store.news:
        try:
            store.news[m.id] = await fetch_news(m)
            _touch(key)
        except Exception as e:
            log.warning("news %s failed: %s", m.id, e)
    return store.news.get(m.id, [])


async def poll_forever(store: MarketStore, interval: int) -> None:
    while True:
        try:
            await refresh_markets(store)
            from app.services import signals as sv

            sv.recompute(store)
        except Exception as e:  # never let the poller die
            log.exception("poll failed: %s", e)
        await asyncio.sleep(interval)
