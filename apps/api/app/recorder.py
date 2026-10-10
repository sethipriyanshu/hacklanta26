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
from app.scenarios import COMPANION_EVENTS, CURATED_PAIRS, KALSHI_COMPANIONS, SCENARIOS
from app.engines import matching
from app.engines.wallets import build_panel
from app.models.signals import VenuePair
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
            tr = await md.fetch_trades(m, limit=6000, start_ts=s, end_ts=e)
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


async def record_companions(store: MarketStore) -> None:
    """Fully record the events behind curated pairs, replacing any trimmed copies, plus hourly history for their top markets."""
    store.load(SNAPSHOT)
    now = int(time.time())
    for ev_id in COMPANION_EVENTS:
        venue, key = ev_id.split(":", 1)
        try:
            if venue == "poly":
                e, ms = nz.poly_event(await polymarket.gamma_event(key))
            else:
                e, ms = nz.kalshi_event((await kalshi.event(key))["event"])
        except Exception as ex:
            log.warning("companion event %s failed: %s", ev_id, ex)
            continue
        store.upsert_markets([e], ms)
        for m in sorted(ms, key=lambda x: -x.volume)[:10]:
            if m.id not in store.history:
                try:
                    store.history[m.id] = await md.fetch_history(m, start_ts=now - 7 * 86400, end_ts=now, minutes=60)
                except Exception as ex:
                    log.warning("companion history %s failed: %s", m.id, ex)
        log.info("companion %s: %d markets", ev_id, len(ms))
    store.save(SNAPSHOT)


async def record_pairs(store: MarketStore) -> None:
    """Resolve curated pairs to market ids, then run the LLM rule check once per pair (cached by the wrapper)."""
    store.load(SNAPSHOT)
    pairs: list[VenuePair] = []
    for ticker, poly_event, needles, title in CURATED_PAIRS:
        kid = f"kalshi:{ticker}"
        if kid not in store.markets:
            log.warning("pair skipped, missing %s", kid)
            continue
        ev = store.events.get(poly_event)
        polys = [store.markets[i] for i in (ev.market_ids if ev else []) if i in store.markets and any(n.lower() in (store.markets[i].subtitle or store.markets[i].title).lower() for n in needles)]
        if not polys:
            log.warning("pair skipped, no polymarket match for %s in %s", ticker, poly_event)
            continue
        pairs.append(VenuePair(id=f"pair:{ticker}", kalshi_id=kid, poly_ids=[p.id for p in polys], match="partial" if len(polys) > 1 else "same", reason="Curated by hand; rules not yet machine-checked.", title=title, checked_by="curated"))
    pairs = await matching.verify_pairs(pairs, store.markets)
    matching.save_pairs(pairs)
    for p in pairs:
        log.info("pair %s -> %s [%s/%s] %s", p.kalshi_id, p.poly_ids, p.match, p.checked_by, p.reason[:80])


async def record_wallets(store: MarketStore) -> None:
    """Wallet freshness for the pre-headline window of scenario 2: first-seen time and prior trade count per top buyer."""
    store.load(SNAPSHOT)
    for sc in SCENARIOS:
        if not (sc.market_id and sc.headline and sc.market_id in store.trades):
            continue
        m = store.markets[sc.market_id]
        if m.venue != "polymarket":
            continue
        end = int(sc.headline.at.timestamp())
        panel = build_panel(m.id, store.trades[m.id], start=end - 36 * 3600, end=end, top=15)
        meta: dict[str, dict[str, int | None]] = dict(store.wallet_meta.get(m.id, {}))
        for w in panel.wallets:
            if w.wallet in meta:
                continue
            try:
                rows = await polymarket.activity(w.wallet, limit=500)
                ts = sorted(int(r.get("timestamp") or 0) for r in rows if r.get("timestamp"))
                prior = sum(1 for r in rows if r.get("type") == "TRADE" and int(r.get("timestamp") or 0) < end - 36 * 3600)
                capped = len(rows) >= 500  # feed truncated: first-seen and prior counts are unknown, not small
                meta[w.wallet] = {"firstSeen": None if capped else (ts[0] if ts else None), "priorTrades": None if capped else prior, "activityCount": len(rows)}
                await asyncio.sleep(1.2)  # data-api rate limit
                log.info("wallet %s…: first seen %s, prior trades %s", w.wallet[:8], ts[0] if ts else None, meta[w.wallet]["priorTrades"])
            except Exception as ex:
                log.warning("wallet %s failed: %s", w.wallet[:8], ex)
        store.wallet_meta[m.id] = meta
    store.save(SNAPSHOT)


async def record_sim_runs(store: MarketStore) -> None:
    """Precompute and store the simulator runs for scenarios 5 and 6 so the demo never computes live."""
    from app.engines import swarm
    from app.models.sim import SimRequest, SwarmConfig

    store.load(SNAPSHOT)
    ps = swarm.load_personas()
    runs_dir = FIXTURES_DIR / "sim" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    for sc in SCENARIOS:
        if sc.module != "sim" or not sc.market_id or not sc.headline:
            continue
        m = store.markets[sc.market_id]
        real = store.history_1m.get(m.id)
        head = int(sc.headline.at.timestamp())
        req = SimRequest(market_id=m.id, headline=sc.headline.title, headline_at=head, swarm=SwarmConfig(info_speed=0.15 if sc.id == 6 else 0.6, size=1000), seed=42)
        before = [p.price for p in (real or []) if p.ts <= head - req.pre_minutes * 60]
        p0 = before[-1] if before else m.yes_price
        rx, src = await swarm.get_reactions(req.headline, m, ps)
        out = swarm.calibrate_liquidity(req, m, ps, rx, src, p0=p0, real=real or [], headline_at=head) if real else swarm.run(req, m, ps, rx, src, p0=p0, real=None, headline_at=head)
        (runs_dir / f"scenario-{sc.id}.json").write_text(out.model_dump_json(by_alias=True))
        log.info("scenario %d run: b=%s mae=%s post=%s reactions=%s ticks=%d", sc.id, out.liquidity, out.mae_cents, out.mae_post_cents, src, len(out.ticks))


async def main(cmd: str) -> None:
    store = MarketStore()
    try:
        if cmd in ("snapshot", "all"):
            await record_snapshot(store)
        if cmd in ("scenarios", "all"):
            await record_scenarios(store)
        if cmd in ("companions", "all"):
            await record_companions(store)
        if cmd in ("pairs", "all"):
            await record_pairs(store)
        if cmd in ("wallets", "all"):
            await record_wallets(store)
        if cmd in ("sim", "all"):
            await record_sim_runs(store)
    finally:
        await close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))
