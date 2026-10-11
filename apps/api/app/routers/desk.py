from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.desk import DebateResult, Recommendation, RiskAppetite, SideInterest
from app.services import desk as svc
from app.store import store

router = APIRouter(prefix="/desk", tags=["desk"])


def _resolve(market_id: str):
    m = store.markets.get(market_id)
    if not m:
        raise HTTPException(404, f"unknown market {market_id}")
    return m


@router.get("/recommendations", response_model=list[Recommendation])
async def recommendations(limit: int = 8) -> list[Recommendation]:
    """Low-risk markets to suggest when someone opens the desk without a contract in mind."""
    return svc.low_risk_markets(store, limit=min(max(limit, 1), 24))


@router.get("/debate", response_model=DebateResult)
async def debate(market_id: str, risk: RiskAppetite = "moderate", side: SideInterest = "unsure") -> DebateResult:
    m = _resolve(market_id)
    try:
        return await svc.debate(store, m, risk, side)
    except svc.llm.LLMUnavailable as e:
        raise HTTPException(503, f"The desk could not answer: {e}") from e


@router.get("/debate/stream")
async def debate_stream(market_id: str, risk: RiskAppetite = "moderate", side: SideInterest = "unsure") -> EventSourceResponse:
    """SSE: context, then each argument streamed word by word, then rebuttals, then consensus."""
    m = _resolve(market_id)

    async def gen():
        try:
            result = await svc.debate(store, m, risk, side)
        except svc.llm.LLMUnavailable as e:
            yield {"event": "error", "data": json.dumps({"message": f"The desk could not answer: {e}"})}
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
        # Round two plays out as a conversation, one reply at a time, with a short "typing" beat before each.
        for r in result.thread:
            yield {"event": "typing", "data": json.dumps({"persona": r.persona})}
            await asyncio.sleep(0.9)
            yield {"event": "rebuttal", "data": json.dumps({
                "persona": r.persona, "text": r.text, "replyTo": r.reply_to, "quote": r.quote, "tone": r.tone,
                "revisedStance": r.revised_stance, "revisedConfidence": r.revised_confidence,
            })}
            await asyncio.sleep(0.5)
        yield {"event": "consensus", "data": result.consensus.model_dump_json(by_alias=True)}

    return EventSourceResponse(gen())
