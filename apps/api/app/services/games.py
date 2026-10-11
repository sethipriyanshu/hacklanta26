"""One definition of a game's state, used by the market list, the "In progress" filter and the signal game window.

Sources, most authoritative first:
- Polymarket: the event's own `live` / `ended` flags (normalized into meta.gameLive / meta.gameEnded).
- Kalshi: the milestones API (real kickoff in meta.gameStartTime, provider status in meta.gameStatus).
- Either venue: the kickoff time alone, as a bounded window, when no flag or status is available.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.clients import kalshi
from app.models import Market

log = logging.getLogger("tmb.games")

HOUR = 3600
# Long enough for overtime in any league we list, short enough that a game without a status never stays "live" overnight.
MAX_GAME_HOURS = 5
# Kalshi milestone statuses vary by data provider; these are the ones that mean the game is over or will not be played.
_OVER = {"finished", "closed", "complete", "completed", "final", "ended", "abandoned", "cancelled", "canceled", "postponed", "w", "wov", "event closed"}
_LIVE = {"inprogress", "in_progress", "live", "halftime", "p"}

GameState = Literal["upcoming", "live", "over"]


def _status_over(status: str) -> bool:
    s = status.strip().lower()
    return s in _OVER or s.startswith(("match complete", "event closed"))


def game_state(m: Market, now: int) -> GameState | None:
    """None for a market that isn't tied to a scheduled game."""
    meta = m.meta
    start = meta.get("gameStartTime")
    if not start:
        return None
    if m.status == "closed" or meta.get("resolved") or meta.get("acceptingOrders", True) is False:
        return "over"
    if meta.get("gameEnded") is True:
        return "over"
    if meta.get("gameLive") is True:
        return "live"
    status = str(meta.get("gameStatus") or "")
    if status and _status_over(status):
        return "over"
    if now < start:
        return "upcoming"
    if status.strip().lower() in _LIVE:
        return "live"
    return "live" if now <= start + MAX_GAME_HOURS * HOUR else "over"


def is_live(m: Market, now: int) -> bool:
    return game_state(m, now) == "live"


# Kalshi series prefix -> league, for markets whose milestone carries no usable league name.
KALSHI_LEAGUE_PREFIX = [
    ("KXNCAAF", "CFB"), ("KXNFL", "NFL"), ("KXNCAAMB", "CBB"), ("KXNCAAB", "CBB"), ("KXWNBA", "WNBA"), ("KXNBA", "NBA"), ("KXMLB", "MLB"), ("KXNHL", "NHL"),
    ("KXEPL", "Soccer"), ("KXUCL", "Soccer"), ("KXUEL", "Soccer"), ("KXLALIGA", "Soccer"), ("KXSERIEA", "Soccer"), ("KXBUNDESLIGA", "Soccer"), ("KXLIGUE1", "Soccer"), ("KXMLS", "Soccer"),
    ("KXATP", "Tennis"), ("KXWTA", "Tennis"), ("KXUFC", "UFC"), ("KXPGA", "Golf"), ("KXF1", "F1"),
]


def kalshi_league(series: str) -> str | None:
    s = (series or "").upper()
    for prefix, league in KALSHI_LEAGUE_PREFIX:
        if s.startswith(prefix):
            return league
    return None


async def pull_kalshi_schedule(*, max_pages: int = 30) -> dict[str, dict[str, object]]:
    """Every Kalshi sports milestone from 12 hours ago onward, keyed by each event ticker it covers.
    A failure returns whatever was fetched so far; game state then falls back to the kickoff window."""
    since = (datetime.now(timezone.utc) - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
    out: dict[str, dict[str, object]] = {}
    cursor: str | None = None
    try:
        for _ in range(max_pages):
            data = await kalshi.milestones(category="Sports", minimum_start_date=since, cursor=cursor)
            for ms in data.get("milestones") or []:
                start = ms.get("start_date")
                if not start:
                    continue
                try:
                    start_ts = int(datetime.fromisoformat(start).timestamp())
                except ValueError:
                    continue
                info = {"gameStartTime": start_ts, "gameStatus": (ms.get("details") or {}).get("status") or None}
                for t in [*(ms.get("primary_event_tickers") or []), *(ms.get("related_event_tickers") or [])]:
                    out.setdefault(t, info)
            cursor = data.get("cursor") or None
            if not cursor:
                break
    except Exception as e:  # noqa: BLE001 — the schedule is an enrichment; never let it sink the market pull
        log.warning("kalshi milestones stopped early: %s", e)
    return out
