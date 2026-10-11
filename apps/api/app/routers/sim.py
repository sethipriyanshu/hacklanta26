from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.engines import swarm
from app.models.sim import Persona, RunSummary, RunSummaryRequest, RunSummaryText, SimRequest, SimRun
from app.store import store

log = logging.getLogger("tmb.sim")
router = APIRouter(prefix="/sim", tags=["sim"])

_personas: list[Persona] | None = None


def personas() -> list[Persona]:
    global _personas
    if _personas is None:
        _personas = swarm.load_personas()
    return _personas


@router.get("/personas", response_model=list[Persona])
async def list_personas() -> list[Persona]:
    return personas()


async def prepare(req: SimRequest) -> SimRun:
    m = store.markets.get(req.market_id)
    if not m:
        raise HTTPException(404, f"unknown market {req.market_id}")
    real = store.history_1m.get(m.id) if req.backtest else None
    if req.headline_at:
        head = req.headline_at
    elif real:
        head = real[len(real) * 2 // 3].ts  # middle-ish of the window if nobody said when
    else:
        import time

        head = int(time.time())
    if real:
        before = [p.price for p in real if p.ts <= head - req.pre_minutes * 60]
        p0 = before[-1] if before else real[0].price
    else:
        p0 = m.yes_price
    # One side of a two-outcome event (a game's two teams) is analysed once and mirrored, so the sides never disagree.
    ev = store.events.get(m.event_id)
    pair = [store.markets[i] for i in (ev.market_ids if ev and ev.mutually_exclusive else []) if i in store.markets]
    complement = next((x for x in pair if x.id != m.id), None) if len(pair) == 2 else None
    rx = await swarm.get_reactions(req.headline, m, personas(), complement=complement)
    if real and req.swarm.liquidity is None:
        return await asyncio.to_thread(swarm.calibrate_liquidity, req, m, personas(), rx, p0=p0, real=real, headline_at=head)
    return await asyncio.to_thread(swarm.run, req, m, personas(), rx, p0=p0, real=real, headline_at=head)


@router.post("/run", response_model=SimRun)
async def run_sim(req: SimRequest) -> SimRun:
    return await prepare(req)


@router.post("/stream")
async def stream_sim(req: SimRequest) -> EventSourceResponse:
    """Server-sent events: meta first, then ticks in small batches so the swarm animates, then done."""

    async def gen():
        run = await prepare(req)
        head = run.model_dump(mode="json", by_alias=True)
        ticks = head.pop("ticks")
        yield {"event": "meta", "data": json.dumps(head)}
        batch = 4
        for i in range(0, len(ticks), batch):
            yield {"event": "ticks", "data": json.dumps(ticks[i : i + batch])}
            await asyncio.sleep(0.03)
        yield {"event": "done", "data": json.dumps({"maeCents": run.mae_cents, "maePostCents": run.mae_post_cents})}

    return EventSourceResponse(gen())


def _template_summary(r: RunSummaryRequest) -> RunSummary:
    move = round((r.end_price - r.start_price) * 100)
    word = "fell" if move < 0 else "rose" if move > 0 else "held"
    ranked = sorted(r.groups, key=lambda g: -g.bet)
    lead = ", ".join(g.label.lower() for g in ranked[:2]) if ranked else "the crowd"
    settle = f" and settled within about {r.settle_minutes} minutes" if r.settle_minutes is not None else ""
    side = "lower" if r.lower_share >= r.higher_share else "higher"
    share = round(100 * max(r.lower_share, r.higher_share))
    return RunSummary(
        summary=f"In the simulation the price {word} from {round(r.start_price * 100)}% to {round(r.end_price * 100)}%{settle}. "
        f"{share}% of agents ended up expecting it {side} than before the news, and the biggest bets came from {lead}.",
        takeaway="This is how a simulated crowd reacted, not a forecast of the real market.",
        source="template",
    )


@router.post("/summary", response_model=RunSummary)
async def summarize_run(r: RunSummaryRequest) -> RunSummary:
    """A short written read of a finished run, using only the run's own numbers. Cached by those numbers."""
    from app.clients import llm

    system = (
        "You summarise the result of a simulated prediction-market crowd for a general reader. Use ONLY the numbers given. "
        "Describe what the simulated crowd did, which groups moved the price (the ones that bet the most), and how quickly it settled. "
        "Never call any number a fair value or a forecast, never give advice, and keep it plain and specific. Percentages are probabilities of YES."
    )
    groups = "\n".join(f"- {g.label}: {g.agents} agents, average belief {g.mean_belief:.0%}, bet ${g.bet:,.0f}, reacted after {g.minutes:.0f} min" if g.minutes is not None else f"- {g.label}: {g.agents} agents, average belief {g.mean_belief:.0%}, bet ${g.bet:,.0f}" for g in r.groups)
    user = (
        f"Contract: {r.market_title}\nHeadline: {r.headline}\nSimulated price: {r.start_price:.0%} before, {r.end_price:.0%} after\n"
        f"Settled within 2 points after: {r.settle_minutes if r.settle_minutes is not None else 'unknown'} minutes\nTraded after the news: ${r.traded_usd:,.0f}\n"
        f"Agents expecting lower than before: {r.lower_share:.0%}; higher: {r.higher_share:.0%}; not yet heard: {r.unheard_share:.0%}\nGroups:\n{groups}"
    )
    try:
        out = await llm.structured(system, user, RunSummaryText, tag="sim-summary", max_tokens=400)
        return RunSummary(summary=out.summary, takeaway=out.takeaway, source="llm")
    except Exception as e:  # noqa: BLE001 — no model, no budget, or a bad answer: fall back to a plain template
        log.info("run summary fell back to template: %s", e)
        return _template_summary(r)
