"""Kalshi Trade API v2 (public, read-only). Endpoints confirmed against the live API on 2026-10-07."""

from __future__ import annotations

from typing import Any

from app.clients.http import get_json

BASE = "https://api.elections.kalshi.com/trade-api/v2"


async def events(*, status: str = "open", limit: int = 200, cursor: str | None = None, series_ticker: str | None = None, nested: bool = True) -> dict[str, Any]:
    params: dict[str, Any] = {"status": status, "limit": limit, "with_nested_markets": str(nested).lower()}
    if cursor:
        params["cursor"] = cursor
    if series_ticker:
        params["series_ticker"] = series_ticker
    return await get_json(f"{BASE}/events", params)


async def milestones(*, category: str = "Sports", minimum_start_date: str | None = None, limit: int = 200, cursor: str | None = None) -> dict[str, Any]:
    """Live sports schedule: each milestone has the real kickoff (start_date), a status, and every event ticker it covers."""
    params: dict[str, Any] = {"category": category, "limit": limit}
    if minimum_start_date:
        params["minimum_start_date"] = minimum_start_date
    if cursor:
        params["cursor"] = cursor
    return await get_json(f"{BASE}/milestones", params)


async def event(event_ticker: str) -> dict[str, Any]:
    return await get_json(f"{BASE}/events/{event_ticker}", {"with_nested_markets": "true"})


async def market(ticker: str) -> dict[str, Any]:
    return (await get_json(f"{BASE}/markets/{ticker}"))["market"]


async def markets(*, event_ticker: str | None = None, status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"limit": limit}
    if event_ticker:
        params["event_ticker"] = event_ticker
    if status:
        params["status"] = status
    return (await get_json(f"{BASE}/markets", params))["markets"]


async def orderbook(ticker: str, depth: int = 10) -> dict[str, Any]:
    return (await get_json(f"{BASE}/markets/{ticker}/orderbook", {"depth": depth}))["orderbook_fp"]


async def candlesticks(series_ticker: str, ticker: str, start_ts: int, end_ts: int, period_minutes: int = 60) -> list[dict[str, Any]]:
    data = await get_json(f"{BASE}/series/{series_ticker}/markets/{ticker}/candlesticks", {"start_ts": start_ts, "end_ts": end_ts, "period_interval": period_minutes})
    return data.get("candlesticks", [])


async def trades(ticker: str, *, limit: int = 100, min_ts: int | None = None, max_ts: int | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"ticker": ticker, "limit": limit}
    if min_ts:
        params["min_ts"] = min_ts
    if max_ts:
        params["max_ts"] = max_ts
    return (await get_json(f"{BASE}/markets/trades", params)).get("trades", [])
