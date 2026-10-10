"""Snapshot recorder. Produces the fixtures that demo mode replays.

    uv run python -m app.recorder snapshot      # live market list + detail for the top markets
    uv run python -m app.recorder scenarios     # minute-level windows for the demo scenarios
    uv run python -m app.recorder all
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time

from app import normalize as nz
from app.clients import kalshi, polymarket
from app.clients.http import close
from app.scenarios import KALSHI_COMPANIONS, SCENARIOS
from app.services import market_data as md
from app.settings import FIXTURES_DIR
from app.store import MarketStore

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tmb.recorder")
SNAPSHOT = FIXTURES_DIR / "snapshot"


async def record_snapshot(store: MarketStore, detail_top: int = 24) -> None:
    await md.refresh_markets(store, top_per_venue=200)
    now = int(time.time())
    for venue in ("kalshi", "polymarket"):
        top = sorted((m for m in store.markets.values() if m.venue == venue), key=lambda m: -m.volume_24h)[:detail_top]
        for m in top:
            try:
                store.history[m.id] = await md.fetch_history(m, start_ts=now - 7 * 86400, end_ts=now, minutes=60)
                store.books[m.id] = await md.fetch_book(m)
                store.trades[m.id] = await md.fetch_trades(m, limit=200)
                if venue == "polymarket":
                    store.history[m.id] = nz.bucket_volume(store.history[m.id], store.trades[m.id], 3600)
                log.info("detail %s: %d pts, %d trades", m.id, len(store.history[m.id]), len(store.trades[m.id]))
            except Exception as e:
                log.warning("detail %s failed: %s", m.id, e)
    # News for the top economics/politics markets only; keep it to a handful of RSS calls.
    newsy = sorted((m for m in store.markets.values() if m.category in ("Economics", "Politics")), key=lambda m: -m.volume_24h)[:12]
    seen_events: set[str] = set()
    for m in newsy:
        if m.event_id in seen_events:
            continue
        seen_events.add(m.event_id)
        try:
            rows = await md.fetch_news(m)
            for sib in store.events[m.event_id].market_ids:
                store.news[sib] = rows
            log.info("news %s: %d", m.event_title[:40], len(rows))
        except Exception as e:
            log.warning("news %s failed: %s", m.id, e)
    store.mode = "replay"
    store.save(SNAPSHOT)


async def ensure_market(store: MarketStore, market_id: str, event_id: str | None) -> None:
    if market_id in store.markets:
        return
    venue, key = market_id.split(":", 1)
    if venue == "poly":
        ev = await polymarket.gamma_event(event_id.split(":", 1)[1]) if event_id else None
        if ev is None:
            raise RuntimeError(f"need event id for {market_id}")
        e, ms = nz.poly_event(ev)
    else:
        ev = (await kalshi.event(event_id.split(":", 1)[1]))["event"] if event_id else None
        if ev is None:
            raise RuntimeError(f"need event id for {market_id}")
        e, ms = nz.kalshi_event(ev)
    store.upsert_markets([e], ms)


async def record_scenarios(store: MarketStore) -> None:
    store.load(SNAPSHOT)
    for sc in SCENARIOS:
        if not sc.market_id:
            continue
        await ensure_market(store, sc.market_id, sc.event_id)
        if sc.pair:
            await ensure_market(store, sc.pair["polyIds"][0], sc.pair.get("polyEventId"))
        m = store.markets[sc.market_id]
        if sc.window_start and sc.window_end:
            s, e = int(sc.window_start.timestamp()), int(sc.window_end.timestamp())
            pts = await md.fetch_history(m, start_ts=s, end_ts=e, minutes=1)
            tr = await md.fetch_trades(m, limit=1500, start_ts=s, end_ts=e)
            if m.venue == "polymarket":
                pts = nz.bucket_volume(pts, tr, 60)
            store.history_1m[m.id] = pts
            store.trades[m.id] = tr
            if m.id not in store.history:
                try:
                    store.history[m.id] = await md.fetch_history(m, start_ts=e - 13 * 86400, end_ts=e, minutes=60)
                except Exception as ex:
                    log.warning("hourly history %s failed: %s", m.id, ex)
            log.info("scenario %d %s: %d minute points, %d trades", sc.id, m.id, len(pts), len(tr))
            for series, ticker in KALSHI_COMPANIONS.get(sc.id, []):
                try:
                    rows = await kalshi.candlesticks(series, ticker, s, e, 1)
                    store.history_1m[f"kalshi:{ticker}"] = nz.kalshi_candles(f"kalshi:{ticker}", rows)
                except Exception as ex:
                    log.warning("companion %s failed: %s", ticker, ex)
        if not sc.window_start:  # live scenario markets: full detail set
            for mid in [sc.market_id] + (sc.pair["polyIds"] if sc.pair else []):
                mm = store.markets[mid]
                try:
                    now = int(time.time())
                    store.history[mid] = await md.fetch_history(mm, start_ts=now - 7 * 86400, end_ts=now, minutes=60)
                    store.books[mid] = await md.fetch_book(mm)
                    store.trades[mid] = await md.fetch_trades(mm, limit=200)
                    if mm.venue == "polymarket":
                        store.history[mid] = nz.bucket_volume(store.history[mid], store.trades[mid], 3600)
                    if mid not in store.news:
                        rows = await md.fetch_news(mm)
                        for sib in store.events[mm.event_id].market_ids:
                            store.news[sib] = rows
                    log.info("live scenario detail %s: %d pts, %d trades", mid, len(store.history[mid]), len(store.trades[mid]))
                except Exception as ex:
                    log.warning("live scenario detail %s failed: %s", mid, ex)
        # Sibling markets of the scenario event get hourly history so event views are complete.
        for sib_id in store.events[m.event_id].market_ids:
            sib = store.markets[sib_id]
            if sib_id not in store.history:
                try:
                    end = int(sc.window_end.timestamp()) if sc.window_end else int(time.time())
                    store.history[sib_id] = await md.fetch_history(sib, start_ts=end - 13 * 86400, end_ts=end, minutes=60)
                except Exception as ex:
                    log.warning("sibling %s failed: %s", sib_id, ex)
    store.save(SNAPSHOT)


async def main(cmd: str) -> None:
    store = MarketStore()
    try:
        if cmd in ("snapshot", "all"):
            await record_snapshot(store)
        if cmd in ("scenarios", "all"):
            await record_scenarios(store)
    finally:
        await close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))
