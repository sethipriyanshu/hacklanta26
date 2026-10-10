"""Analyst Desk: one shared context packet, three structured persona takes, one round of rebuttals, consensus in code.
Every LLM output is cached by the wrapper; demo mode replays. Without any cached or live answer, an authored fallback is used and labelled."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.clients import llm
from app.engines import consensus as cx
from app.engines.anomaly import resample_hourly
from app.models import Market
from app.models.desk import AnalystTake, DebateResult, DeskTake, Profile, Rebuttal
from app.prompts.desk import PERSONAS, REBUTTAL_SUFFIX
from app.services import signals as sv
from app.settings import FIXTURES_DIR
from app.store import MarketStore

log = logging.getLogger("tmb.desk")
PROFILES_FILE = FIXTURES_DIR / "profiles.json"
AUTHORED_DIR = FIXTURES_DIR / "desk"


def load_profiles() -> list[Profile]:
    out = []
    for raw in json.loads(PROFILES_FILE.read_text()):
        p = Profile.model_validate(raw)
        p.risk_budget = cx.risk_budget(p)
        out.append(p)
    return out


def context_packet(store: MarketStore, m: Market, profile: Profile) -> dict[str, object]:
    bars = resample_hourly(store.history.get(m.id, []))
    closes = [b.close for b in bars]
    sigs = [s for s in sv.signals.by_market.get(m.id, []) if "scenario" not in s.details]
    heads = store.news.get(m.id, [])[:5]
    ev = store.events.get(m.event_id)
    siblings = [store.markets[i] for i in (ev.market_ids if ev else []) if i in store.markets]
    return {
        "market": {"title": m.title, "event": m.event_title, "venue": m.venue, "category": m.category, "yesPrice": m.yes_price, "bid": m.yes_bid, "ask": m.yes_ask, "spread": m.spread, "volume24h": round(m.volume_24h), "liquidity": m.liquidity, "closeTime": m.close_time.isoformat() if m.close_time else None, "rules": m.rules_text[:700]},
        "history": {"hours": len(closes), "low": round(min(closes), 3) if closes else None, "high": round(max(closes), 3) if closes else None, "weekAgo": round(closes[0], 3) if closes else None, "change24h": m.change_24h},
        "siblings": [{"outcome": s.subtitle or s.title, "yes": s.yes_price} for s in sorted(siblings, key=lambda x: -x.yes_price)[:6]],
        "signals": [{"type": s.type, "score": round(s.score), "why": s.explanation[:220]} for s in sigs],
        "anomalyScore": round(max((s.score for s in sigs if s.type == "anomaly"), default=0.0)),
        "headlines": [{"title": h.title, "source": h.source, "at": h.published_at.isoformat()[:16]} for h in heads],
        "profile": {"name": profile.name, "tier": profile.tier, "monthlyIncome": profile.monthly_income, "fixedCosts": profile.fixed_costs, "discretionary": profile.discretionary, "holdings": [h.model_dump() for h in profile.holdings], "riskTolerance": profile.risk_tolerance, "riskBudgetUsd": profile.risk_budget},
    }


def _packet_text(ctx: dict[str, object]) -> str:
    return json.dumps(ctx, indent=0, default=str)


async def persona_take(pid: str, ctx: dict[str, object]) -> AnalystTake:
    user = f"CONTEXT:\n{_packet_text(ctx)}\n\nGive your take."
    return await llm.structured(PERSONAS[pid]["system"], user, AnalystTake, tag=f"desk:{pid}", max_tokens=700)


async def persona_rebuttal(pid: str, ctx: dict[str, object], takes: dict[str, AnalystTake]) -> Rebuttal:
    others = "\n".join(f"{PERSONAS[o]['label']}: [{t.stance.upper()} {t.confidence:.0%}] {t.argument} Key risk: {t.key_risk}" for o, t in takes.items() if o != pid)
    mine = takes[pid]
    user = f"CONTEXT (abridged):\n{_packet_text({k: ctx[k] for k in ('market', 'anomalyScore', 'profile')})}\n\nYOUR TAKE: [{mine.stance.upper()} {mine.confidence:.0%}] {mine.argument}\n\nTHE OTHERS:\n{others}\n\nRebut."
    return await llm.structured(PERSONAS[pid]["system"] + REBUTTAL_SUFFIX, user, Rebuttal, tag=f"desk-rebuttal:{pid}", max_tokens=300)


def authored(m: Market, profile: Profile, ctx: dict[str, object]) -> list[DeskTake] | None:
    """Hand-written takes for demo contracts, used only when no LLM answer exists. Risk Manager text is templated on the budget."""
    for p in AUTHORED_DIR.glob("*.json"):
        data = json.loads(p.read_text())
        if data.get("marketId") != m.id:
            continue
        takes: list[DeskTake] = []
        budget = profile.risk_budget
        anomaly = float(ctx.get("anomalyScore", 0) or 0)
        for t in data["takes"]:
            if t["persona"] == "riskmgr":
                if budget <= 0:
                    stance, conf, arg = "pass", 0.95, f"{profile.name} has ${profile.discretionary:,.0f} of discretionary income a month and a ${budget:,.0f} risk budget. There is nothing to size. Pass, and that is not a comment on the contract."
                    reb, rev = f"Quant, Contrarian: your edge math is fine and irrelevant. {profile.name} cannot afford to be wrong once. Pass.", 0.95
                elif budget < 25:
                    stance, conf, arg = "pass", 0.85, f"{profile.name}'s risk budget is ${budget:,.2f} a month. At {m.yes_price:.0%} the upside on that is pocket change and a wrong call wipes the whole budget. Pass; learn on this one, do not trade it."
                    reb, rev = f"Quant, two cents of edge on ${budget:,.2f} is a few pennies. Contrarian, agreed on humility. {profile.name} sits out.", 0.85
                else:
                    cap = round(min(budget, budget * 0.35))
                    stance, conf, arg = t["stanceIfBudget"], t["confidenceIfBudget"], t["argumentIfBudget"].format(name=profile.name, budget=f"{budget:,.0f}", cap=f"{cap:,.0f}", price=f"{m.yes_price:.0%}", anomaly=f"{anomaly:.0f}")
                    reb, rev = (t.get("rebuttal", "").format(name=profile.name, budget=f"{budget:,.0f}") or None), t.get("revisedConfidence")
                takes.append(DeskTake(persona="riskmgr", stance=stance, confidence=conf, argument=arg, key_risk=t["keyRisk"], rebuttal=reb, revised_confidence=rev))
            else:
                takes.append(DeskTake(persona=t["persona"], stance=t["stance"], confidence=t["confidence"], argument=t["argument"].format(price=f"{m.yes_price:.0%}", anomaly=f"{anomaly:.0f}"), key_risk=t["keyRisk"], rebuttal=t.get("rebuttal"), revised_confidence=t.get("revisedConfidence")))
        return takes
    return None


async def debate(store: MarketStore, m: Market, profile: Profile) -> DebateResult:
    ctx = context_packet(store, m, profile)
    anomaly = float(ctx["anomalyScore"])  # type: ignore[arg-type]
    source = "llm"
    takes: list[DeskTake]
    try:
        import asyncio

        r = await asyncio.gather(*(persona_take(pid, ctx) for pid in PERSONAS))
        t_by = dict(zip(PERSONAS, r))
        rb = await asyncio.gather(*(persona_rebuttal(pid, ctx, t_by) for pid in PERSONAS))
        takes = [DeskTake(persona=pid, stance=t_by[pid].stance, confidence=t_by[pid].confidence, argument=t_by[pid].argument, key_risk=t_by[pid].key_risk, rebuttal=b.rebuttal, revised_confidence=b.revised_confidence) for pid, b in zip(PERSONAS, rb)]  # type: ignore[arg-type]
    except llm.LLMUnavailable as e:
        log.info("desk llm unavailable (%s); trying authored takes", e)
        auth = authored(m, profile, ctx)
        if auth is None:
            raise
        takes, source = auth, "authored"
    con = cx.consensus(takes, price=m.yes_price, budget=profile.risk_budget, anomaly_score=anomaly)
    return DebateResult(market_id=m.id, profile_id=profile.id, source=source, context=ctx, takes=takes, consensus=con)  # type: ignore[arg-type]
