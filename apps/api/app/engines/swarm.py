"""Hybrid swarm: persona clusters react (LLM, authored or heuristic), sampled agents trade through an LMSR market maker.
Deterministic for a given seed."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import random
import re
from dataclasses import dataclass, field

from app.engines.lmsr import LMSR
from app.models import Market, PricePoint
from app.models.sim import AgentState, Persona, Reaction, SimRequest, SimRun, SwarmConfig, Tick
from app.settings import FIXTURES_DIR

log = logging.getLogger("tmb.swarm")

PERSONAS_FILE = FIXTURES_DIR / "personas.json"
REACTIONS_DIR = FIXTURES_DIR / "sim" / "reactions"
AGE_POS = {"18-29": 0.1, "30-44": 0.4, "45-64": 0.7, "65+": 0.95}
INCOME_POS = {"low": 0.1, "mid": 0.5, "high": 0.9}
LEAN_POS = {"left": 0.1, "center": 0.5, "right": 0.9}


def load_personas() -> list[Persona]:
    return [Persona.model_validate(p) for p in json.loads(PERSONAS_FILE.read_text())]


# ---------- reactions ----------

def _headline_key(headline: str) -> str:
    return hashlib.sha1(headline.strip().lower().encode()).hexdigest()[:12]


def authored_reactions(headline: str) -> tuple[list[Reaction], str] | None:
    """Look for a hand-authored or previously generated reaction set for this headline."""
    for p in REACTIONS_DIR.glob("*.json"):
        data = json.loads(p.read_text())
        if data.get("headline", "").strip().lower() == headline.strip().lower() or p.stem == _headline_key(headline):
            return [Reaction.model_validate(r) for r in data["reactions"]], data.get("source", "authored")
    return None


POS_RE = re.compile(r"\b(wins?|won|awarded|confirms?|confirmed|approved?|passes?|passed|announces?|announced|signs?|signed|yes|reaches?|reached|hits?|clears?|cleared|succeeds?)\b", re.I)
NEG_RE = re.compile(r"\b(loses?|lost|denied|denies|rejects?|rejected|fails?|failed|delays?|delayed|cancel(?:s|led)?|misses?|missed|retracts?|retracted|correction|rumou?r|fake|false|collapses?)\b", re.I)
UP_RE = re.compile(r"\b(raise[sd]?|hike[sd]?|increase[sd]?|lifts?|higher)\b", re.I)
DOWN_RE = re.compile(r"\b(cut[s]?|lower(?:s|ed)?|decrease[sd]?|slash(?:es|ed)?|reduce[sd]?)\b", re.I)
HOLD_RE = re.compile(r"\b(hold[s]?|held|steady|unchanged|no change|pause[sd]?|stands? pat)\b", re.I)


def _direction(text: str) -> str:
    if HOLD_RE.search(text) and not (UP_RE.search(text) or DOWN_RE.search(text)):
        return "hold"
    if UP_RE.search(text):
        return "up"
    if DOWN_RE.search(text):
        return "down"
    return "none"


def headline_polarity(headline: str, market: Market) -> float:
    """Sign of the news for THIS contract. Rate-style contracts compare directions; otherwise generic good/bad words."""
    title = f"{market.event_title} {market.subtitle or ''} {market.title}"
    h, t = _direction(headline), _direction(title)
    if h != "none" and t != "none":
        return 0.6 if h == t else -0.6
    pos, neg = len(POS_RE.findall(headline)), len(NEG_RE.findall(headline))
    if pos == neg:
        return 0.0
    return 0.6 if pos > neg else -0.6


def heuristic_reactions(headline: str, market: Market, personas: list[Persona]) -> list[Reaction]:
    """Offline fallback: keyword polarity scaled by each persona's information speed and risk appetite."""
    polarity = headline_polarity(headline, market)
    out: list[Reaction] = []
    for p in personas:
        conf = 0.45 + 0.5 * p.info_speed
        delay = int(5 + (1 - p.info_speed) * 400)
        out.append(Reaction(persona_id=p.id, belief_shift=round(polarity * (0.6 + 0.4 * p.info_speed), 3), confidence=round(conf, 2), delay_minutes=delay, reason="Keyword read of the headline; no language model was consulted."))
    return out


