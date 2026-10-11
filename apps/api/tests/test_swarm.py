import random

from app.engines.swarm import Reactions, cluster_weights, heuristic_reactions, load_personas, run, sample_agents
from app.models import Market, PricePoint
from app.models.sim import Reaction, SimRequest, SwarmConfig


def mk():
    return Market(id="poly:x", venue="polymarket", ticker="x", title="Will the Fed increase rates by 25 bps?", event_id="e", event_title="Fed decision", category="Economics", yes_price=0.85, url="u", volume_24h=50000)


def test_personas_load_and_weights_follow_sliders():
    ps = load_personas()
    assert len(ps) == 20
    young = cluster_weights(ps, SwarmConfig(age_mix=0.0))
    old = cluster_weights(ps, SwarmConfig(age_mix=1.0))
    i_student = next(i for i, p in enumerate(ps) if p.id == "college-student")
    i_retired = next(i for i, p in enumerate(ps) if p.id == "retired-teacher")
    assert young[i_student] > young[i_retired] and old[i_retired] > old[i_student]


def test_heuristic_polarity_respects_contract_direction():
    ps = load_personas()
    p0 = mk().yes_price
    up = heuristic_reactions("FOMC raises the target range by 25 basis points", mk(), ps)
    assert all(r.probability > p0 for r in up.items) and up.fair > p0
    cut_market = mk().model_copy(update={"title": "Will the Fed decrease rates by 25 bps?", "subtitle": "25 bps decrease"})
    down = heuristic_reactions("FOMC raises the target range by 25 basis points", cut_market, ps)
    assert all(r.probability < p0 for r in down.items)
    hold_market = mk().model_copy(update={"title": "Will there be no change in Fed interest rates?", "subtitle": "No change"})
    assert all(r.probability > p0 for r in heuristic_reactions("Fed holds rates steady, cites sticky inflation", hold_market, ps).items)
    assert all(r.probability < p0 for r in heuristic_reactions("Fed holds rates steady", mk(), ps).items)
    assert all(r.probability < p0 for r in heuristic_reactions("Court rejects the appeal", mk().model_copy(update={"title": "Will the appeal succeed?"}), ps).items)


def test_decisive_news_moves_the_price_to_the_new_fair_value():
    """Both of a team's quarterbacks ruled out: a 55% favourite should end far below 50%, not 'almost even'."""
    ps = load_personas()
    m = mk().model_copy(update={"title": "Alabama wins", "yes_price": 0.55})
    rx = Reactions([Reaction(persona_id=p.id, probability=0.18 if p.info_speed > 0.5 else 0.3, confidence=0.8, delay_minutes=10, reason="r") for p in ps], "llm", 0.18, "r")
    req = SimRequest(market_id=m.id, headline="Both Alabama quarterbacks ruled out", swarm=SwarmConfig(size=600), seed=3, pre_minutes=60, post_minutes=240, tick_minutes=5)
    out = run(req, m, ps, rx, p0=0.55, real=None, headline_at=1_000_000)
    assert out.ticks[-1].price < 0.32 and out.fair_probability == 0.18


def test_run_is_deterministic_and_moves_toward_news():
    ps = load_personas()
    m = mk()
    rx = heuristic_reactions("FOMC raises the target range by 25 basis points", m, ps)
    req = SimRequest(market_id=m.id, headline="FOMC raises the target range by 25 basis points", swarm=SwarmConfig(size=300, liquidity=800), seed=7, pre_minutes=60, post_minutes=180, tick_minutes=5)
    a = run(req, m, ps, rx, p0=0.85, real=None, headline_at=1_000_000)
    b = run(req, m, ps, rx, p0=0.85, real=None, headline_at=1_000_000)
    assert [t.price for t in a.ticks] == [t.price for t in b.ticks]
    assert a.ticks[-1].price > a.ticks[0].price + 0.03
    assert all(0 < t.price < 1 for t in a.ticks)
    assert len(a.ticks[0].stances) == 300


