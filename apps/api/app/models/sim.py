from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.models.core import Model


class Persona(Model):
    id: str
    label: str
    job: str
    age_band: Literal["18-29", "30-44", "45-64", "65+"]
    income_band: Literal["low", "mid", "high"]
    lean: Literal["left", "center", "right"]
    risk_appetite: float  # 0..1
    info_speed: float  # 0..1, how quickly this group sees news
    media_diet: str
    bankroll: float  # typical dollars at risk


class Reaction(Model):
    persona_id: str
    belief_shift: float = Field(description="-1..1: change in probability the YES outcome happens, after reading the headline")
    confidence: float = Field(description="0..1")
    delay_minutes: int = Field(description="typical minutes before this group acts on the news")
    reason: str = Field(description="one line, first person plural, under 20 words")


class ReactionSet(Model):
    reactions: list[Reaction]


class SwarmConfig(Model):
    age_mix: float = 0.5  # 0 young .. 1 old
    income: float = 0.5  # 0 low .. 1 high
    lean: float = 0.5  # 0 left .. 1 right
    risk: float = 0.5  # 0 cautious .. 1 degen
    info_speed: float = 0.5  # 0 slow .. 1 instant
    size: int = Field(default=1000, ge=50, le=5000)
    liquidity: float | None = None  # LMSR b; None = auto from market volume


class SimRequest(Model):
    market_id: str
    headline: str
    headline_at: int | None = None  # unix ts; None = now / window middle
    swarm: SwarmConfig = Field(default_factory=SwarmConfig)
    seed: int = 42
    backtest: bool = True
    pre_minutes: int = 180
    post_minutes: int = 360
    tick_minutes: int = 2


class AgentState(Model):
    i: int
    persona_id: str
    belief: float
    stance: Literal["yes", "no", "flat"]
    seen: bool
    bankroll: float
    spent: float


class Tick(Model):
    t: int
    price: float
    real: float | None = None
    seen: int
    yes: int
    no: int
    volume: float
    stances: str  # one char per agent: y / n / - (flat)


class SimRun(Model):
    id: str
    seed: int
    market_id: str
    headline: str
    headline_at: int
    config: SwarmConfig
    liquidity: float
    reactions_source: Literal["llm", "authored", "heuristic"]
    personas: list[Persona]
    reactions: list[Reaction]
    agents: list[AgentState]
    ticks: list[Tick]
    mae_cents: float | None = None
    mae_post_cents: float | None = None
    real_points: int = 0
    meta: dict[str, Any] = Field(default_factory=dict)