async def llm_reactions(headline: str, market: Market, personas: list[Persona]) -> list[Reaction]:
    from app.clients import llm
    from app.models.sim import ReactionSet

    system = (
        "You simulate how different groups of ordinary people and professionals react to a news headline about a prediction-market contract. "
        "For each persona, estimate how much the headline changes their belief that the contract resolves YES (belief_shift in -1..1), their confidence, "
        "how many minutes until that group typically acts, and a one-line first-person-plural reason. Be realistic about information speed and media habits."
    )
    roster = "\n".join(f"- {p.id}: {p.job}; age {p.age_band}; income {p.income_band}; leans {p.lean}; media: {p.media_diet}" for p in personas)
    user = f"Contract: {market.title}\nEvent: {market.event_title}\nResolution rules: {market.rules_text[:600]}\nCurrent YES price: {market.yes_price:.2f}\n\nHeadline: {headline}\n\nPersonas:\n{roster}\n\nReturn one reaction per persona id."
    rs = await llm.structured(system, user, ReactionSet, tag=f"swarm:{_headline_key(headline)}", max_tokens=2500)
    by = {r.persona_id: r for r in rs.reactions}
    out = [by[p.id] for p in personas if p.id in by]
    if len(out) >= len(personas) * 0.8:
        REACTIONS_DIR.mkdir(parents=True, exist_ok=True)
        (REACTIONS_DIR / f"{_headline_key(headline)}.json").write_text(json.dumps({"source": "llm", "headline": headline, "marketId": market.id, "reactions": [r.model_dump(mode="json", by_alias=True) for r in out]}, indent=1))
    return out


async def get_reactions(headline: str, market: Market, personas: list[Persona]) -> tuple[list[Reaction], str]:
    found = authored_reactions(headline)
    if found:
        return found
    try:
        return await llm_reactions(headline, market, personas), "llm"
    except Exception as e:  # LLMUnavailable or provider error: degrade honestly
        log.info("llm reactions unavailable (%s); using heuristic", e)
        return heuristic_reactions(headline, market, personas), "heuristic"


# ---------- sampling ----------

@dataclass
class Agent:
    i: int
    persona: Persona
    belief: float
    post_belief: float
    delay_s: int
    bankroll: float
    threshold: float
    aggression: float
    spent: float = 0.0
    seen: bool = False
    stance: str = "-"
    last_trade_t: int = -10**9
    noise_bias: float = 0.0


def cluster_weights(personas: list[Persona], cfg: SwarmConfig) -> list[float]:
    def aff(x: float, target: float, width: float = 0.45) -> float:
        return math.exp(-((x - target) ** 2) / (2 * width**2))

    w = []
    for p in personas:
        s = aff(AGE_POS[p.age_band], cfg.age_mix) * aff(INCOME_POS[p.income_band], cfg.income) * aff(LEAN_POS[p.lean], cfg.lean) * aff(p.risk_appetite, cfg.risk, 0.6)
        w.append(max(s, 1e-4))
    return w


def sample_agents(personas: list[Persona], reactions: dict[str, Reaction], cfg: SwarmConfig, *, p0: float, rng: random.Random) -> list[Agent]:
    weights = cluster_weights(personas, cfg)
    speed_mult = 2.2 - 2.0 * cfg.info_speed  # 0 -> 2.2x slower, 1 -> 0.2x (near instant)
    agents: list[Agent] = []
    for i in range(cfg.size):
        p = rng.choices(personas, weights=weights, k=1)[0]
        r = reactions.get(p.id)
        prior = min(0.98, max(0.02, p0 + rng.gauss(0, 0.04)))
        shift = (r.belief_shift if r else 0.0) * (r.confidence if r else 0.0)
        # A shift is a fraction of the remaining distance to certainty, so +0.9 at a 0.9 prior lands near 0.99.
        moved = prior + shift * ((1 - prior) if shift > 0 else prior)
        post = min(0.995, max(0.005, moved + rng.gauss(0, 0.02)))
        base_delay = (r.delay_minutes if r else 120) * 60
        delay = int(max(0, base_delay * speed_mult * rng.lognormvariate(0, 0.5)))
        bankroll = max(5.0, p.bankroll * rng.lognormvariate(0, 0.6) * (0.5 + cfg.risk))
        threshold = 0.03 + (1 - p.risk_appetite) * 0.12 * (1.3 - cfg.risk)
        aggression = 0.15 + 0.55 * p.risk_appetite * (0.5 + cfg.risk)
        agents.append(Agent(i=i, persona=p, belief=prior, post_belief=post, delay_s=delay, bankroll=bankroll, threshold=threshold, aggression=aggression, noise_bias=rng.gauss(0, 0.01)))
    return agents


# ---------- simulation ----------

def auto_liquidity(market: Market, points: list[PricePoint] | None) -> float:
    vol = sum((p.volume or 0.0) for p in (points or [])) if points else market.volume_24h
    return float(max(300.0, min(50_000.0, vol / 25.0 if vol else 2000.0)))