def test_backtest_reports_mae():
    ps = load_personas()
    m = mk()
    rx = heuristic_reactions("FOMC raises the target range by 25 basis points", m, ps)
    real = [PricePoint(market_id=m.id, ts=1_000_000 + i * 60 - 3600, price=0.85 if i < 60 else 0.99) for i in range(240)]
    req = SimRequest(market_id=m.id, headline="x raises", swarm=SwarmConfig(size=200, liquidity=500), seed=1, pre_minutes=60, post_minutes=180, tick_minutes=5)
    out = run(req, m, ps, rx, p0=0.85, real=real, headline_at=1_000_000)
    assert out.mae_cents is not None and 0 <= out.mae_cents <= 100 and out.real_points == 240


def test_sampler_speed_slider_shortens_delays():
    ps = load_personas()
    rx = {r.persona_id: r for r in heuristic_reactions("raises", mk(), ps).items}
    slow = sample_agents(ps, rx, SwarmConfig(info_speed=0.0, size=400), p0=0.5, rng=random.Random(1))
    fast = sample_agents(ps, rx, SwarmConfig(info_speed=1.0, size=400), p0=0.5, rng=random.Random(1))
    assert sum(a.delay_s for a in fast) < 0.3 * sum(a.delay_s for a in slow)


def test_heard_news_is_absorbed_and_slowness_is_delay_only():
    """A slow group that hears 'both QBs out' must not keep believing a coin flip: beliefs land within the bias band of fair."""
    from app.engines.swarm import MAX_BIAS
    ps = load_personas()
    rmap = {p.id: Reaction(persona_id=p.id, probability=0.5 if p.info_speed < 0.5 else 0.33, confidence=0.6, delay_minutes=30, reason="r") for p in ps}
    agents = sample_agents(ps, rmap, SwarmConfig(size=500), p0=0.55, rng=random.Random(2), fair=0.35)
    assert max(a.post_belief for a in agents) <= 0.35 + MAX_BIAS + 0.12  # band plus the agent's own small lean and noise
    assert sum(a.post_belief for a in agents) / len(agents) < 0.42


def test_informed_estimate_always_follows_the_stated_direction():
    from app.engines.swarm import informed_estimate
    assert informed_estimate(0.545, "down", 6) < 0.545  # "game moved to Athens" is bad for Alabama: never up
    assert informed_estimate(0.545, "down", -6) < 0.545  # a sign slip in the size cannot flip the direction
    assert informed_estimate(0.30, "up", 20) == 0.5
    assert informed_estimate(0.5, "none", 40) == 0.5
    assert informed_estimate(0.05, "down", 60) == 0.01 and informed_estimate(0.95, "up", 60) == 0.99


def test_price_is_flat_until_the_headline():
    ps = load_personas()
    m = mk()
    rx = heuristic_reactions("FOMC raises the target range by 25 basis points", m, ps)
    req = SimRequest(market_id=m.id, headline="FOMC raises", swarm=SwarmConfig(size=400), seed=5, pre_minutes=120, post_minutes=60, tick_minutes=5)
    out = run(req, m, ps, rx, p0=0.85, real=None, headline_at=1_000_000)
    assert {t.price for t in out.ticks if t.t < 1_000_000} == {0.85}


def test_mirror_moves_the_other_side_the_opposite_way():
    from app.engines.swarm import mirror
    ps = load_personas()
    base = Reactions([Reaction(persona_id=p.id, probability=0.49, confidence=0.7, delay_minutes=10, reason="r") for p in ps], "llm", 0.47, "r")
    other = mirror(base, p0_from=0.55, p0_to=0.46)
    assert other.fair == 0.54  # Alabama -8 points means Georgia +8 points
    assert all(abs(r.probability - 0.52) < 1e-9 for r in other.items)  # a +2 pro-Alabama bias is a -2 bias on Georgia
