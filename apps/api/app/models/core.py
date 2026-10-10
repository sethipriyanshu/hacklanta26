"""Core data models. Field names are snake_case in Python and camelCase on the wire."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Venue = Literal["kalshi", "polymarket"]
Category = Literal["Politics", "Economics", "Sports", "Crypto", "Tech", "Other"]
CATEGORIES: list[Category] = ["Politics", "Economics", "Sports", "Crypto", "Tech", "Other"]


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class Market(Model):
    id: str
    venue: Venue
    ticker: str
    title: str
    subtitle: str | None = None
    event_id: str
    event_title: str
    category: Category
    outcomes: list[str] = Field(default_factory=lambda: ["Yes", "No"])
    yes_price: float
    yes_bid: float | None = None
    yes_ask: float | None = None
    last_price: float | None = None
    spread: float | None = None
    change_24h: float | None = Field(default=None, alias="change24h")
    volume: float = 0.0
    volume_24h: float = Field(default=0.0, alias="volume24h")
    open_interest: float | None = None
    liquidity: float | None = None
    close_time: datetime | None = None
    rules_text: str = ""
    url: str
    status: str = "open"
    mutually_exclusive: bool = False
    meta: dict[str, Any] = Field(default_factory=dict)


class Event(Model):
    id: str
    venue: Venue
    title: str
    category: Category
    mutually_exclusive: bool = False
    market_ids: list[str] = Field(default_factory=list)
    total_markets: int | None = None  # count at the venue; None = unknown
    close_time: datetime | None = None
    url: str = ""


class PricePoint(Model):
    market_id: str
    ts: int  # unix seconds
    price: float
    volume: float | None = None


class Trade(Model):
    market_id: str
    ts: int
    side: Literal["yes", "no"]
    price: float
    size: float
    wallet: str | None = None
    wallet_label: str | None = None
    outcome: str | None = None


class BookLevel(Model):
    price: float
    size: float


class OrderBook(Model):
    market_id: str
    ts: int
    bids: list[BookLevel] = Field(default_factory=list)  # YES bids
    asks: list[BookLevel] = Field(default_factory=list)  # YES asks


class Headline(Model):
    id: str
    title: str
    source: str
    url: str
    published_at: datetime
    query: str = ""


class Snapshot(Model):
    recorded_at: datetime
    mode: Literal["live", "replay"]
    market_count: int
    venues: dict[str, int] = Field(default_factory=dict)


class MarketRow(Market):
    spark: list[float] = Field(default_factory=list)
    flags: list[dict[str, Any]] = Field(default_factory=list)  # [{type, score}]
    max_score: float = 0.0


class MarketsResponse(Model):
    markets: list[MarketRow]
    snapshot: Snapshot


class HistoryResponse(Model):
    market_id: str
    resolution: str
    points: list[PricePoint]


class TradesResponse(Model):
    market_id: str
    trades: list[Trade]


class NewsResponse(Model):
    query: str
    headlines: list[Headline]
