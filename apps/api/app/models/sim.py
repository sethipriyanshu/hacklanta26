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
    probability: float = Field(description="0..1: this group's probability that the contract resolves YES after reading the headline")
    confidence: float = Field(description="0..1: how sure this group is, which sets how hard it bets")
    delay_minutes: int = Field(description="typical minutes before this group acts on the news")
    reason: str = Field(description="one line, first person plural, under 20 words")


class PersonaReaction(Model):
    """What the model returns per persona: a bias around the informed estimate, never an absolute number."""
    persona_id: str
    bias_points: float = Field(description="-8..8: how many percentage points this group's view sits above (+) or below (-) the informed estimate, from genuine bias only")
    confidence: float = Field(description="0..1: how sure this group is, which sets how hard it bets")
    delay_minutes: int = Field(description="typical minutes before this group acts on the news")
    reason: str = Field(description="one line, first person plural, under 20 words")


class ReactionSet(Model):
    """Reasoning first, then a direction and a size; the probability itself is computed in code so it can never contradict the reasoning."""
    analysis: str = Field(description="2-3 sentences: who this news helps or hurts, stated in terms of the YES outcome of THIS contract")
    direction: Literal["up", "down", "none"] = Field(description="does the news make YES more likely (up), less likely (down), or neither (none)")
    move_points: float = Field(description="0..60: how many percentage points the informed probability of YES moves, as a positive number")
    reason: str = Field(description="one sentence summary of the move")
    reactions: list[PersonaReaction]


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
    prior: float = 0.0  # belief before the headline
    seen_at: int | None = None  # unix ts the agent hears the news (None if not within the run)
    stance: Literal["yes", "no", "flat"]  # side of the agent's last trade
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
    fair_probability: float | None = None  # the informed post-news probability the crowd is reacting toward
    fair_reason: str | None = None
    agents: list[AgentState]
    ticks: list[Tick]
    mae_cents: float | None = None
    mae_post_cents: float | None = None
    real_points: int = 0
    meta: dict[str, Any] = Field(default_factory=dict)


class GroupStat(Model):
    label: str
    agents: int
    mean_belief: float
    bet: float
    minutes: float | None = None


class RunSummaryRequest(Model):
    """The numbers the browser already computed for a finished run; the summary may only use these."""
    market_title: str
    headline: str
    start_price: float
    end_price: float
    settle_minutes: int | None = None
    traded_usd: float
    lower_share: float
    higher_share: float
    unheard_share: float
    groups: list[GroupStat]


class RunSummaryText(Model):
    summary: str = Field(description="3 sentences max, plain language: what the simulated crowd did, who drove the price, how fast it settled")
    takeaway: str = Field(description="one sentence a reader should remember; it is a simulation, never a prediction or advice")


class RunSummary(Model):
    summary: str
    takeaway: str
    source: Literal["llm", "template"]
