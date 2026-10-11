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

def _reaction_key(headline: str, market: Market) -> str:
    """Reactions belong to a headline AND a contract: the same news is good for one side and bad for the other."""
    return hashlib.sha1(f"{market.id}|{headline.strip().lower()}".encode()).hexdigest()[:12]


@dataclass
class Reactions:
    items: list[Reaction]
    source: str
    fair: float | None = None
    fair_reason: str | None = None


def saved_reactions(headline: str, market: Market) -> Reactions | None:
    """A reaction set generated earlier for this exact market and headline."""
    p = REACTIONS_DIR / f"{_reaction_key(headline, market)}.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    try:
        return Reactions([Reaction.model_validate(r) for r in data["reactions"]], data.get("source", "llm"), data.get("fairProbability"), data.get("fairReason"))
    except Exception:  # noqa: BLE001 — an old-format file is ignored and regenerated
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


def heuristic_reactions(headline: str, market: Market, personas: list[Persona]) -> Reactions:
    """Offline fallback: keyword polarity moves a fair probability 60% of the way toward certainty; each persona
    gets there in proportion to its information speed."""
    polarity = headline_polarity(headline, market)
    p0 = market.yes_price
    fair = p0 + polarity * ((1 - p0) if polarity > 0 else p0)
    out: list[Reaction] = []
    for p in personas:
        prob = fair  # everyone who has heard lands on the fair value; delay alone makes slow groups slow
        out.append(Reaction(persona_id=p.id, probability=round(min(0.99, max(0.01, prob)), 3), confidence=round(0.45 + 0.5 * p.info_speed, 2), delay_minutes=int(5 + (1 - p.info_speed) * 400), reason="Keyword read of the headline; no language model was consulted."))
    return Reactions(out, "heuristic", round(fair, 3), "Keyword read of the headline; no language model was consulted.")


def informed_estimate(p0: float, direction: str, move_points: float) -> float:
    """The post-news probability, computed from the model's direction and size, so the number always agrees with the reasoning."""
    if direction == "none":
        return p0
    move = max(0.0, min(60.0, abs(move_points))) / 100
    return round(min(0.99, max(0.01, p0 + move if direction == "up" else p0 - move)), 4)


async def llm_reactions(headline: str, market: Market, personas: list[Persona]) -> Reactions:
    from app.clients import llm
    from app.models.sim import ReactionSet

    system = (
        "You model how a prediction market reprices after a headline. Work in this order. "
        "1) analysis: in 2-3 sentences, say who the news helps or hurts, stated strictly in terms of the YES outcome of THIS contract "
        "(read 'YES means' carefully; for a team's 'wins' contract, news good for the opponent is bad for YES). "
        "If the headline names a person, place or thing, first establish which side it belongs to (which team a player plays for, whose home "
        "city a venue is). If you cannot tell which side the news affects, set direction to 'none' rather than guess. "
        "2) direction: 'up' if YES is now more likely, 'down' if less likely, 'none' if the news does not matter. It must match your analysis. "
        "3) move_points: how many percentage points a sharp, unbiased analyst would move the probability of YES, as a positive number. Be decisive: "
        "news that materially changes the outcome moves it a lot; trivia moves it little. "
        "4) For each persona: bias_points, how far that group's view sits from the informed estimate after absorbing the news, from genuine bias only "
        "(team loyalty, partisanship, wishful thinking), between -8 and +8. Slowness is modelled separately by delay_minutes, so do not encode it as bias. "
        "Also give confidence, delay_minutes and a one-line first-person-plural reason."
    )
    roster = "\n".join(f"- {p.id}: {p.job}; age {p.age_band}; income {p.income_band}; leans {p.lean}; media: {p.media_diet}" for p in personas)
    yes_means = market.title if market.title != market.event_title else (market.subtitle or market.title)
    user = (
        f"Contract: {market.title}\nEvent: {market.event_title}\nYES means: {yes_means}\nResolution rules: {market.rules_text[:600]}\n"
        f"Current YES price (the market's probability before the news): {market.yes_price:.2f}\n\nHeadline: {headline}\n\nPersonas:\n{roster}\n\n"
        "Return the analysis, direction, move_points, reason, and one reaction per persona id."
    )
    key = _reaction_key(headline, market)
    rs = await llm.structured(system, user, ReactionSet, tag=f"swarm-v3:{key}", max_tokens=2800)
    fair = informed_estimate(market.yes_price, rs.direction, rs.move_points)
    by = {r.persona_id: r for r in rs.reactions}
    out = [
        Reaction(persona_id=p.id, probability=round(min(0.99, max(0.01, fair + max(-8.0, min(8.0, by[p.id].bias_points)) / 100)), 4),
                 confidence=by[p.id].confidence, delay_minutes=by[p.id].delay_minutes, reason=by[p.id].reason)
        for p in personas if p.id in by
    ]
    if len(out) >= len(personas) * 0.8:
        REACTIONS_DIR.mkdir(parents=True, exist_ok=True)
        (REACTIONS_DIR / f"{key}.json").write_text(json.dumps({"source": "llm", "headline": headline, "marketId": market.id, "fairProbability": fair, "fairReason": rs.reason, "analysis": rs.analysis, "direction": rs.direction, "movePoints": rs.move_points, "reactions": [r.model_dump(mode="json", by_alias=True) for r in out]}, indent=1))
    return Reactions(out, "llm", fair, rs.reason)


