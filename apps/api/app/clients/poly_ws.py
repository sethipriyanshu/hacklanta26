"""Polymarket CLOB market WebSocket (public, read-only). Streams live order-book snapshots and price deltas.

One connection per subscribed token. The public `market` channel needs no auth. Reconnects on drop."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import websockets

log = logging.getLogger("tmb.polyws")

WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"


def _events(raw: str | bytes) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(data, list):
        return [e for e in data if isinstance(e, dict)]
    return [data] if isinstance(data, dict) else []


async def stream_token(token_id: str) -> AsyncIterator[dict[str, Any]]:
    """Yield raw `book` and `price_change` events for one token, reconnecting forever until cancelled."""
    while True:
        try:
            async with websockets.connect(WS_URL, open_timeout=10, ping_interval=10, ping_timeout=10, close_timeout=5) as ws:
                await ws.send(json.dumps({"type": "market", "assets_ids": [token_id]}))
                log.info("poly ws subscribed token %s…", token_id[:12])
                async for raw in ws:
                    for e in _events(raw):
                        yield e
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 — any network/protocol error: back off and reconnect
            log.warning("poly ws dropped (%s); reconnecting", e)
            await asyncio.sleep(1.0)
