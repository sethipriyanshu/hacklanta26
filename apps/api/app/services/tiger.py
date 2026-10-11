"""Tiger Data (TimescaleDB on Tiger Cloud) as the market data store.

Every market from both venues is kept in `markets`; price and quote changes stream into the `market_ticks`
hypertable (hourly chunks, compressed after two hours, kept 30 days), rolled up hourly by the `market_ticks_1h` continuous aggregate;
flags the scanner raises land in the `flags` hypertable. Writes run in the background after each poll and never
block the app; with no TIGER_DATABASE_URL set, or the database unreachable, everything here is a no-op.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.settings import get_settings
from app.store import MarketStore

log = logging.getLogger("tmb.tiger")

FULL_SWEEP_EVERY = 3600  # every market gets at least one tick an hour, so the hourly rollup covers all of them
STATS_TTL = 30

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS markets (
        id          text PRIMARY KEY,
        venue       text NOT NULL,
        ticker      text NOT NULL,
        title       text NOT NULL,
        subtitle    text,
        event_id    text NOT NULL,
        event_title text NOT NULL,
        category    text NOT NULL,
        status      text NOT NULL,
        close_time  timestamptz,
        url         text,
        first_seen  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
    )""",
    "CREATE INDEX IF NOT EXISTS markets_event_idx ON markets (event_id)",
    "CREATE INDEX IF NOT EXISTS markets_category_idx ON markets (category, venue)",
    """
    CREATE TABLE IF NOT EXISTS market_ticks (
        ts            timestamptz NOT NULL,
        market_id     text NOT NULL,
        venue         text NOT NULL,
        yes_price     real NOT NULL,
        yes_bid       real,
        yes_ask       real,
        volume_24h    double precision,
        open_interest double precision
    )""",
    "SELECT create_hypertable('market_ticks', by_range('ts', INTERVAL '1 day'), if_not_exists => TRUE)",
    "CREATE INDEX IF NOT EXISTS market_ticks_market_ts_idx ON market_ticks (market_id, ts DESC)",
    "ALTER TABLE market_ticks SET (timescaledb.compress, timescaledb.compress_segmentby = 'market_id', timescaledb.compress_orderby = 'ts DESC')",
    # Hourly chunks, compressed once they are two hours old: a full sweep is ~400k rows, so each chunk stays small.
    "SELECT set_chunk_time_interval('market_ticks', INTERVAL '1 hour')",
    "SELECT remove_compression_policy('market_ticks', if_exists => TRUE)",
    "SELECT add_compression_policy('market_ticks', INTERVAL '2 hours')",
    "SELECT add_retention_policy('market_ticks', INTERVAL '30 days', if_not_exists => TRUE)",
    """
    CREATE MATERIALIZED VIEW IF NOT EXISTS market_ticks_1h
    WITH (timescaledb.continuous) AS
    SELECT time_bucket(INTERVAL '1 hour', ts) AS bucket,
           market_id,
           first(yes_price, ts) AS open,
           max(yes_price)       AS high,
           min(yes_price)       AS low,
           last(yes_price, ts)  AS close,
           last(volume_24h, ts) AS volume_24h,
           count(*)             AS ticks
    FROM market_ticks
    GROUP BY bucket, market_id
    WITH NO DATA""",
    "ALTER MATERIALIZED VIEW market_ticks_1h SET (timescaledb.materialized_only = false)",  # real-time: include the current hour
    "SELECT add_continuous_aggregate_policy('market_ticks_1h', start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE)",
    """
    CREATE TABLE IF NOT EXISTS flags (
        ts          timestamptz NOT NULL,
        market_id   text NOT NULL,
        type        text NOT NULL,
        score       real NOT NULL,
        explanation text NOT NULL
    )""",
    "SELECT create_hypertable('flags', by_range('ts', INTERVAL '7 days'), if_not_exists => TRUE)",
    "CREATE INDEX IF NOT EXISTS flags_market_ts_idx ON flags (market_id, ts DESC)",
]

MARKET_COLS = ["id", "venue", "ticker", "title", "subtitle", "event_id", "event_title", "category", "status", "close_time", "url"]
TICK_COLS = ["ts", "market_id", "venue", "yes_price", "yes_bid", "yes_ask", "volume_24h", "open_interest"]
FLAG_COLS = ["ts", "market_id", "type", "score", "explanation"]


