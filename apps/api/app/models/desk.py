from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.models.core import Model

PersonaId = Literal["quant", "contrarian", "riskmgr"]
Stance = Literal["yes", "no", "pass"]
# The five-step risk scale used for 401(k) and target-date portfolios.
RiskAppetite = Literal["conservative", "moderately_conservative", "moderate", "moderately_aggressive", "aggressive"]
SideInterest = Literal["yes", "no", "unsure"]


class AnalystTake(Model):
    stance: Stance = Field(description="buy YES, buy NO, or pass")
    confidence: float = Field(description="0..1, how sure you are of the stance")
    argument: str = Field(description="2-3 sentences, concrete numbers from the context, no hedging filler")
    key_risk: str = Field(description="one sentence: the thing most likely to make you wrong")


ReplyTone = Literal["concede", "push_back", "close"]


class Rebuttal(Model):
    quote: str = Field(description="a short exact phrase (12 words or fewer) from the argument you are answering; empty when closing")
    tone: ReplyTone = Field(description="concede if they are right, push_back if they are wrong, close only for the final word")
    rebuttal: str = Field(description="1-2 conversational sentences answering that point directly, as if speaking to them")
    revised_stance: Stance = Field(description="your stance after this exchange; change it only if you were genuinely persuaded")
    revised_confidence: float = Field(description="0..1 after hearing them")


class DeskTake(Model):
    persona: PersonaId
    stance: Stance
    confidence: float
    argument: str
    key_risk: str
    rebuttal: str | None = None
    revised_confidence: float | None = None
    # Round two is a conversation: who this reply answers, the line it quotes, and how it lands.
    reply_to: PersonaId | Literal["both"] | None = None
    quote: str | None = None
    tone: ReplyTone | None = None
    revised_stance: Stance | None = None


class DebateReply(Model):
    """One message in round two."""
    persona: PersonaId
    reply_to: PersonaId | Literal["both"]
    quote: str | None = None
    tone: ReplyTone
    text: str
    revised_stance: Stance
    revised_confidence: float


class Consensus(Model):
    decision: Stance
    belief: float  # the desk's probability for the chosen side (0 when passing)
    kelly_fraction: float  # half-Kelly share of whatever money is set aside for this; no personal budget is assumed
    weighted_yes: float
    weighted_no: float
    vetoed: bool
    veto_reason: str | None = None
    summary: str


class Recommendation(Model):
    market_id: str
    title: str
    event_title: str
    venue: str
    category: str
    yes_price: float
    volume_24h: float
    spread: float | None
    close_time: str | None
    reasons: list[str]


class DebateResult(Model):
    market_id: str
    risk: RiskAppetite = "moderate"
    side: SideInterest = "unsure"
    source: Literal["llm", "authored"]
    context: dict[str, Any]
    takes: list[DeskTake]
    thread: list[DebateReply] = Field(default_factory=list)
    consensus: Consensus
