"""Cross-venue matching: fuzzy candidates, then an LLM compares resolution rules. Confirmed pairs are cached and curated."""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from app.clients import llm
from app.models import Market
from app.models.signals import VenuePair
from app.settings import FIXTURES_DIR

log = logging.getLogger("tmb.matching")
PAIRS_FILE = FIXTURES_DIR / "pairs.json"


class RuleCheck(BaseModel):
    match: Literal["same", "different", "partial"] = Field(description="same = identical resolution; partial = one contract spans or nests the other; different = looks alike but resolves differently")
    reason: str = Field(description="One sentence, plain English, under 30 words")


SYSTEM = (
    "You compare prediction-market contracts from two venues and decide whether they resolve on the same event. "
    "Judge only resolution rules: dates, thresholds, sources, bracket structure. Be terse."
)


def candidate_pairs(markets: list[Market], *, min_score: int = 80, max_days: int = 3) -> list[tuple[Market, Market]]:
    """Fuzzy title match within a category and a similar close date. Cheap first pass."""
    kalshi = [m for m in markets if m.venue == "kalshi"]
    poly = [m for m in markets if m.venue == "polymarket"]
    out: list[tuple[Market, Market]] = []
    for k in kalshi:
        kt = f"{k.event_title} {k.subtitle or ''}"
        for p in poly:
            if p.category != k.category:
                continue
            if k.close_time and p.close_time and abs((k.close_time - p.close_time).days) > max_days:
                continue
            if fuzz.token_set_ratio(kt, f"{p.event_title} {p.subtitle or ''}") >= min_score:
                out.append((k, p))
    return out


async def check_rules(kalshi: Market, polys: list[Market]) -> RuleCheck:
    poly_rules = "\n\n".join(f"[Polymarket {i + 1}] {p.title}\nRules: {p.rules_text[:900]}" for i, p in enumerate(polys))
    user = f"[Kalshi] {kalshi.title}\nRules: {kalshi.rules_text[:900]}\n\n{poly_rules}\n\nDo these resolve on the same outcome?"
    return await llm.structured(SYSTEM, user, RuleCheck, tag=f"pair:{kalshi.ticker}", max_tokens=300)


_SPREAD_WORDS = re.compile(r"spread|o/u|over|under|total|handicap|margin|moneyline|period|quarter|half|map\b|set\b|game\s*\d", re.I)
_NOT_MONEYLINE = {"over", "under", "odd", "even", "yes", "no"}
_MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}
# Both venues encode league + teams + date in their tickers; we match on those, not on fuzzy titles.
_KALSHI_LEAGUE = {"KXNFLGAME": "nfl", "KXNBAGAME": "nba", "KXNHLGAME": "nhl", "KXMLBGAME": "mlb", "KXNCAAFGAME": "cfb", "KXEPLGAME": "soccer", "KXUCLGAME": "soccer", "KXLALIGAGAME": "soccer", "KXATPMATCH": "atp", "KXWTAMATCH": "wta"}
_POLY_LEAGUE = {"nfl": "nfl", "nba": "nba", "nhl": "nhl", "mlb": "mlb", "cfb": "cfb", "ncaaf": "cfb", "atp": "atp", "wta": "wta", "epl": "soccer", "ucl": "soccer", "uel": "soccer", "laliga": "soccer", "seriea": "soccer", "bundesliga": "soccer", "ligue1": "soccer", "mls": "soccer"}
_KALSHI_DATE = re.compile(r"^(\d{2})([A-Z]{3})(\d{2})")


def _poly_game(m: Market) -> tuple[str, str, str, date] | None:
    """(league, away_code, home_code, game_date) from a Polymarket slug like 'nfl-tb-dal-2026-10-09'."""
    parts = m.ticker.split("-")
    league = _POLY_LEAGUE.get(parts[0].lower()) if parts else None
    if not league:
        return None
    for i in range(1, len(parts) - 2):  # the date is the first YYYY-MM-DD run; teams are the tokens before it
        if len(parts[i]) == 4 and parts[i].isdigit():
            teams = parts[1:i]
            if len(teams) != 2:
                return None
            try:
                return league, teams[0].upper(), teams[1].upper(), date(int(parts[i]), int(parts[i + 1]), int(parts[i + 2]))
            except (ValueError, IndexError):
                return None
    return None


def _kalshi_game(m: Market) -> tuple[str, str, date, str] | None:
    """(league, team_code, game_date, event_id) from a Kalshi ticker like 'KXNFLGAME-26OCT08TBDAL-DAL'."""
    parts = m.ticker.split("-")
    if len(parts) < 3:
        return None
    league = _KALSHI_LEAGUE.get(parts[0])
    mo = _KALSHI_DATE.match(parts[1])
    if not league or not mo or mo.group(2) not in _MONTHS:
        return None
    yy, mmm, dd = mo.groups()
    try:
        return league, parts[-1].upper(), date(2000 + int(yy), _MONTHS[mmm], int(dd)), m.event_id
    except ValueError:
        return None


def _code_match(a: str, b: str) -> bool:
    """Two short team codes refer to the same team: equal, one a prefix of the other, or a near fuzzy hit."""
    a, b = a.upper(), b.upper()
    if a == b or a.startswith(b) or b.startswith(a):
        return True
    return fuzz.ratio(a, b) >= 80


