"""Live orchestration: pull venues, normalize, fill the store. Demo mode never calls anything here except reads."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

from app import normalize as nz
from app.clients import kalshi, polymarket
from app.models import Event, Headline, Market, OrderBook, PricePoint, Trade
from app.services import games
from app.store import MarketStore

log = logging.getLogger("tmb.data")

HOUR = 3600
_ttl: dict[str, float] = {}


def _fresh(key: str, ttl: float) -> bool:
    return time.monotonic() - _ttl.get(key, 0.0) < ttl


def _touch(key: str) -> None:
    _ttl[key] = time.monotonic()


# ---------- market lists ----------

# Kalshi game-level markets live under dedicated series the default open feed never surfaces; these are the
# in-season leagues that also exist on Polymarket, so cross-venue game matching has both sides.
KALSHI_GAME_SERIES = ["KXNFLGAME", "KXNBAGAME", "KXNHLGAME", "KXMLBGAME", "KXNCAAFGAME", "KXEPLGAME", "KXUCLGAME", "KXLALIGAGAME", "KXATPMATCH", "KXWTAMATCH"]


async def pull_kalshi(limit: int = 200, max_pages: int = 300) -> tuple[list[Event], list[Market]]:
    """Paginate the full open-events feed (cursor), paced, up to max_pages × limit events, then the game series."""
    events: list[Event] = []
    markets: list[Market] = []
    cursor: str | None = None
    for page in range(max_pages):
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
        await asyncio.sleep(0.25)  # pace pages to stay under the venue's rate limit
    for series in KALSHI_GAME_SERIES:  # fetch every open game in these series so they can be matched to Polymarket
        scursor: str | None = None
        try:
            for _ in range(10):  # paginate: a busy week can exceed one page
                await asyncio.sleep(0.3)  # pace series pulls to stay under the venue's rate limit
                data = await kalshi.events(series_ticker=series, status="open", limit=200, cursor=scursor, nested=True)
                for ev in data.get("events", []):
                    e, ms = nz.kalshi_event(ev)
                    if not ms:
                        continue
                    for m in ms:
                        m.meta["game"] = True  # exempt from the volume trim; game books are what cross-venue needs
                        m.meta["series"] = series  # gate cross-venue matching to the same sport (cities repeat across leagues)
                    events.append(e)
                    markets.extend(ms)
                scursor = data.get("cursor") or None
                if not scursor:
                    break
        except Exception as exc:  # noqa: BLE001 — a missing/out-of-season series must not sink the whole pull
            log.warning("kalshi series %s failed: %s", series, exc)
    return events, markets


async def pull_polymarket(limit: int = 100, max_pages: int = 500) -> tuple[list[Event], list[Market]]:
    """Cursor-paginate every open event (offset paging is capped near 2,000 events), paced. Markets that no longer
    trade are dropped here so the store only holds what the scanner can list."""
    events: list[Event] = []
    markets: list[Market] = []
    cursor: str | None = None
    for page in range(max_pages):
        try:
            data = await polymarket.gamma_events_keyset(limit=limit, cursor=cursor, closed=False)
        except Exception as exc:  # a failure deep in the feed keeps the pages we already have
            if page == 0:
                raise
            log.warning("polymarket pagination stopped after %d pages: %s", page, exc)
            break
        for ev in data.get("events") or []:
            e, ms = nz.poly_event(ev)
            ms = [m for m in ms if m.status != "closed" and m.meta.get("acceptingOrders", True) is not False]
            if not ms:
                continue
            events.append(e)
            markets.extend(ms)
        cursor = data.get("next_cursor")
        if not cursor or not data.get("events"):
            break
        await asyncio.sleep(0.1)  # pace pages so bursts don't trip the venue's rate limit
    return events, markets


def _scanner_ids(markets: list[Market], top: int | None) -> set[str]:
    """With `top`, the scanner shows only the top markets by 24h volume plus all games, and everything else stays
    in the store for matching and search. Without it (the live default) the scanner lists every polled market."""
    if top is None:
        return {m.id for m in markets}
    games = {m.id for m in markets if m.meta.get("game")}
    ranked = {m.id for m in sorted((m for m in markets if not m.meta.get("game")), key=lambda m: -m.volume_24h)[:top]}
    return games | ranked


def _apply_schedule(markets: list[Market], schedule: dict[str, dict[str, object]]) -> None:
    """Give Kalshi markets their real kickoff and status from the milestones API, plus a league name."""
    for m in markets:
        info = schedule.get(m.meta.get("eventTicker") or "")
        if info:
            m.meta.update(info)
        m.meta.setdefault("league", games.kalshi_league(m.meta.get("series") or m.ticker))
        if not m.meta.get("league"):
            m.meta["league"] = games.kalshi_league(m.ticker)


async def refresh_markets(store: MarketStore, top_per_venue: int | None = None) -> None:
    results = await asyncio.gather(pull_kalshi(), pull_polymarket(), games.pull_kalshi_schedule(), return_exceptions=True)
    kalshi_res, poly_res, schedule = results
    if isinstance(schedule, BaseException):
        schedule = {}
    now = datetime.now(timezone.utc).isoformat()
    for venue, res in (("kalshi", kalshi_res), ("polymarket", poly_res)):
        if isinstance(res, BaseException):
            log.warning("%s pull failed: %s", venue, res)
            store.poll[venue] = {**store.poll.get(venue, {}), "ok": False, "error": str(res)[:200], "attemptAt": now}
            continue  # keep this venue's previous markets listed; a blip must not empty half the scanner
        evs, ms = res
        if venue == "kalshi":
            _apply_schedule(ms, schedule)  # type: ignore[arg-type]
        store.upsert_markets(evs, ms)
        store.venue_ids[venue] = _scanner_ids(ms, top_per_venue)
        store.venue_polled[venue] = {m.id for m in ms}
        store.poll[venue] = {"ok": True, "at": now, "attemptAt": now, "count": len(ms), "events": len(evs), "error": None}
        log.info("%s: %d markets in %d events", venue, len(ms), len(evs))
    if store.venue_ids:
        store.live_ids = set().union(*store.venue_ids.values())
        store.polled_ids = set().union(*store.venue_polled.values())
        store.mode = "live"
        store.evict_unpolled()
    store.poll["schedule"] = {"ok": bool(schedule), "at": now, "count": len(schedule)}  # type: ignore[arg-type]


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
    if not _fresh(key, 600) or m.id not in store.history:  # history barely changes; cache 10 min to cut venue load
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
    from app.services import demo_cases
    from app.services import signals as sv
    from app.services.tiger import tiger

    while True:
        try:
            await refresh_markets(store)
            # Scoring ~150k markets takes seconds; do it off the event loop so the API keeps answering.
            await asyncio.to_thread(sv.recompute, store)
            await asyncio.to_thread(store.save_live)
            await demo_cases.capture_live(store)
            tiger.schedule(store)  # stream markets, ticks and flags to Tiger Data in the background
        except Exception:  # never let the poller die
            log.exception("poll failed")
        await asyncio.sleep(interval)
