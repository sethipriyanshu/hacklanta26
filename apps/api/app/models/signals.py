from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.models.core import Model

SignalType = Literal["anomaly", "gap", "inconsistency", "newsLag"]


class Signal(Model):
    market_id: str
    type: SignalType
    score: float  # 0..100
    sub_scores: dict[str, float | None] = Field(default_factory=dict)
    weights: dict[str, float] = Field(default_factory=dict)
    explanation: str
    detected_at: datetime
    as_of: int | None = None  # unix ts the score was computed "as of" (replay)
    details: dict[str, Any] = Field(default_factory=dict)


class WalletStat(Model):
    wallet: str
    label: str | None = None
    buy_size: float
    trades: int
    first_seen: int | None = None  # unix ts of first observed activity anywhere
    prior_trades: int | None = None
    fresh: bool = False
    share: float = 0.0


class WalletPanel(Model):
    market_id: str
    window_start: int
    window_end: int
    total_buy_size: float
    fresh_share: float
    wallets: list[WalletStat]


class VenuePair(Model):
    id: str
    kalshi_id: str
    poly_ids: list[str]
    match: Literal["same", "different", "partial"]
    reason: str
    title: str
    checked_by: Literal["llm", "curated"] = "curated"
