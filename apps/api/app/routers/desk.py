from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.desk import DebateResult, Profile
from app.services import desk as svc
from app.store import store

router = APIRouter(prefix="/desk", tags=["desk"])
_profiles: list[Profile] | None = None


def profiles() -> list[Profile]:
    global _profiles
    if _profiles is None:
        _profiles = svc.load_profiles()
    return _profiles


@router.get("/profiles", response_model=list[Profile])
async def list_profiles() -> list[Profile]:
    return profiles()


def _resolve(market_id: str, profile_id: str):
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    p = next((x for x in profiles() if x.id == profile_id), None)
    if not p:
        raise HTTPException(404, f"unknown profile {profile_id}")
    return m, p


@router.get("/debate", response_model=DebateResult)
async def debate(market_id: str, profile_id: str) -> DebateResult:
    m, p = _resolve(market_id, profile_id)
    try:
        return await svc.debate(store, m, p)
    except svc.llm.LLMUnavailable as e:
        raise HTTPException(503, f"No analyst answer available offline for this contract: {e}") from e


@router.get("/debate/stream")
async def debate_stream(market_id: str, profile_id: str) -> EventSourceResponse:
    """SSE: context, then each argument streamed word by word, then rebuttals, then consensus."""
    m, p = _resolve(market_id, profile_id)

    async def gen():
        try:
            result = await svc.debate(store, m, p)
        except svc.llm.LLMUnavailable as e:
            yield {"event": "error", "data": json.dumps({"message": f"No analyst answer available offline for this contract: {e}"})}
            return
        yield {"event": "context", "data": json.dumps({"source": result.source, "context": result.context})}
        # Round 1: interleave the three arguments so the columns fill together.
        words = {t.persona: t.argument.split(" ") for t in result.takes}
        meta = {t.persona: {"stance": t.stance, "confidence": t.confidence, "keyRisk": t.key_risk} for t in result.takes}
        for t in result.takes:
            yield {"event": "take_start", "data": json.dumps({"persona": t.persona, **meta[t.persona]})}
        i = 0
        while any(i < len(w) for w in words.values()):
            for pid, w in words.items():
                if i < len(w):
                    yield {"event": "token", "data": json.dumps({"persona": pid, "text": w[i] + " "})}
            i += 1
            await asyncio.sleep(0.028)
        for t in result.takes:
            yield {"event": "take_end", "data": json.dumps({"persona": t.persona})}
        await asyncio.sleep(0.4)
        for t in result.takes:
            if t.rebuttal:
                yield {"event": "rebuttal", "data": json.dumps({"persona": t.persona, "text": t.rebuttal, "revisedConfidence": t.revised_confidence})}
                await asyncio.sleep(0.5)
        yield {"event": "consensus", "data": result.consensus.model_dump_json(by_alias=True)}

    return EventSourceResponse(gen())
