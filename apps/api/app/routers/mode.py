"""Runtime LLM mode: the live/cached toggle and the session spend ledger the top-bar pill drives."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app import runtime

router = APIRouter(prefix="/mode", tags=["mode"])


class ModeUpdate(BaseModel):
    live: bool | None = None
    reset: bool | None = None  # zero the session spend ledger


@router.get("")
async def get_mode() -> dict[str, object]:
    return runtime.snapshot()


@router.post("")
async def set_mode(body: ModeUpdate) -> dict[str, object]:
    if body.reset:
        runtime.reset_cost()
    if body.live is not None:
        runtime.set_live(body.live)
    return runtime.snapshot()
