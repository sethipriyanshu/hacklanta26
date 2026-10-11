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
from app.models.desk import AnalystTake, DebateReply, DebateResult, DeskTake, Rebuttal, Recommendation, RiskAppetite, SideInterest
from app.prompts.desk import CLOSER_SUFFIX, PERSONAS, REBUTTAL_SUFFIX
from app.services import signals as sv
from app.settings import FIXTURES_DIR
from app.store import MarketStore

log = logging.getLogger("tmb.desk")
AUTHORED_DIR = FIXTURES_DIR / "desk"


def context_packet(store: MarketStore, m: Market, risk: RiskAppetite = "moderate", side: SideInterest = "unsure") -> dict[str, object]:
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
        "reader": {"riskAppetite": risk, "considering": side},
    }


def _packet_text(ctx: dict[str, object]) -> str:
    return json.dumps(ctx, indent=0, default=str)


async def persona_take(pid: str, ctx: dict[str, object]) -> AnalystTake:
    user = f"CONTEXT:\n{_packet_text(ctx)}\n\nGive your take."
    return await llm.structured(PERSONAS[pid]["system"], user, AnalystTake, tag=f"desk:{pid}", max_tokens=700)


# Round two is a conversation where every analyst speaks twice and the Risk Manager has the last word.
# Targets: a persona id, "disagrees" (an analyst whose opening stance differs from the speaker's), "last_to_me"
# (whoever most recently replied to the speaker), or "both" (the close).
REPLY_PLAN: list[tuple[str, str]] = [
    ("contrarian", "quant"),
    ("quant", "contrarian"),
    ("riskmgr", "disagrees"),
    ("contrarian", "last_to_me"),
    ("quant", "last_to_me"),
    ("riskmgr", "both"),
]


def _resolve_target(pid: str, target: str, takes: dict[str, AnalystTake], thread: list[DebateReply]) -> str:
    if target in ("both", "quant", "contrarian", "riskmgr"):
        return target
    others = [o for o in PERSONAS if o != pid]
    if target == "last_to_me":
        for r in reversed(thread):
            if r.reply_to == pid:
                return r.persona
    if target in ("disagrees", "last_to_me"):
        mine = takes[pid].stance
        return next((o for o in others if takes[o].stance != mine), others[0])
    return others[0]


def _take_line(pid: str, t: AnalystTake) -> str:
    return f"{PERSONAS[pid]['label']} [{t.stance.upper()} {t.confidence:.0%}]: {t.argument} Key risk: {t.key_risk}"


async def persona_rebuttal(pid: str, target: str, step: int, ctx: dict[str, object], takes: dict[str, AnalystTake], thread: list[DebateReply]) -> Rebuttal:
    brief = _packet_text({k: ctx[k] for k in ("market", "anomalyScore", "reader")})
    openings = "\n".join(_take_line(o, t) for o, t in takes.items())
    so_far = "\n".join(f"{PERSONAS[r.persona]['label']} to {('everyone' if r.reply_to == 'both' else PERSONAS[r.reply_to]['label'])} ({r.tone}): {r.text}" for r in thread) or "(nothing yet)"
    if target == "both":
        system, ask = PERSONAS[pid]["system"] + CLOSER_SUFFIX, "Close the conversation."
    else:
        system, ask = PERSONAS[pid]["system"] + REBUTTAL_SUFFIX, f"Answer {PERSONAS[target]['label']}, building on the conversation so far rather than repeating yourself."
    user = f"CONTEXT (abridged):\n{brief}\n\nOPENING TAKES:\n{openings}\n\nROUND TWO SO FAR:\n{so_far}\n\nYou are {PERSONAS[pid]['label']}. {ask}"
    return await llm.structured(system, user, Rebuttal, tag=f"desk-reply:{pid}:{step}", max_tokens=320)


def _finalize(takes: dict[str, DeskTake], thread: list[DebateReply]) -> list[DeskTake]:
    """Each analyst's final position is their last message in the thread."""
    for r in thread:
        t = takes[r.persona]
        t.rebuttal, t.revised_stance, t.revised_confidence, t.reply_to, t.quote, t.tone = r.text, r.revised_stance, r.revised_confidence, r.reply_to, r.quote, r.tone
    return [takes[p] for p in PERSONAS if p in takes]