def sports_pairs(markets: list[Market], *, max_days: int = 2) -> list[VenuePair]:
    """Match Polymarket game moneylines to the Kalshi market for the SAME team, by league + team codes + date.

    Both venues put the matchup and date in the ticker (poly 'nfl-tb-dal-2026-10-09', kalshi 'KXNFLGAME-26OCT08TBDAL-DAL'),
    and Kalshi's per-team market suffix names the team. We align the Polymarket YES side (outcome 0 = the first/away team
    in the slug) to the Kalshi market for that same team, so the gap compares the same outcome, never the opponent."""
    kalshi_events: dict[str, dict] = {}  # event_id -> {league, date, teams: {code: Market}}
    for m in markets:
        if m.venue != "kalshi" or not m.meta.get("game"):
            continue
        parsed = _kalshi_game(m)
        if not parsed:
            continue
        league, code, gdate, ev = parsed
        kalshi_events.setdefault(ev, {"league": league, "date": gdate, "teams": {}})["teams"][code] = m

    out: list[VenuePair] = []
    for p in markets:
        if p.venue != "polymarket" or not p.meta.get("game"):
            continue
        if _SPREAD_WORDS.search(f"{p.subtitle or ''} {p.title} {p.ticker}"):
            continue  # moneyline only — spreads/totals name themselves in the title or slug, not always the subtitle
        if len(p.outcomes) != 2 or {o.lower() for o in p.outcomes} & _NOT_MONEYLINE:
            continue  # reject totals (Over/Under), odd/even and yes/no props sharing the game's slug
        pg = _poly_game(p)
        if not pg:
            continue
        league, away, home, pdate = pg
        for info in kalshi_events.values():
            if info["league"] != league or abs((info["date"] - pdate).days) > max_days:
                continue
            codes = info["teams"]
            km_away = next((km for c, km in codes.items() if _code_match(away, c)), None)
            km_home = next((km for c, km in codes.items() if _code_match(home, c)), None)
            if not km_away or not km_home or km_away is km_home:
                continue  # need both teams, distinctly, to be sure it is the same game
            out.append(
                VenuePair(
                    id=f"auto:{km_away.id}~{p.id}",
                    kalshi_id=km_away.id,  # YES = away team on both sides, so the gap compares like with like
                    poly_ids=[p.id],
                    match="same",
                    reason=f"Same game ({p.outcomes[0]} vs {p.outcomes[1]}), matched by league, teams and date. Auto-detected, not yet rule-checked.",
                    title=f"{p.outcomes[0]} vs {p.outcomes[1]}",
                    checked_by="auto",
                )
            )
            break
    return out


_YEAR = re.compile(r"\b(20\d{2})\b")
_PARENS = re.compile(r"\(.*?\)")
_NONWORD = re.compile(r"[^\w\s]", re.U)


def _norm_entity(s: str) -> str:
    s = _PARENS.sub("", s or "")  # drop party/role tags like "(R)"
    return re.sub(r"\s+", " ", _NONWORD.sub(" ", s).lower()).strip()


def entity_pairs(markets: list[Market], *, min_event: int = 60) -> list[VenuePair]:
    """Match multi-outcome markets (elections, awards, nominations, championships) by the outcome's name.

    Both venues list a market per candidate/team with that name in the subtitle. We match exact names within a
    category, gate by a fuzzy event-title check and a shared year so 'Trump 2028 president' never pairs with
    'Trump Nobel' or 'Trump 2024'. Both YES = P(this outcome), so the comparison is aligned. These are informational
    (resolution rules can differ across venues, e.g. election day vs inauguration), so they are never flagged as an edge."""
    poly_idx: dict[tuple[str, str], list[Market]] = {}
    for p in markets:
        if p.venue != "polymarket" or not p.subtitle or p.meta.get("game"):
            continue
        e = _norm_entity(p.subtitle)
        if len(e) >= 3:
            poly_idx.setdefault((p.category, e), []).append(p)

    out: list[VenuePair] = []
    seen: set[str] = set()
    for k in markets:
        if k.venue != "kalshi" or not k.subtitle or k.meta.get("game"):
            continue
        e = _norm_entity(k.subtitle)
        if len(e) < 3:
            continue
        for p in poly_idx.get((k.category, e), []):
            ky, py = set(_YEAR.findall(k.event_title)), set(_YEAR.findall(p.event_title))
            if ky and py and not (ky & py):
                continue  # same name, different edition/year
            if fuzz.token_set_ratio(k.event_title, p.event_title) < min_event:
                continue  # same name, unrelated event
            pid = f"autoent:{k.id}~{p.id}"
            if pid in seen:
                continue
            seen.add(pid)
            out.append(
                VenuePair(
                    id=pid,
                    kalshi_id=k.id,
                    poly_ids=[p.id],
                    match="same",
                    reason=f"Both ask about {p.subtitle} in '{p.event_title[:50]}'. Auto-matched by name; resolution rules not verified.",
                    title=f"{p.event_title[:40]} · {p.subtitle}",
                    checked_by="auto",
                )
            )
            break
    return out


def load_pairs() -> list[VenuePair]:
    if not PAIRS_FILE.exists():
        return []
    return [VenuePair.model_validate(r) for r in json.loads(PAIRS_FILE.read_text())]


def save_pairs(pairs: list[VenuePair]) -> None:
    PAIRS_FILE.write_text(json.dumps([p.model_dump(mode="json", by_alias=True) for p in pairs], indent=1))


async def verify_pairs(pairs: list[VenuePair], markets: dict[str, Market]) -> list[VenuePair]:
    """Run the LLM rule check on each curated pair once; results are cached on disk by the wrapper."""
    out: list[VenuePair] = []
    for p in pairs:
        k = markets.get(p.kalshi_id)
        polys = [markets[i] for i in p.poly_ids if i in markets]
        if not k or not polys:
            out.append(p)
            continue
        try:
            rc = await check_rules(k, polys)
            out.append(p.model_copy(update={"match": rc.match, "reason": rc.reason, "checked_by": "llm"}))
        except llm.LLMUnavailable as e:
            log.info("pair %s kept curated verdict: %s", p.id, e)
            out.append(p)
    return out
