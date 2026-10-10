"""One shared async HTTP client with timeouts, retries and backoff. Every outbound call goes through here."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

log = logging.getLogger("tmb.http")

_client: httpx.AsyncClient | None = None
USER_AGENT = "trust-me-bro/0.1 (read-only research terminal)"


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0), headers={"user-agent": USER_AGENT}, follow_redirects=True)
    return _client


async def close() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
    _client = None


class UpstreamError(RuntimeError):
    pass


async def get_json(url: str, params: dict[str, Any] | None = None, *, retries: int = 3) -> Any:
    delay = 0.6
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = await client().get(url, params=params)
            if r.status_code == 429 or r.status_code >= 500:
                raise UpstreamError(f"{r.status_code} from {url}")
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, UpstreamError, ValueError) as e:
            last = e
            log.warning("GET %s failed (attempt %d): %s", url, attempt + 1, e)
            await asyncio.sleep(delay)
            delay *= 2.2
    raise UpstreamError(f"gave up on {url}: {last}")


async def get_text(url: str, params: dict[str, Any] | None = None) -> str:
    r = await client().get(url, params=params)
    r.raise_for_status()
    return r.text
