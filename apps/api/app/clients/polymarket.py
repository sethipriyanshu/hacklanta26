"""Polymarket public APIs: Gamma (metadata), CLOB (prices, books), Data API (trades with wallets).
Endpoints confirmed against the live APIs on 2026-10-07."""

from __future__ import annotations

from typing import Any

from app.clients.http import get_json

GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
DATA = "https://data-api.polymarket.com"


async def gamma_events(*, limit: int = 100, offset: int = 0, closed: bool = False, order: str = "volume24hr") -> list[dict[str, Any]]:
    return await get_json(f"{GAMMA}/events", {"limit": limit, "offset": offset, "closed": str(closed).lower(), "order": order, "ascending": "false"})


async def gamma_event(event_id: str) -> dict[str, Any]:
    return await get_json(f"{GAMMA}/events/{event_id}")


async def gamma_event_by_slug(slug: str) -> dict[str, Any] | None:
    rows = await get_json(f"{GAMMA}/events", {"slug": slug})
    return rows[0] if rows else None


async def gamma_market(market_id: str) -> dict[str, Any]:
    return await get_json(f"{GAMMA}/markets/{market_id}")


async def prices_history(token_id: str, *, interval: str | None = "1w", fidelity_minutes: int = 60, start_ts: int | None = None, end_ts: int | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"market": token_id, "fidelity": fidelity_minutes}
    if start_ts and end_ts:
        params["startTs"], params["endTs"] = start_ts, end_ts
    elif interval:
        params["interval"] = interval
    return (await get_json(f"{CLOB}/prices-history", params)).get("history", [])


async def book(token_id: str) -> dict[str, Any]:
    return await get_json(f"{CLOB}/book", {"token_id": token_id})


async def trades(condition_id: str, *, limit: int = 200, offset: int = 0) -> list[dict[str, Any]]:
    return await get_json(f"{DATA}/trades", {"market": condition_id, "limit": limit, "offset": offset})


async def holders(condition_id: str, *, limit: int = 10) -> list[dict[str, Any]]:
    return await get_json(f"{DATA}/holders", {"market": condition_id, "limit": limit})


async def activity(wallet: str, *, limit: int = 50) -> list[dict[str, Any]]:
    return await get_json(f"{DATA}/activity", {"user": wallet, "limit": limit})
