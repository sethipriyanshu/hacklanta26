"""Plain-language 'understand this market' summary for the learning view.

Uses the LLM when it's enabled (cached by the wrapper, under the spend cap); otherwise a deterministic templated
summary so the learning view is never blank. Both link to the matching concept cards."""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from app.clients import llm
from app.models import Market
from app.services import signals as sv
from app.store import MarketStore

log = logging.getLogger("tmb.summary")

CONCEPT_IDS = ["implied-probability", "spread-vig", "liquidity", "wash-trading", "anomaly-patterns", "cross-venue-arbitrage"]


class MarketSummary(BaseModel):
    plain_title: str = Field(description="Restate what this market asks as one plain-English question a newcomer understands")
    summary: str = Field(description="2-4 short sentences. Explain what a YES share is, translate the price into a probability in plain words, and give context. No jargon.")
    whats_notable: str = Field(default="", description="One plain sentence on anything unusual (a flag, a big move, thin trading). Empty string if nothing stands out.")
    concepts: list[str] = Field(default_factory=list, description="1-3 ids, most relevant first, from: implied-probability, spread-vig, liquidity, wash-trading, anomaly-patterns, cross-venue-arbitrage")


SYSTEM = (
    "You explain prediction markets to a complete beginner who has never traded. "
    "Use plain, concrete language and short sentences. Never use a jargon word without explaining it in the same breath. "
    "Key idea: a YES share pays $1 if the event happens and $0 if it doesn't, so its price in cents is roughly the market's estimate of the probability. "
    "Be accurate, neutral and encouraging. Never give trading or investment advice."
)


def _cents(p: float) -> str:
    return f"{round(p * 100)}¢"


def _usd(v: float) -> str:
    if v >= 1_000_000:
        return f"${v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"${v / 1_000:.0f}K"
    return f"${v:.0f}"


def _market_signals(m: Market) -> list:
    return [s for s in sv.signals.by_market.get(m.id, []) if "scenario" not in s.details]


def _auto_concepts(m: Market, sigs: list) -> list[str]:
    c = ["implied-probability"]
    if any(s.type == "anomaly" and s.score >= 40 for s in sigs):
        c.append("anomaly-patterns")
    if any(s.type == "gap" for s in sigs):
        c.append("cross-venue-arbitrage")
    if (m.volume_24h or 0) < 5000:
        c.append("liquidity")
    if len(c) < 2:
        c.append("spread-vig")
    return c[:3]


def _templated(m: Market, sigs: list) -> MarketSummary:
    p = m.yes_price
    pct = round(p * 100)
    move = ""
    if m.change_24h is not None:
        d = round(m.change_24h * 100)
        move = " Over the last day the price " + ("has held roughly steady." if d == 0 else f"{'rose' if d > 0 else 'fell'} about {abs(d)} point{'s' if abs(d) != 1 else ''}.")
    liq = f" About {_usd(m.volume_24h)} changed hands in the last 24 hours." if m.volume_24h else ""
    summary = f"A YES share pays out only if this resolves yes, so the {_cents(p)} price means traders put the chance at about {pct}%." + move + liq
    gap = next((s for s in sigs if s.type == "gap" and s.details.get("flagged")), None)
    anom = max((s for s in sigs if s.type == "anomaly"), key=lambda s: s.score, default=None)
    inc = next((s for s in sigs if s.type == "inconsistency" and s.score >= 40), None)
    if gap:
        notable = "The other venue prices the same outcome differently — see the cross-venue panel."
    elif anom and anom.score >= 40:
        notable = f"Recent trading here looks unusual (anomaly score {round(anom.score)}): {anom.explanation.split('.')[0]}."
    elif inc:
        notable = "The outcomes in this event don't add up to a clean 100%, which can signal mispricing."
    else:
        notable = "Nothing looks unusual in the recent trading — price and volume are moving together."
    return MarketSummary(plain_title=m.title, summary=summary, whats_notable=notable, concepts=_auto_concepts(m, sigs))


def _user(m: Market, sigs: list, heads: list) -> str:
    # Round to the nearest cent so sub-cent ticks don't bust the cache, while the stated odds stay accurate.
    p = round(m.yes_price, 2)
    lines = [
        f"Contract: {m.title}",
        f"Event: {m.event_title}" + (f" — {m.subtitle}" if m.subtitle else ""),
        f"Category: {m.category}  Venue: {m.venue}",
        f"YES price: {p:.2f} (~{round(p * 100)}%)",
        f"24h change: {round((m.change_24h or 0) * 100)} points   24h volume: {_usd(m.volume_24h)}",
        f"Resolution rules: {m.rules_text[:500]}",
    ]
    if sigs:
        lines.append("Signals: " + "; ".join(f"{s.type} {round(s.score)} — {s.explanation[:120]}" for s in sorted(sigs, key=lambda s: -s.score)[:3]))
    if heads:
        lines.append("Recent headlines: " + " | ".join(h.title for h in heads[:3]))
    return "\n".join(lines) + "\n\nExplain this market to a beginner."


async def generate(store: MarketStore, m: Market) -> tuple[MarketSummary, str]:
    sigs = _market_signals(m)
    heads = store.news.get(m.id, [])[:4]
    try:
        out = await llm.structured(SYSTEM, _user(m, sigs, heads), MarketSummary, tag=f"summary:{m.id}", max_tokens=600)
        out.concepts = [c for c in out.concepts if c in CONCEPT_IDS][:3] or _auto_concepts(m, sigs)
        return out, "llm"
    except llm.LLMUnavailable as e:
        log.debug("summary llm unavailable (%s); templated", e)
        return _templated(m, sigs), "templated"
