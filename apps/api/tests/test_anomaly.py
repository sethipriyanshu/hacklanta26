import math
from datetime import datetime, timezone

from app.engines.anomaly import anomaly_score, resample_hourly
from app.models import Headline, PricePoint

H = 3600


def series(hours: int, *, price=0.5, vol=10.0, spike_at: int | None = None, spike_vol=200.0, spike_move=0.3):
    pts = []
    p = price
    for i in range(hours):
        v = vol
        if spike_at is not None and i == spike_at:
            v = spike_vol
            p = p + spike_move
        pts.append(PricePoint(market_id="m", ts=i * H, price=p, volume=v))
    return pts


def test_flat_market_scores_near_zero():
    r = anomaly_score(series(100))
    assert r.score < 5 and r.sub_scores["zVol"] == 0.0 and r.sub_scores["zMove"] == 0.0


def test_spike_in_last_hour_scores_high():
    r = anomaly_score(series(100, spike_at=99))
    assert r.score > 80
    assert r.sub_scores["zVol"] == 1.0 and r.sub_scores["zMove"] == 1.0
    assert "Volume in the last hour" in r.explanation


def test_weights_renormalize_without_wallet_or_news():
    r = anomaly_score(series(100, spike_at=99))
    assert set(r.weights) == {"zVol", "zMove"}
    assert math.isclose(sum(r.weights.values()), 1.0, abs_tol=0.01)


def test_wallet_share_raises_score():
    with_w = anomaly_score(series(100, spike_at=99), wallet_fresh_share=0.9).score
    assert with_w > 90  # wallet term adds evidence on top of the spike
    low = anomaly_score(series(100), wallet_fresh_share=0.9)
    assert 10 < low.score < 40  # wallets alone cannot max the score


def test_move_before_news_vs_after_news():
    pts = series(100, spike_at=90)
    after = [Headline(id="h", title="x", source="s", url="u", published_at=datetime.fromtimestamp(96 * H, timezone.utc))]
    before = [Headline(id="h", title="x", source="s", url="u", published_at=datetime.fromtimestamp(89 * H, timezone.utc))]
    pre = anomaly_score(pts, headlines=after)
    post = anomaly_score(pts, headlines=before)
    assert pre.sub_scores["tNews"] > 0.5 and post.sub_scores["tNews"] == 0.0
    assert "before the first matching headline" in pre.explanation


def test_until_truncates_history():
    pts = series(100, spike_at=99)
    assert anomaly_score(pts, until=98 * H).score < 5


def test_resample_minute_points_to_hourly():
    pts = [PricePoint(market_id="m", ts=i * 60, price=0.5 + i * 0.001, volume=1.0) for i in range(180)]
    bars = resample_hourly(pts)
    assert len(bars) == 3 and bars[0].volume == 60 and bars[-1].close == pts[-1].price
