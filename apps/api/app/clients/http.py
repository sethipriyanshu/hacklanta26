"""One shared async HTTP client with timeouts, retries and backoff. Every outbound call goes through here."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

log = logging.getLogger("tmb.http")

_client: httpx.AsyncClient | None = None
# A real browser UA: the venues sit behind Cloudflare/WAF that drops generic API agents under load.
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
# Cap concurrent outbound requests so bursts don't trip venue rate limits / WAF blocks.
_gate = asyncio.Semaphore(4)


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=6.0),
            headers={"user-agent": USER_AGENT, "accept": "application/json"},
            follow_redirects=True,
            limits=httpx.Limits(max_connections=6, max_keepalive_connections=4),
        )
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
            async with _gate:
                r = await client().get(url, params=params)
            if r.status_code == 429 or r.status_code >= 500:
                raise UpstreamError(f"{r.status_code} from {url}")
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, UpstreamError, ValueError) as e:
            last = e
            log.warning("GET %s failed (attempt %d): %s", url, attempt + 1, type(e).__name__ or e)
            await asyncio.sleep(delay)
            delay *= 2.2
    raise UpstreamError(f"gave up on {url}: {last}")


async def get_text(url: str, params: dict[str, Any] | None = None) -> str:
    r = await client().get(url, params=params)
    r.raise_for_status()
    return r.text
