"""Cross-venue matching: fuzzy candidates, then an LLM compares resolution rules. Confirmed pairs are cached and curated."""

from __future__ import annotations

import json
import logging
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