def run(req: SimRequest, market: Market, personas: list[Persona], reactions: list[Reaction], source: str, *, p0: float, real: list[PricePoint] | None, headline_at: int) -> SimRun:
    rng = random.Random(req.seed)
    cfg = req.swarm
    rmap = {r.persona_id: r for r in reactions}
    agents = sample_agents(personas, rmap, cfg, p0=p0, rng=rng)
    b = cfg.liquidity or auto_liquidity(market, real)
    mm = LMSR.at_price(p0, b)
    start = headline_at - req.pre_minutes * 60
    end = headline_at + req.post_minutes * 60
    step = req.tick_minutes * 60
    real_by_t: dict[int, float] = {}
    if real:
        rs = sorted(real, key=lambda p: p.ts)
        j = 0
        last = rs[0].price
        for t in range(start, end + 1, step):
            while j < len(rs) and rs[j].ts <= t:
                last = rs[j].price
                j += 1
            real_by_t[t] = last
    ticks: list[Tick] = []
    cooldown = max(step * 3, 600)
    for t in range(start, end + 1, step):
        price = mm.price()
        seen = yes = no = 0
        vol_tick = 0.0
        for a in agents:
            if not a.seen and t >= headline_at + a.delay_s:
                a.seen = True
                a.belief = a.post_belief
            if a.seen:
                seen += 1
            edge = a.belief + a.noise_bias - price
            can_trade = (t - a.last_trade_t) >= cooldown and a.spent < a.bankroll
            if can_trade and abs(edge) > a.threshold and (a.seen or rng.random() < 0.0015):
                side = "yes" if edge > 0 else "no"
                size = min(a.bankroll - a.spent, a.bankroll * a.aggression * min(1.0, abs(edge) / 0.25))
                if not a.seen:
                    size *= 0.3  # idle-hours noise trading is small
                if size >= 1.0:
                    mm.buy(side, size)
                    a.spent += size
                    a.last_trade_t = t
                    a.stance = "y" if side == "yes" else "n"
                    vol_tick += size
                    price = mm.price()
            if a.stance == "y":
                yes += 1
            elif a.stance == "n":
                no += 1
        ticks.append(Tick(t=t, price=min(0.9999, max(0.0001, round(price, 4))), real=real_by_t.get(t), seen=seen, yes=yes, no=no, volume=round(vol_tick, 2), stances="".join(a.stance for a in agents)))
    mae = mae_post = None
    if real_by_t:
        errs = [abs(tk.price - tk.real) for tk in ticks if tk.real is not None]
        post = [abs(tk.price - tk.real) for tk in ticks if tk.real is not None and tk.t >= headline_at]
        mae = round(100 * sum(errs) / len(errs), 2) if errs else None
        mae_post = round(100 * sum(post) / len(post), 2) if post else None
    run_id = hashlib.sha1(json.dumps(req.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()[:12]
    return SimRun(
        id=run_id, seed=req.seed, market_id=market.id, headline=req.headline, headline_at=headline_at, config=cfg, liquidity=round(b, 1), reactions_source=source,  # type: ignore[arg-type]
        personas=personas, reactions=reactions,
        agents=[AgentState(i=a.i, persona_id=a.persona.id, belief=round(a.belief, 3), stance="yes" if a.stance == "y" else "no" if a.stance == "n" else "flat", seen=a.seen, bankroll=round(a.bankroll, 2), spent=round(a.spent, 2)) for a in agents],
        ticks=ticks, mae_cents=mae, mae_post_cents=mae_post, real_points=len(real or []), meta={"p0": p0, "start": start, "end": end, "step": step},
    )


def calibrate_liquidity(req: SimRequest, market: Market, personas: list[Persona], reactions: list[Reaction], source: str, *, p0: float, real: list[PricePoint], headline_at: int) -> SimRun:
    """Try a small grid of liquidity values and keep the run with the lowest post-headline error. Reported in meta."""
    base = auto_liquidity(market, real)
    best: SimRun | None = None
    tried: list[tuple[float, float | None]] = []
    for mult in (0.35, 0.7, 1.0, 1.6, 2.5):
        r = req.model_copy(deep=True)
        r.swarm.liquidity = base * mult
        out = run(r, market, personas, reactions, source, p0=p0, real=real, headline_at=headline_at)
        tried.append((round(base * mult, 1), out.mae_post_cents))
        if best is None or (out.mae_post_cents or 1e9) < (best.mae_post_cents or 1e9):
            best = out
    assert best
    best.meta["calibration"] = tried
    return best