def mirror(rx: Reactions, p0_from: float, p0_to: float) -> Reactions:
    """The complement of a two-outcome event: the same news, the same size of move, the opposite direction.
    Deriving one side from the other guarantees the two contracts never move the same way on one headline."""
    move = (rx.fair - p0_from) if rx.fair is not None else 0.0
    fair = round(min(0.99, max(0.01, p0_to - move)), 4)
    items = [
        Reaction(persona_id=r.persona_id, probability=round(min(0.99, max(0.01, fair - (r.probability - (rx.fair if rx.fair is not None else p0_from)))), 4),
                 confidence=r.confidence, delay_minutes=r.delay_minutes, reason=r.reason)
        for r in rx.items
    ]
    return Reactions(items, rx.source, fair, rx.fair_reason)


async def get_reactions(headline: str, market: Market, personas: list[Persona], *, complement: Market | None = None) -> Reactions:
    """Reactions for `market`. When it is one side of a two-outcome event, both sides are derived from one analysis
    of a canonical side (the lower id), so the pair always moves in opposite directions."""
    if complement is not None and complement.id < market.id:
        base = await get_reactions(headline, complement, personas)
        return mirror(base, complement.yes_price, market.yes_price)
    found = saved_reactions(headline, market)
    if found:
        return found
    try:
        return await llm_reactions(headline, market, personas)
    except Exception as e:  # LLMUnavailable or provider error: degrade honestly
        log.info("llm reactions unavailable (%s); using heuristic", e)
        return heuristic_reactions(headline, market, personas)


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


# Once a group has heard the news its view sits near the informed fair value; only a real bias (team loyalty,
# partisanship) may pull it away, and by no more than this. Slowness is modelled once, as delay, never as a stale belief.
MAX_BIAS = 0.08