def authored(m: Market, ctx: dict[str, object]) -> tuple[list[DeskTake], list[DebateReply]] | None:
    """Hand-written takes and thread for demo contracts, used only when no LLM answer exists."""
    for p in AUTHORED_DIR.glob("*.json"):
        data = json.loads(p.read_text())
        if data.get("marketId") != m.id:
            continue
        anomaly = float(ctx.get("anomalyScore", 0) or 0)
        fmt = {"price": f"{m.yes_price:.0%}", "anomaly": f"{anomaly:.0f}"}
        opened = {
            t["persona"]: DeskTake(persona=t["persona"], stance=t["stance"], confidence=t["confidence"], argument=t["argument"].format(**fmt), key_risk=t["keyRisk"])
            for t in data["takes"]
        }
        thread = [
            DebateReply(persona=r["persona"], reply_to=r["replyTo"], quote=r.get("quote") or None, tone=r["tone"], text=r["text"].format(**fmt), revised_stance=r["revisedStance"], revised_confidence=r["revisedConfidence"])
            for r in data.get("thread", [])
        ]
        return _finalize(opened, thread), thread
    return None


async def debate(store: MarketStore, m: Market, risk: RiskAppetite = "moderate", side: SideInterest = "unsure") -> DebateResult:
    ctx = context_packet(store, m, risk, side)
    anomaly = float(ctx["anomalyScore"])  # type: ignore[arg-type]
    source = "llm"
    takes: list[DeskTake]
    thread: list[DebateReply] = []
    try:
        import asyncio

        r = await asyncio.gather(*(persona_take(pid, ctx) for pid in PERSONAS))
        t_by = dict(zip(PERSONAS, r))
        thread: list[DebateReply] = []
        for step, (pid, plan) in enumerate(REPLY_PLAN):
            target = _resolve_target(pid, plan, t_by, thread)
            r = await persona_rebuttal(pid, target, step, ctx, t_by, thread)
            thread.append(DebateReply(persona=pid, reply_to=target, quote=r.quote or None, tone=r.tone, text=r.rebuttal, revised_stance=r.revised_stance, revised_confidence=r.revised_confidence))  # type: ignore[arg-type]
        opened = {pid: DeskTake(persona=pid, stance=t.stance, confidence=t.confidence, argument=t.argument, key_risk=t.key_risk) for pid, t in t_by.items()}  # type: ignore[arg-type]
        takes = _finalize(opened, thread)
    except llm.LLMUnavailable as e:
        log.info("desk llm unavailable (%s); trying authored takes", e)
        auth = authored(m, ctx)
        if auth is None:
            raise
        takes, thread, source = auth[0], auth[1], "authored"
    con = cx.consensus(takes, price=m.yes_price, anomaly_score=anomaly, risk=risk, side_interest=side)
    return DebateResult(market_id=m.id, risk=risk, side=side, source=source, context=ctx, takes=takes, thread=thread, consensus=con)  # type: ignore[arg-type]


def low_risk_markets(store: MarketStore, *, limit: int = 8) -> list[Recommendation]:
    """Markets a cautious reader could start with, chosen by checkable rules, not a model:
    liquid (>= $25k traded in 24h), tight (spread <= 2c), not flagged, not a game in progress,
    a clear favourite (YES 75-95c), and resolving within 90 days. One market per event."""
    from datetime import datetime, timedelta, timezone

    from app.services import games

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=90)
    ts = int(now.timestamp())
    picks: list[tuple[float, Market]] = []
    for m in store.markets.values():
        if m.volume_24h < 25_000 or not (0.75 <= m.yes_price <= 0.95):
            continue
        if m.spread is None or m.spread > 0.02 or not m.close_time or not (now < m.close_time <= horizon):
            continue
        if not sv.is_listable(store, m, now) or sv.max_score(m.id) >= 40 or games.game_state(m, ts) is not None:
            continue
        picks.append((m.volume_24h, m))
    picks.sort(key=lambda x: -x[0])
    out: list[Recommendation] = []
    seen_events: set[str] = set()
    for _, m in picks:
        if m.event_id in seen_events:
            continue
        seen_events.add(m.event_id)
        days = max(1, (m.close_time - now).days) if m.close_time else None
        out.append(Recommendation(
            market_id=m.id, title=m.title, event_title=m.event_title, venue=m.venue, category=m.category, yes_price=m.yes_price,
            volume_24h=m.volume_24h, spread=m.spread, close_time=m.close_time.isoformat() if m.close_time else None,
            reasons=[f"${m.volume_24h / 1000:,.0f}K traded today", f"{(m.spread or 0) * 100:.0f}¢ spread", "No flags", f"Resolves in {days} day{'s' if days != 1 else ''}"],
        ))
        if len(out) >= limit:
            break
    return out
