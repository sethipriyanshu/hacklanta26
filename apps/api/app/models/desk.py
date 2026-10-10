from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.models.core import Model

PersonaId = Literal["quant", "contrarian", "riskmgr"]
Stance = Literal["yes", "no", "pass"]


class Holding(Model):
    label: str
    value: float


class Profile(Model):
    id: str
    name: str
    tier: str
    monthly_income: float
    fixed_costs: float
    discretionary: float
    holdings: list[Holding] = Field(default_factory=list)
    risk_tolerance: float = 1.0  # 0.5 .. 1.5
    accent: str = ""
    bio: str = ""
    risk_budget: float = 0.0  # computed


class AnalystTake(Model):
    stance: Stance = Field(description="buy YES, buy NO, or pass")
    confidence: float = Field(description="0..1, how sure you are of the stance")
    argument: str = Field(description="2-3 sentences, concrete numbers from the context, no hedging filler")
    key_risk: str = Field(description="one sentence: the thing most likely to make you wrong")


class Rebuttal(Model):
    rebuttal: str = Field(description="1-2 sentences replying to the other two analysts by name, sharp but fair")
    revised_confidence: float = Field(description="0..1 after hearing them")


class DeskTake(Model):
    persona: PersonaId
    stance: Stance
    confidence: float
    argument: str
    key_risk: str
    rebuttal: str | None = None
    revised_confidence: float | None = None


class Consensus(Model):
    decision: Stance
    size_usd: float
    risk_budget: float
    kelly_fraction: float
    weighted_yes: float
    weighted_no: float
    vetoed: bool
    veto_reason: str | None = None
    summary: str


class DebateResult(Model):
    market_id: str
    profile_id: str
    source: Literal["llm", "authored"]
    context: dict[str, Any]
    takes: list[DeskTake]
    consensus: Consensus
