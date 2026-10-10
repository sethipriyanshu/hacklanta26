"""Anomaly score, 0–100. A weighted sum of four normalized sub-scores, each clipped to 0–1:

    A = 100 * (0.35 z_vol + 0.30 z_move + 0.20 c_wallet + 0.15 t_news)

Sub-scores that cannot be computed are dropped and the remaining weights renormalized.
Output is labelled "anomaly", never "insider"."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

from app.models import Headline, PricePoint

HOUR = 3600
WEIGHTS = {"zVol": 0.35, "zMove": 0.30, "cWallet": 0.20, "tNews": 0.15}
Z_SATURATION = 4.0  # a 4-sigma event scores 1.0
MIN_BARS = 24  # at least a day of hourly history before scoring


@dataclass
class Hourly:
    ts: int
    close: float
    volume: float
    has_volume: bool = True


@dataclass
class AnomalyResult:
    score: float
    sub_scores: dict[str, float | None]
    weights: dict[str, float]
    explanation: str
    details: dict[str, object] = field(default_factory=dict)


def resample_hourly(points: list[PricePoint], *, until: int | None = None) -> list[Hourly]:
    """Bucket any-resolution points into hourly bars (close price, summed volume)."""
    buckets: dict[int, Hourly] = {}
    for p in sorted(points, key=lambda x: x.ts):
        if until is not None and p.ts > until:
            break
        b = (p.ts // HOUR) * HOUR
        h = buckets.get(b)
        if h is None:
            buckets[b] = Hourly(ts=b, close=p.price, volume=p.volume or 0.0, has_volume=p.volume is not None)
        else:
            h.close = p.price
            if p.volume is not None:
                h.volume += p.volume
                h.has_volume = True
    bars = [buckets[k] for k in sorted(buckets)]
    if until is None and bars and bars[-1].ts + HOUR > int(time.time()):
        bars = bars[:-1]  # drop the partial current hour; it would read as a volume collapse
    return bars


def _z(value: float, baseline: list[float], *, sd_floor: float) -> float | None:
    """One-sided z-score with a floor on the standard deviation so dead-flat histories cannot turn noise into 4-sigma."""
    if len(baseline) < 6:
        return None
    mean = sum(baseline) / len(baseline)
    var = sum((x - mean) ** 2 for x in baseline) / max(1, len(baseline) - 1)
    sd = max(math.sqrt(var), sd_floor)
    return max(0.0, (value - mean) / sd)


def _clip01(x: float | None) -> float | None:
    return None if x is None else max(0.0, min(1.0, x))


def volume_subscore(bars: list[Hourly]) -> tuple[float | None, dict[str, float]]:
    known = [b for b in bars if b.has_volume]
    if len(known) < MIN_BARS or not bars or not bars[-1].has_volume:
        return None, {}
    last, base = bars[-1], [b.volume for b in known[:-1]][-168:]
    mean = sum(base) / len(base) if base else 0.0
    z = _z(last.volume, base, sd_floor=max(0.5 * mean, 1.0))
    return _clip01(None if z is None else z / Z_SATURATION), {"lastHourVolume": round(last.volume, 2), "baselineHourlyVolume": round(mean, 2), "volumeZ": round(z, 2) if z is not None else float("nan"), "volumeMultiple": round(last.volume / mean, 1) if mean > 0 else 0.0}


def move_subscore(bars: list[Hourly]) -> tuple[float | None, dict[str, float]]:
    if len(bars) < MIN_BARS:
        return None, {}
    changes = [bars[i].close - bars[i - 1].close for i in range(1, len(bars))]
    last_move, base = changes[-1], [abs(c) for c in changes[:-1]][-168:]
    z = _z(abs(last_move), base, sd_floor=0.01)  # a one-cent floor: a 1-point move is never a 4-sigma event
    typical = sum(base) / len(base) if base else 0.0
    return _clip01(None if z is None else z / Z_SATURATION), {"lastHourMove": round(last_move, 4), "typicalHourlyMove": round(typical, 4), "moveZ": round(z, 2) if z is not None else float("nan")}


def news_subscore(bars: list[Hourly], headlines: list[Headline] | None, *, lookback_hours: int = 24) -> tuple[float | None, dict[str, object]]:
    """1 when the biggest recent move came before any matching headline, decaying with the gap; 0 when it followed news."""
    if not headlines or len(bars) < 3:
        return None, {}
    recent = bars[-lookback_hours:]
    moves = [(abs(recent[i].close - recent[i - 1].close), recent[i].ts) for i in range(1, len(recent))]
    if not moves:
        return None, {}
    _, move_ts = max(moves)
    times = sorted(int(h.published_at.timestamp()) for h in headlines)
    before = [t for t in times if move_ts - 6 * HOUR <= t <= move_ts]
    if before:
        return 0.0, {"moveAt": move_ts, "headlineBeforeMove": before[-1], "verdict": "move followed news"}
    after = [t for t in times if t > move_ts]
    if not after:
        return None, {"moveAt": move_ts, "verdict": "no matching headline"}
    gap_h = (after[0] - move_ts) / HOUR
    if gap_h > 48:
        return None, {"moveAt": move_ts, "verdict": "no headline within 48h"}
    t = max(0.0, 1.0 - gap_h / 36.0)
    return round(t, 3), {"moveAt": move_ts, "firstHeadlineAfter": after[0], "gapHours": round(gap_h, 1), "verdict": "move preceded news"}


def combine(subs: dict[str, float | None]) -> tuple[float, dict[str, float]]:
    active = {k: WEIGHTS[k] for k, v in subs.items() if v is not None}
    total = sum(active.values())
    if total == 0:
        return 0.0, {}
    weights = {k: round(w / total, 3) for k, w in active.items()}
    score = 100 * sum(weights[k] * (subs[k] or 0.0) for k in weights)
    return round(min(100.0, score), 1), weights


def explain(subs: dict[str, float | None], details: dict[str, object]) -> str:
    parts: list[str] = []
    if subs.get("zVol") is not None:
        mult = details.get("volumeMultiple", 0)
        base = float(details.get("baselineHourlyVolume", 0))
        if base <= 0 and float(details.get("lastHourVolume", 0)) > 0:
            parts.append(f"{float(details.get('lastHourVolume', 0)):,.0f} contracts traded in the last hour after days of near-zero activity.")
        elif (subs["zVol"] or 0) > 0.6:
            parts.append(f"Volume in the last hour ran {mult}× its trailing hourly average — far outside normal.")
        elif (subs["zVol"] or 0) > 0.2:
            parts.append(f"Volume in the last hour ran {mult}× its trailing hourly average, somewhat elevated.")
        else:
            parts.append(f"Volume in the last hour was {mult}× its trailing hourly average, nothing unusual.")
    if subs.get("zMove") is not None:
        mv = float(details.get("lastHourMove", 0)) * 100
        typ = float(details.get("typicalHourlyMove", 0)) * 100
        if (subs["zMove"] or 0) > 0.2:
            parts.append(f"Price moved {mv:+.1f} points in an hour, against a typical hourly move of {typ:.1f} points.")
        else:
            parts.append(f"Price moved {mv:+.1f} points in the hour, in line with its usual {typ:.1f}-point hourly swings.")
    if subs.get("cWallet") is not None:
        share = round((subs["cWallet"] or 0) * 100)
        parts.append(f"{share}% of recent YES buying came from wallets that were new or had fewer than 5 prior trades.")
    if subs.get("tNews") is not None:
        verdict = details.get("verdict")
        if verdict == "move preceded news":
            parts.append(f"The move began about {details.get('gapHours')} hours before the first matching headline.")
        elif verdict == "move followed news":
            parts.append("The move followed a matching headline, which explains it.")
    if not parts:
        return "Not enough history to score this market yet."
    return " ".join(parts)


def anomaly_score(points: list[PricePoint], *, until: int | None = None, wallet_fresh_share: float | None = None, headlines: list[Headline] | None = None) -> AnomalyResult:
    bars = resample_hourly(points, until=until)
    z_vol, d1 = volume_subscore(bars)
    z_move, d2 = move_subscore(bars)
    t_news, d3 = news_subscore(bars, headlines)
    subs: dict[str, float | None] = {"zVol": z_vol, "zMove": z_move, "cWallet": _clip01(wallet_fresh_share), "tNews": t_news}
    score, weights = combine(subs)
    details: dict[str, object] = {**d1, **d2, **d3, "bars": len(bars), "asOf": bars[-1].ts if bars else None}
    text = explain(subs, details)
    if bars and (bars[-1].close >= 0.97 or bars[-1].close <= 0.03) and (z_move or 0) > 0.5:
        details["likelyResolution"] = True
        text += " The price landed at an extreme, which usually means the contract is settling after the event resolved rather than anyone trading ahead of it."
    return AnomalyResult(score=score, sub_scores=subs, weights=weights, explanation=text, details=details)


def timeline_scores(points: list[PricePoint], *, step: int = HOUR, headlines: list[Headline] | None = None) -> list[tuple[int, float]]:
    """Anomaly score at each hour boundary across a window, for timeline pins and replay."""
    if not points:
        return []
    start = (min(p.ts for p in points) // HOUR) * HOUR + 8 * HOUR
    end = max(p.ts for p in points)
    out: list[tuple[int, float]] = []
    t = start
    while t <= end:
        out.append((t, anomaly_score(points, until=t, headlines=headlines).score))
        t += step
    return out
