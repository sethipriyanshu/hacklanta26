from app.engines.consensus import consensus, kelly_lite, risk_budget
from app.models.desk import DeskTake, Profile


def prof(disc, tol=1.0):
    return Profile(id="p", name="P", tier="t", monthly_income=1, fixed_costs=1, discretionary=disc, risk_tolerance=tol)


def take(persona, stance, conf, rev=None):
    return DeskTake(persona=persona, stance=stance, confidence=conf, argument="a", key_risk="r", revised_confidence=rev)


def test_risk_budget_scales_and_floors():
    assert risk_budget(prof(2600, 1.0)) == 130.0
    assert risk_budget(prof(2600, 1.5)) == 195.0
    assert risk_budget(prof(2600, 0.1)) == 65.0  # tolerance clipped to 0.5x
    assert risk_budget(prof(-200, 1.5)) == 0.0


def test_kelly_lite_is_zero_without_edge_and_capped():
    assert kelly_lite(0.5, 0.5) == 0.0
    assert kelly_lite(0.3, 0.5) == 0.0
    assert 0 < kelly_lite(0.7, 0.5) <= 0.5
    assert kelly_lite(0.99, 0.01) >= 0.49


def test_zero_budget_vetoes():
    c = consensus([take("quant", "yes", 0.9), take("contrarian", "yes", 0.8), take("riskmgr", "yes", 0.7)], price=0.5, budget=0, anomaly_score=0)
    assert c.decision == "pass" and c.vetoed and "$0" in (c.veto_reason or "")


def test_high_anomaly_vetoes():
    c = consensus([take("quant", "yes", 0.9), take("contrarian", "yes", 0.8), take("riskmgr", "yes", 0.7)], price=0.5, budget=100, anomaly_score=85)
    assert c.vetoed and c.size_usd == 0


def test_agreement_sizes_within_budget_and_uses_revised_confidence():
    c = consensus([take("quant", "yes", 0.9), take("contrarian", "no", 0.9, rev=0.2), take("riskmgr", "yes", 0.6)], price=0.6, budget=130, anomaly_score=10)
    assert c.decision == "yes" and 0 < c.size_usd <= 130 and c.weighted_no == 0.2


def test_split_desk_passes():
    c = consensus([take("quant", "yes", 0.7), take("contrarian", "no", 0.7), take("riskmgr", "pass", 0.5)], price=0.5, budget=100, anomaly_score=0)
    assert c.decision == "pass" and not c.vetoed