def sample_agents(personas: list[Persona], reactions: dict[str, Reaction], cfg: SwarmConfig, *, p0: float, rng: random.Random, fair: float | None = None) -> list[Agent]:
    weights = cluster_weights(personas, cfg)
    speed_mult = 2.2 - 2.0 * cfg.info_speed  # 0 -> 2.2x slower, 1 -> 0.2x (near instant)
    agents: list[Agent] = []
    for i in range(cfg.size):
        p = rng.choices(personas, weights=weights, k=1)[0]
        r = reactions.get(p.id)
        quirk = rng.gauss(0, 0.04)  # each agent's own lean, kept before and after the news
        prior = min(0.98, max(0.02, p0 + quirk))
        # After the news an agent adopts its group's probability (plus half its own lean). Confidence sets bet size
        # below, never how far the belief moves: a confident group that expects 15% believes 15%.
        if r and fair is not None:
            target = fair + max(-MAX_BIAS, min(MAX_BIAS, r.probability - fair))
        else:
            target = r.probability if r else p0
        post = min(0.99, max(0.01, target + 0.5 * quirk + rng.gauss(0, 0.02)))
        base_delay = (r.delay_minutes if r else 120) * 60
        delay = int(max(0, base_delay * speed_mult * rng.lognormvariate(0, 0.5)))
        bankroll = max(5.0, p.bankroll * rng.lognormvariate(0, 0.6) * (0.5 + cfg.risk))
        threshold = 0.03 + (1 - p.risk_appetite) * 0.12 * (1.3 - cfg.risk)
        aggression = (0.15 + 0.55 * p.risk_appetite * (0.5 + cfg.risk)) * (0.5 + 0.5 * (r.confidence if r else 0.5))
        agents.append(Agent(i=i, persona=p, belief=prior, post_belief=post, delay_s=delay, bankroll=bankroll, threshold=threshold, aggression=aggression, noise_bias=rng.gauss(0, 0.01)))
    return agents


# ---------- simulation ----------

def auto_liquidity(market: Market, points: list[PricePoint] | None) -> float:
    vol = sum((p.volume or 0.0) for p in (points or [])) if points else market.volume_24h
    return float(max(300.0, min(50_000.0, vol / 25.0 if vol else 2000.0)))


def run(req: SimRequest, market: Market, personas: list[Persona], rx: Reactions, *, p0: float, real: list[PricePoint] | None, headline_at: int) -> SimRun:
    reactions, source = rx.items, rx.source
    rng = random.Random(req.seed)
    cfg = req.swarm
    rmap = {r.persona_id: r for r in reactions}
    agents = sample_agents(personas, rmap, cfg, p0=p0, rng=rng, fair=rx.fair)
    priors = {a.i: a.belief for a in agents}
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
            # Nobody knows anything before the headline, so nobody trades on it: the line stays flat until the news lands.
            if can_trade and a.seen and abs(edge) > a.threshold:
                side = "yes" if edge > 0 else "no"
                size = min(a.bankroll - a.spent, a.bankroll * a.aggression * min(1.0, abs(edge) / 0.25))
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
        personas=personas, reactions=reactions, fair_probability=rx.fair, fair_reason=rx.fair_reason,
        agents=[AgentState(i=a.i, persona_id=a.persona.id, belief=round(a.post_belief if a.seen else a.belief, 3), prior=round(priors[a.i], 3), seen_at=(headline_at + a.delay_s) if a.seen else None, stance="yes" if a.stance == "y" else "no" if a.stance == "n" else "flat", seen=a.seen, bankroll=round(a.bankroll, 2), spent=round(a.spent, 2)) for a in agents],
        ticks=ticks, mae_cents=mae, mae_post_cents=mae_post, real_points=len(real or []), meta={"p0": p0, "start": start, "end": end, "step": step},
    )


def calibrate_liquidity(req: SimRequest, market: Market, personas: list[Persona], rx: Reactions, *, p0: float, real: list[PricePoint], headline_at: int) -> SimRun:
    """Try a small grid of liquidity values and keep the run with the lowest post-headline error. Reported in meta."""
    base = auto_liquidity(market, real)
    best: SimRun | None = None
    tried: list[tuple[float, float | None]] = []
    for mult in (0.35, 0.7, 1.0, 1.6, 2.5):
        r = req.model_copy(deep=True)
        r.swarm.liquidity = base * mult
        out = run(r, market, personas, rx, p0=p0, real=real, headline_at=headline_at)
        tried.append((round(base * mult, 1), out.mae_post_cents))
        if best is None or (out.mae_post_cents or 1e9) < (best.mae_post_cents or 1e9):
            best = out
    assert best
    best.meta["calibration"] = tried
    return best