class Tiger:
    def __init__(self) -> None:
        self.pool: Any = None
        self.ready = False
        self.read_only = False  # the service refuses writes (e.g. over its storage limit); reads still work
        self.error: str | None = None
        self._lock = asyncio.Lock()
        self._meta: dict[str, int] = {}  # market id -> hash of its stored metadata
        self._quote: dict[str, tuple] = {}  # market id -> last written (price, bid, ask, vol24, oi)
        self._flags: dict[tuple[str, str], float] = {}  # (market, type) -> last written score
        self._last_sweep = 0.0
        self.written = {"markets": 0, "ticks": 0, "flags": 0}
        self.last_write: dict[str, Any] = {}
        self._stats: tuple[float, dict[str, Any]] | None = None

    @property
    def enabled(self) -> bool:
        return bool(get_settings().tiger_database_url)

    async def connect(self) -> None:
        if not self.enabled or self.ready:
            return
        import asyncpg

        try:
            if self.pool is None:
                self.pool = await asyncpg.create_pool(get_settings().tiger_database_url, min_size=1, max_size=4, command_timeout=120)
            async with self.pool.acquire() as c:
                if await c.fetchval("SHOW default_transaction_read_only") == "on":
                    self.ready, self.read_only, self.error = True, True, "read-only: the service is not accepting writes"
                    log.warning("tiger: connected read-only; writes paused")
                    return
                for stmt in SCHEMA:
                    await c.execute(stmt)
            self.ready, self.read_only, self.error = True, False, None
            log.info("tiger: connected, schema ready")
        except Exception as e:  # noqa: BLE001 — the app runs without the database
            self.error = f"{type(e).__name__}: {e}"
            log.warning("tiger: unavailable, continuing without it (%s)", self.error)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    # ---------- writes ----------

    def schedule(self, store: MarketStore) -> None:
        """Called after each poll: write in the background, skipping a round if the last one is still running."""
        if self.enabled and not self._lock.locked():
            asyncio.create_task(self.sync(store))

    async def sync(self, store: MarketStore) -> None:
        async with self._lock:
            if self.read_only:
                self.ready = False  # check again whether writes are allowed
            await self.connect()
            if not self.ready or self.read_only:
                return
            t0 = time.monotonic()
            try:
                n_m = await self._write_markets(store)
                n_t = await self._write_ticks(store)
                n_f = await self._write_flags()
                self.last_write = {"at": datetime.now(timezone.utc).isoformat(), "markets": n_m, "ticks": n_t, "flags": n_f, "seconds": round(time.monotonic() - t0, 1)}
                log.info("tiger: wrote %d markets, %d ticks, %d flags in %.1fs", n_m, n_t, n_f, time.monotonic() - t0)
            except Exception as e:  # noqa: BLE001 — a failed round is retried next poll
                self.error = f"{type(e).__name__}: {e}"
                log.warning("tiger: write failed: %s", self.error)

    async def _write_markets(self, store: MarketStore) -> int:
        """Upsert markets that are new or whose title, status or close time changed."""
        rows = []
        for m in list(store.markets.values()):
            if m.id.startswith("demo:"):
                continue
            row = (m.id, m.venue, m.ticker, m.title, m.subtitle, m.event_id, m.event_title, m.category, m.status, m.close_time, m.url)
            h = hash(row)
            if self._meta.get(m.id) != h:
                rows.append(row)
                self._meta[m.id] = h
        if not rows:
            return 0
        async with self.pool.acquire() as c, c.transaction():
            await c.execute("CREATE TEMP TABLE markets_in (LIKE markets INCLUDING DEFAULTS) ON COMMIT DROP")
            await c.copy_records_to_table("markets_in", records=rows, columns=MARKET_COLS)
            cols = ", ".join(MARKET_COLS)
            sets = ", ".join(f"{k} = EXCLUDED.{k}" for k in MARKET_COLS[1:])
            await c.execute(f"INSERT INTO markets ({cols}) SELECT {cols} FROM markets_in ON CONFLICT (id) DO UPDATE SET {sets}, updated_at = now()")
        self.written["markets"] += len(rows)
        return len(rows)

    async def _write_ticks(self, store: MarketStore) -> int:
        """A tick for every market whose quote changed since the last write, and for every market once an hour."""
        now = datetime.now(timezone.utc)
        sweep = time.monotonic() - self._last_sweep >= FULL_SWEEP_EVERY
        rows = []
        for m in list(store.markets.values()):
            if m.id.startswith("demo:") or m.status == "closed":
                continue
            q = (m.yes_price, m.yes_bid, m.yes_ask, m.volume_24h, m.open_interest)
            if sweep or self._quote.get(m.id) != q:
                rows.append((now, m.id, m.venue, m.yes_price, m.yes_bid, m.yes_ask, m.volume_24h, m.open_interest))
                self._quote[m.id] = q
        if rows:
            async with self.pool.acquire() as c:
                await c.copy_records_to_table("market_ticks", records=rows, columns=TICK_COLS)
            self.written["ticks"] += len(rows)
        if sweep:
            self._last_sweep = time.monotonic()
        return len(rows)

    async def _write_flags(self) -> int:
        """Every flag (40+) the scanner raises, written when it first appears or its score changes."""
        from app.services import signals as sv

        now = datetime.now(timezone.utc)
        rows = []
        for mid, sigs in list(sv.signals.by_market.items()):
            if mid.startswith("demo:"):
                continue
            for s in sigs:
                if s.score < 40 or self._flags.get((mid, s.type)) == round(s.score, 1):
                    continue
                self._flags[(mid, s.type)] = round(s.score, 1)
                rows.append((now, mid, s.type, s.score, s.explanation))
        if rows:
            async with self.pool.acquire() as c:
                await c.copy_records_to_table("flags", records=rows, columns=FLAG_COLS)
            self.written["flags"] += len(rows)
        return len(rows)

    # ---------- reads ----------

    async def stats(self) -> dict[str, Any]:
        """What the database holds right now, for the status readout. Cached for a few seconds."""
        if not self.enabled:
            return {"enabled": False}
        if self._stats and time.monotonic() - self._stats[0] < STATS_TTL:
            return self._stats[1]
        await self.connect()
        out: dict[str, Any] = {"enabled": True, "connected": self.ready, "readOnly": self.read_only, "error": self.error, "lastWrite": self.last_write, "writtenThisSession": self.written}
        if self.ready:
            try:
                async with self.pool.acquire() as c:
                    out["markets"] = await c.fetchval("SELECT count(*) FROM markets")
                    out["marketsByVenue"] = {r["venue"]: r["n"] for r in await c.fetch("SELECT venue, count(*) AS n FROM markets GROUP BY venue")}
                    out["ticks"] = await c.fetchval("SELECT approximate_row_count('market_ticks')")
                    out["flags"] = await c.fetchval("SELECT count(*) FROM flags")
                    out["ticksLastHour"] = await c.fetchval("SELECT count(*) FROM market_ticks WHERE ts > now() - INTERVAL '1 hour'")
                    out["chunks"] = await c.fetchval("SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name = 'market_ticks'")
                    out["bytes"] = await c.fetchval("SELECT hypertable_size('market_ticks')")
                    comp = await c.fetchrow("SELECT sum(before_compression_total_bytes) AS before, sum(after_compression_total_bytes) AS after FROM chunk_compression_stats('market_ticks')")
                    if comp and comp["after"]:
                        out["compressionRatio"] = round(comp["before"] / comp["after"], 1)
                    out["firstTick"] = await c.fetchval("SELECT min(ts) FROM market_ticks")
                    out["lastTick"] = await c.fetchval("SELECT max(ts) FROM market_ticks")
            except Exception as e:  # noqa: BLE001
                out["error"] = f"{type(e).__name__}: {e}"
        self._stats = (time.monotonic(), out)
        return out

    async def history(self, market_id: str, hours: int = 168) -> list[dict[str, Any]]:
        """Hourly bars for one market from the continuous aggregate (real-time: includes the current hour)."""
        if not self.ready:
            return []
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "SELECT bucket, open, high, low, close, volume_24h, ticks FROM market_ticks_1h WHERE market_id = $1 AND bucket > now() - make_interval(hours => $2) ORDER BY bucket",
                market_id, hours,
            )
        return [{"ts": int(r["bucket"].timestamp()), "open": r["open"], "high": r["high"], "low": r["low"], "close": r["close"], "volume24h": r["volume_24h"], "ticks": r["ticks"]} for r in rows]


tiger = Tiger()
