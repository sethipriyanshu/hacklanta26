import random

from app.engines.swarm import cluster_weights, heuristic_reactions, load_personas, run, sample_agents
from app.models import Market, PricePoint
from app.models.sim import SimRequest, SwarmConfig


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
    up = heuristic_reactions("FOMC raises the target range by 25 basis points", mk(), ps)
    assert all(r.belief_shift > 0 for r in up)
    cut_market = mk().model_copy(update={"title": "Will the Fed decrease rates by 25 bps?", "subtitle": "25 bps decrease"})
    down = heuristic_reactions("FOMC raises the target range by 25 basis points", cut_market, ps)
    assert all(r.belief_shift < 0 for r in down)
    hold_market = mk().model_copy(update={"title": "Will there be no change in Fed interest rates?", "subtitle": "No change"})
    assert all(r.belief_shift > 0 for r in heuristic_reactions("Fed holds rates steady, cites sticky inflation", hold_market, ps))
    assert all(r.belief_shift < 0 for r in heuristic_reactions("Fed holds rates steady", mk(), ps))
    assert all(r.belief_shift < 0 for r in heuristic_reactions("Court rejects the appeal", mk().model_copy(update={"title": "Will the appeal succeed?"}), ps))


def test_run_is_deterministic_and_moves_toward_news():
    ps = load_personas()
    m = mk()
    rx = heuristic_reactions("FOMC raises the target range by 25 basis points", m, ps)
    req = SimRequest(market_id=m.id, headline="FOMC raises the target range by 25 basis points", swarm=SwarmConfig(size=300, liquidity=800), seed=7, pre_minutes=60, post_minutes=180, tick_minutes=5)
    a = run(req, m, ps, rx, "heuristic", p0=0.85, real=None, headline_at=1_000_000)
    b = run(req, m, ps, rx, "heuristic", p0=0.85, real=None, headline_at=1_000_000)
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
    out = run(req, m, ps, rx, "heuristic", p0=0.85, real=real, headline_at=1_000_000)
    assert out.mae_cents is not None and 0 <= out.mae_cents <= 100 and out.real_points == 240


def test_sampler_speed_slider_shortens_delays():
    ps = load_personas()
    rx = {r.persona_id: r for r in heuristic_reactions("raises", mk(), ps)}
    slow = sample_agents(ps, rx, SwarmConfig(info_speed=0.0, size=400), p0=0.5, rng=random.Random(1))
    fast = sample_agents(ps, rx, SwarmConfig(info_speed=1.0, size=400), p0=0.5, rng=random.Random(1))
    assert sum(a.delay_s for a in fast) < 0.3 * sum(a.delay_s for a in slow)
