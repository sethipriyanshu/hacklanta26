"""The market data store (Tiger Data): what it holds, and hourly bars read back from it."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.services.tiger import tiger

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/stats")
async def stats() -> dict[str, Any]:
    return await tiger.stats()


@router.get("/history/{market_id}")
async def history(market_id: str, hours: int = Query(168, ge=1, le=720)) -> list[dict[str, Any]]:
    """Hourly OHLC bars from the market_ticks_1h continuous aggregate."""
    return await tiger.history(market_id, hours)
