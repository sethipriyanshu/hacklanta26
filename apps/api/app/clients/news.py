"""Headlines from free sources. Each source is a small async function returning Headline rows; add more freely."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser

from app.clients.http import get_json, get_text
from app.models import Headline

log = logging.getLogger("tmb.news")

STOP = set("will the a an of in on at to by be for and or vs is are was after before after between above below than over under what which who when how many much next this that there any from with without its it's into".split())


def keywords(title: str, *, max_words: int = 4) -> list[str]:
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z'\-\.]+", title) if w.lower() not in STOP and len(w) > 2]
    seen: list[str] = []
    for w in words:
        if w.lower() not in {s.lower() for s in seen}:
            seen.append(w)
    return seen[:max_words]


def _hid(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def _parse_feed(text: str, source: str, query: str) -> list[Headline]:
    out: list[Headline] = []
    for e in feedparser.parse(text).entries:
        link = getattr(e, "link", "") or ""
        title = getattr(e, "title", "") or ""
        raw = getattr(e, "published", None) or getattr(e, "updated", None)
        try:
            when = parsedate_to_datetime(raw) if raw else datetime.now(timezone.utc)
        except (TypeError, ValueError):
            when = datetime.now(timezone.utc)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        src = source
        if " - " in title and source == "Google News":
            title, src = title.rsplit(" - ", 1)
        if title and link:
            out.append(Headline(id=_hid(link), title=title.strip(), source=src.strip(), url=link, published_at=when, query=query))
    return out


async def google_news(query: str) -> list[Headline]:
    text = await get_text("https://news.google.com/rss/search", {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    return _parse_feed(text, "Google News", query)


async def fed_press() -> list[Headline]:
    text = await get_text("https://www.federalreserve.gov/feeds/press_all.xml")
    return _parse_feed(text, "Federal Reserve", "fed")


_gdelt_last = 0.0


async def gdelt(query: str, timespan: str = "7d") -> list[Headline]:
    """GDELT allows one request per 5 seconds; pace it."""
    global _gdelt_last
    wait = 5.2 - (time.monotonic() - _gdelt_last)
    if wait > 0:
        await asyncio.sleep(wait)
    _gdelt_last = time.monotonic()
    try:
        data = await get_json("https://api.gdeltproject.org/api/v2/doc/doc", {"query": f"{query} sourcelang:english", "mode": "artlist", "format": "json", "maxrecords": 20, "timespan": timespan}, retries=1)
    except Exception as e:  # GDELT returns HTML on throttle; treat as empty
        log.info("gdelt unavailable: %s", e)
        return []
    out: list[Headline] = []
    for a in (data or {}).get("articles", []):
        try:
            when = datetime.strptime(a["seendate"], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        out.append(Headline(id=_hid(a.get("url", "")), title=a.get("title", ""), source=a.get("domain", "gdelt"), url=a.get("url", ""), published_at=when, query=query))
    return out


async def search(query: str, *, use_gdelt: bool = False) -> list[Headline]:
    tasks = [google_news(query)]
    if use_gdelt:
        tasks.append(gdelt(query))
    rows: list[Headline] = []
    for res in await asyncio.gather(*tasks, return_exceptions=True):
        if isinstance(res, list):
            rows.extend(res)
        else:
            log.warning("news source failed: %s", res)
    seen: set[str] = set()
    uniq = [h for h in rows if not (h.id in seen or seen.add(h.id))]
    uniq.sort(key=lambda h: h.published_at, reverse=True)
    return uniq[:30]


async def for_market_title(title: str) -> list[Headline]:
    return await search(" ".join(keywords(title)))
