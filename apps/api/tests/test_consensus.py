from app.engines.consensus import consensus, kelly_lite
from app.models.desk import DeskTake


def take(persona, stance, conf, rev=None):
    return DeskTake(persona=persona, stance=stance, confidence=conf, argument="a", key_risk="r", revised_confidence=rev)


def test_kelly_lite_is_zero_without_edge_and_capped():
    assert kelly_lite(0.5, 0.5) == 0.0
    assert kelly_lite(0.3, 0.5) == 0.0
    assert 0 < kelly_lite(0.7, 0.5) <= 0.5
    assert kelly_lite(0.99, 0.01) >= 0.49


def test_high_anomaly_vetoes():
    c = consensus([take("quant", "yes", 0.9), take("contrarian", "yes", 0.8), take("riskmgr", "yes", 0.7)], price=0.5, anomaly_score=85)
    assert c.vetoed and c.decision == "pass" and c.kelly_fraction == 0


def test_confident_risk_manager_pass_vetoes():
    c = consensus([take("quant", "yes", 0.9), take("contrarian", "yes", 0.8), take("riskmgr", "pass", 0.8)], price=0.5, anomaly_score=0)
    assert c.vetoed and c.decision == "pass"


def test_agreement_stakes_a_fraction_and_uses_revised_confidence():
    c = consensus([take("quant", "yes", 0.9), take("contrarian", "no", 0.9, rev=0.2), take("riskmgr", "yes", 0.6)], price=0.6, anomaly_score=10)
    assert c.decision == "yes" and 0 < c.kelly_fraction <= 0.5 and c.belief > 0.6 and c.weighted_no == 0.2
    assert "%" in c.summary and "$" not in c.summary


def test_split_desk_passes():
    c = consensus([take("quant", "yes", 0.7), take("contrarian", "no", 0.7), take("riskmgr", "pass", 0.5)], price=0.5, anomaly_score=0)
    assert c.decision == "pass" and not c.vetoed


def test_risk_appetite_changes_cap_and_veto():
    agree = [take("quant", "yes", 0.9), take("contrarian", "yes", 0.8), take("riskmgr", "yes", 0.8)]
    low = consensus(agree, price=0.3, anomaly_score=10, risk="conservative")
    high = consensus(agree, price=0.3, anomaly_score=10, risk="aggressive")
    assert 0 < low.kelly_fraction <= 0.05 < high.kelly_fraction <= 0.5
    assert consensus(agree, price=0.3, anomaly_score=45, risk="conservative").vetoed
    assert not consensus(agree, price=0.3, anomaly_score=45, risk="moderately_aggressive").vetoed
    assert "moderately aggressive investor" in consensus(agree, price=0.3, anomaly_score=10, risk="moderately_aggressive").summary


def test_summary_answers_the_side_the_reader_asked_about():
    c = consensus([take("quant", "no", 0.9), take("contrarian", "no", 0.8), take("riskmgr", "no", 0.7)], price=0.6, anomaly_score=0, side_interest="yes")
    assert c.decision == "no" and c.summary.startswith("You asked about YES")


def test_a_stance_changed_in_round_two_counts():
    t = [take("quant", "yes", 0.9), take("contrarian", "no", 0.8), take("riskmgr", "yes", 0.6)]
    t[1].revised_stance, t[1].revised_confidence = "yes", 0.6  # the Contrarian is persuaded
    c = consensus(t, price=0.5, anomaly_score=0)
    assert c.decision == "yes" and c.weighted_no == 0 and c.weighted_yes == 2.1
