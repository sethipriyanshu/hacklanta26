"""In-process market store with JSON persistence. Live mode fills it from the poller; demo mode loads it from fixtures."""

from __future__ import annotations

import gzip
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

import orjson
from pydantic import BaseModel

from app.models import Event, Headline, Market, OrderBook, PricePoint, Snapshot, Trade

log = logging.getLogger("tmb.store")
T = TypeVar("T", bound=BaseModel)

# The last live pull, so a restart comes up on real markets instead of the fixture snapshot.
LIVE_CACHE = Path(__file__).resolve().parents[1] / ".cache" / "live.json.gz"
LIVE_CACHE_MAX_AGE = 6 * 3600
LIVE_CACHE_EVERY = 600  # seconds between cache writes


def safe(market_id: str) -> str:
    return market_id.replace(":", "__").replace("/", "_")


def _dump(path: Path, rows: list[BaseModel] | BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [r.model_dump(mode="json", by_alias=True) for r in rows] if isinstance(rows, list) else rows.model_dump(mode="json", by_alias=True)
    path.write_text(json.dumps(data, indent=0))


def _load(path: Path, model: type[T]) -> list[T]:
    if not path.exists():
        return []
    return [model.model_validate(r) for r in json.loads(path.read_text())]


class MarketStore:
    def __init__(self) -> None:
        self.markets: dict[str, Market] = {}
        self.events: dict[str, Event] = {}
        self.history: dict[str, list[PricePoint]] = {}  # hourly, trailing window
        self.history_1m: dict[str, list[PricePoint]] = {}  # minute windows for scenarios
        self.books: dict[str, OrderBook] = {}
        self.trades: dict[str, list[Trade]] = {}
        self.news: dict[str, list[Headline]] = {}  # keyed by market id
        self.wallet_meta: dict[str, dict[str, dict[str, int | None]]] = {}  # market id -> wallet -> {firstSeen, priorTrades}
        self.recorded_at: datetime | None = None
        self.mode: str = "replay"
        self.live_ids: set[str] = set()  # market ids seen in the latest live poll; the scanner shows only these
        self.polled_ids: set[str] = set()  # every market id in the latest live poll, before the volume trim; search covers these
        self.venue_ids: dict[str, set[str]] = {}  # per venue, the last successful poll's listed ids (a failed venue keeps its last set)
        self.venue_polled: dict[str, set[str]] = {}
        self.fixture_ids: set[str] = set()  # recorded markets the scenarios replay; never evicted
        self.poll: dict[str, dict[str, object]] = {}  # per venue: ok, at, attemptAt, count, error
        self._saved_at = 0.0
        self._venue_counts: dict[str, int] | None = None  # cached per-venue counts; reset whenever markets change

    # ----- mutation -----
    def upsert_markets(self, events: list[Event], markets: list[Market]) -> None:
        for e in events:
            self.events[e.id] = e
        for m in markets:
            self.markets[m.id] = m
        self.recorded_at = datetime.now(timezone.utc)
        self._venue_counts = None

    def evict_unpolled(self) -> int:
        """Drop live markets no venue returned in its last successful poll (closed, settled, delisted), so memory stays flat."""
        keep = self.polled_ids | self.fixture_ids
        gone = [mid for mid in self.markets if mid not in keep]
        for mid in gone:
            del self.markets[mid]
            for d in (self.history, self.books, self.trades, self.news):
                d.pop(mid, None)
        live_events = {m.event_id for m in self.markets.values()}
        for eid in [e for e in self.events if e not in live_events]:
            del self.events[eid]
        if gone:
            self._venue_counts = None
            log.info("evicted %d markets no longer listed", len(gone))
        return len(gone)

    def save_live(self, force: bool = False) -> None:
        """Write the polled markets and events to the warm-start cache, at most every LIVE_CACHE_EVERY seconds."""
        if not force and time.monotonic() - self._saved_at < LIVE_CACHE_EVERY:
            return
        if not self.polled_ids:
            return
        t0 = time.monotonic()
        ms = [self.markets[i].model_dump(mode="json", by_alias=True) for i in self.polled_ids if i in self.markets]
        evs = [e.model_dump(mode="json", by_alias=True) for e in self.events.values()]
        payload = {"savedAt": datetime.now(timezone.utc).isoformat(), "markets": ms, "events": evs, "liveIds": sorted(self.live_ids), "poll": self.poll}
        LIVE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        tmp = LIVE_CACHE.with_suffix(".tmp")
        with gzip.open(tmp, "wb", compresslevel=1) as f:
            f.write(orjson.dumps(payload))
        os.replace(tmp, LIVE_CACHE)  # atomic: a crash mid-write never leaves a half cache
        self._saved_at = time.monotonic()
        log.info("live cache: %d markets written in %.1fs", len(ms), time.monotonic() - t0)

    def load_live(self) -> bool:
        """Load the warm-start cache if it is fresh. Returns True when the store now holds live markets."""
        if not LIVE_CACHE.exists() or time.time() - LIVE_CACHE.stat().st_mtime > LIVE_CACHE_MAX_AGE:
            return False
        t0 = time.monotonic()
        try:
            with gzip.open(LIVE_CACHE, "rb") as f:
                data = orjson.loads(f.read())
            markets = [Market.model_validate(r) for r in data["markets"]]
            events = [Event.model_validate(r) for r in data["events"]]
        except Exception as e:  # noqa: BLE001 — a corrupt cache is ignored, never fatal
            log.warning("live cache unreadable, ignoring: %s", e)
            return False
        for e in events:
            self.events[e.id] = e
        for m in markets:
            self.markets[m.id] = m
        self._venue_counts = None
        ids = {m.id for m in markets}
        for venue in ("kalshi", "polymarket"):
            self.venue_polled[venue] = {m.id for m in markets if m.venue == venue}
        live = set(data.get("liveIds") or ids)
        for venue in ("kalshi", "polymarket"):
            self.venue_ids[venue] = {i for i in live if i in self.venue_polled[venue]}
        self.live_ids, self.polled_ids = live, ids
        self.poll = {k: {**v, "fromCache": True} for k, v in (data.get("poll") or {}).items()}
        self.recorded_at = datetime.fromisoformat(data["savedAt"])
        self.mode = "live"
        log.info("live cache: %d markets from %s loaded in %.1fs", len(markets), data["savedAt"], time.monotonic() - t0)
        return True

    def snapshot(self) -> Snapshot:
        # Counting 400k+ markets on every /health and /markets call stalled the API; count once per change.
        if self._venue_counts is None:
            counts: dict[str, int] = {}
            for m in list(self.markets.values()):
                counts[m.venue] = counts.get(m.venue, 0) + 1
            self._venue_counts = counts
        venues = self._venue_counts
        return Snapshot(recorded_at=self.recorded_at or datetime.now(timezone.utc), mode=self.mode, market_count=len(self.markets), venues=venues)  # type: ignore[arg-type]

    # ----- persistence -----
    def save(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        _dump(root / "markets.json", list(self.markets.values()))
        _dump(root / "events.json", list(self.events.values()))
        for mid, pts in self.history.items():
            _dump(root / "history" / f"{safe(mid)}.json", pts)
        for mid, pts in self.history_1m.items():
            _dump(root / "history_1m" / f"{safe(mid)}.json", pts)
        for mid, ob in self.books.items():
            _dump(root / "books" / f"{safe(mid)}.json", ob)
        for mid, tr in self.trades.items():
            _dump(root / "trades" / f"{safe(mid)}.json", tr)
        for mid, hs in self.news.items():
            _dump(root / "news" / f"{safe(mid)}.json", hs)
        for mid, wm in self.wallet_meta.items():
            (root / "wallets").mkdir(parents=True, exist_ok=True)
            (root / "wallets" / f"{safe(mid)}.json").write_text(json.dumps(wm))
        (root / "meta.json").write_text(json.dumps({"recordedAt": (self.recorded_at or datetime.now(timezone.utc)).isoformat(), "marketCount": len(self.markets)}))
        log.info("saved %d markets to %s", len(self.markets), root)

    def load(self, root: Path) -> None:
        if not (root / "markets.json").exists():
            log.warning("no fixtures at %s", root)
            return
        for m in _load(root / "markets.json", Market):
            self.markets[m.id] = m
        for e in _load(root / "events.json", Event):
            self.events[e.id] = e
        for sub, target, model in (("history", self.history, PricePoint), ("history_1m", self.history_1m, PricePoint), ("trades", self.trades, Trade), ("news", self.news, Headline)):
            d = root / sub
            if d.exists():
                for p in d.glob("*.json"):
                    rows = _load(p, model)  # type: ignore[type-var]
                    if rows:
                        target[rows[0].market_id if hasattr(rows[0], "market_id") else p.stem.replace("__", ":")] = rows  # type: ignore[index]
        d = root / "books"
        if d.exists():
            for p in d.glob("*.json"):
                ob = OrderBook.model_validate(json.loads(p.read_text()))
                self.books[ob.market_id] = ob
        d = root / "wallets"
        if d.exists():
            for p in d.glob("*.json"):
                self.wallet_meta[p.stem.replace("__", ":")] = json.loads(p.read_text())
        meta = root / "meta.json"
        if meta.exists():
            try:
                self.recorded_at = datetime.fromisoformat(json.loads(meta.read_text())["recordedAt"])
            except (KeyError, ValueError):
                pass
        log.info("loaded %d markets, %d histories, %d trade sets from %s", len(self.markets), len(self.history), len(self.trades), root)


store = MarketStore()
