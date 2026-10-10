"""In-process market store with JSON persistence. Live mode fills it from the poller; demo mode loads it from fixtures."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from app.models import Event, Headline, Market, OrderBook, PricePoint, Snapshot, Trade

log = logging.getLogger("tmb.store")
T = TypeVar("T", bound=BaseModel)


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

    # ----- mutation -----
    def upsert_markets(self, events: list[Event], markets: list[Market]) -> None:
        for e in events:
            self.events[e.id] = e
        for m in markets:
            self.markets[m.id] = m
        self.recorded_at = datetime.now(timezone.utc)

    def snapshot(self) -> Snapshot:
        venues: dict[str, int] = {}
        for m in self.markets.values():
            venues[m.venue] = venues.get(m.venue, 0) + 1
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
