from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.engines import swarm
from app.models.sim import Persona, SimRequest, SimRun
from app.scenarios import SCENARIOS
from app.settings import FIXTURES_DIR
from app.store import store

log = logging.getLogger("tmb.sim")
router = APIRouter(prefix="/sim", tags=["sim"])
RUNS_DIR = FIXTURES_DIR / "sim" / "runs"

_personas: list[Persona] | None = None


def personas() -> list[Persona]:
    global _personas
    if _personas is None:
        _personas = swarm.load_personas()
    return _personas


@router.get("/personas", response_model=list[Persona])
async def list_personas() -> list[Persona]:
    return personas()


@router.get("/presets")
async def presets() -> list[dict[str, Any]]:
    """Scenario presets the UI can load with one click."""
    out = []
    for sc in SCENARIOS:
        if sc.module != "sim" or not sc.market_id or not sc.headline:
            continue
        m = store.markets.get(sc.market_id)
        out.append({
            "scenario": sc.id, "code": sc.code, "title": sc.title, "proves": sc.proves, "marketId": sc.market_id, "marketTitle": m.title if m else sc.market_id,
            "headline": sc.headline.title, "headlineAt": int(sc.headline.at.timestamp()), "backtest": sc.market_id in store.history_1m,
            "swarm": {"infoSpeed": 0.15 if sc.id == 6 else 0.6, "size": 1000},
            "precomputed": (RUNS_DIR / f"scenario-{sc.id}.json").exists(),
        })
    return out


@router.get("/runs/{name}", response_model=SimRun)
async def get_run(name: str) -> SimRun:
    p = RUNS_DIR / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, f"no stored run {name}")
    return SimRun.model_validate_json(p.read_text())


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
    rx, src = await swarm.get_reactions(req.headline, m, personas())
    if real and req.swarm.liquidity is None:
        return await asyncio.to_thread(swarm.calibrate_liquidity, req, m, personas(), rx, src, p0=p0, real=real, headline_at=head)
    return await asyncio.to_thread(swarm.run, req, m, personas(), rx, src, p0=p0, real=real, headline_at=head)


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
