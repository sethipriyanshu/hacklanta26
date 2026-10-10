"""Concept cards and the Spot the Manipulation game. Charts are anonymized real histories plus clearly-labelled synthetic patterns."""

from __future__ import annotations

import json
import random
from typing import Any

from fastapi import APIRouter, Query

from app.engines.anomaly import resample_hourly
from app.scenarios import SCENARIOS
from app.settings import FIXTURES_DIR
from app.store import store

router = APIRouter(prefix="/learn", tags=["learn"])
CONCEPTS_FILE = FIXTURES_DIR / "learn" / "concepts.json"
N_POINTS = 48


@router.get("/concepts")
async def concepts() -> list[dict[str, Any]]:
    return json.loads(CONCEPTS_FILE.read_text())


def _norm(prices: list[float], vols: list[float | None]) -> dict[str, list[float]]:
    v = [float(x or 0.0) for x in vols]
    mv = max(v) or 1.0
    return {"price": [round(p, 4) for p in prices], "volume": [round(x / mv, 3) for x in v]}


def _real_series(rng: random.Random, exclude: set[str]) -> list[tuple[str, dict[str, list[float]]]]:
    out = []
    for mid, pts in store.history.items():
        if mid in exclude:
            continue
        bars = resample_hourly(pts)
        if len(bars) < N_POINTS + 2:
            continue
        closes = [b.close for b in bars[-N_POINTS:]]
        if max(closes) - min(closes) < 0.01 or min(closes) < 0.05 or max(closes) > 0.95 or (max(closes) - min(closes)) > 0.5:
            continue  # dead-flat or resolution-stage charts are not interesting controls
        out.append((mid, _norm(closes, [b.volume if b.has_volume else None for b in bars[-N_POINTS:]])))
    rng.shuffle(out)
    return out


def _machado(rng: random.Random) -> dict[str, Any] | None:
    sc = next((s for s in SCENARIOS if s.id == 2), None)
    if not sc or not sc.market_id or sc.market_id not in store.history_1m or not sc.headline:
        return None
    head = int(sc.headline.at.timestamp())
    bars = [b for b in resample_hourly(store.history_1m[sc.market_id]) if b.ts <= head + 2 * 3600]
    bars = bars[-N_POINTS:]
    return {"kind": "real", "label": "Pre-news spike", "series": _norm([b.close for b in bars], [b.volume if b.has_volume else None for b in bars]), "headlineIndex": next((i for i, b in enumerate(bars) if b.ts >= head), None),
            "reveal": "A real contract. It sat under 2¢ for days, then ran to 68¢ in the hours before the announcement, on volume nearly 100× normal and with most buying from a handful of wallets. The headline arrived ten hours after the move started."}


def _wash(rng: random.Random) -> dict[str, Any]:
    p = 0.5 + rng.uniform(-0.1, 0.1)
    prices, vols = [], []
    for i in range(N_POINTS):
        p = min(0.9, max(0.1, p + rng.gauss(0, 0.004)))
        prices.append(p)
        vols.append(rng.uniform(0.05, 0.15) if (i < 18 or i > 36) else rng.uniform(0.7, 1.0))
    return {"kind": "synthetic", "label": "Wash trading", "series": {"price": [round(x, 4) for x in prices], "volume": [round(v, 3) for v in vols]}, "headlineIndex": None,
            "reveal": "Synthetic. Eighteen hours of enormous volume while the price never leaves a two-point range. Real interest moves prices; this only moved the volume counter."}


def _pump(rng: random.Random) -> dict[str, Any]:
    p = 0.08 + rng.uniform(0, 0.05)
    prices, vols = [], []
    for i in range(N_POINTS):
        if 28 <= i <= 33:
            p = min(0.95, p * rng.uniform(1.25, 1.5))
            vols.append(rng.uniform(0.6, 1.0))
        elif i > 33:
            p = max(0.05, p * rng.uniform(0.86, 0.95))
            vols.append(rng.uniform(0.2, 0.5))
        else:
            p = min(0.9, max(0.03, p + rng.gauss(0, 0.004)))
            vols.append(rng.uniform(0.02, 0.1))
        prices.append(p)
    return {"kind": "synthetic", "label": "Pump and fade", "series": {"price": [round(x, 4) for x in prices], "volume": [round(v, 3) for v in vols]}, "headlineIndex": None,
            "reveal": "Synthetic. A thin contract gets pushed from 10¢ to 60¢ in six hours with no headline, then bleeds back as the buyers who chased it become the exit liquidity."}


@router.get("/game")
async def game(seed: int = Query(7), rounds: int = Query(5, ge=1, le=6)) -> dict[str, Any]:
    rng = random.Random(seed)
    suspicious: list[dict[str, Any]] = [x for x in (_machado(rng), _wash(rng), _pump(rng), _wash(random.Random(seed + 1)), _pump(random.Random(seed + 2))) if x]
    rng.shuffle(suspicious)
    controls = _real_series(rng, exclude=set())
    out_rounds = []
    ci = 0
    for r in range(min(rounds, len(suspicious))):
        bad = suspicious[r]
        charts = []
        for _ in range(3):
            if ci < len(controls):
                mid, s = controls[ci]
                ci += 1
                charts.append({"kind": "real", "label": "Ordinary market", "series": s, "headlineIndex": None, "reveal": "A real market from the snapshot behaving normally: price and volume move together, nothing precedes anything.", "source": mid})
        charts.append(bad)
        rng.shuffle(charts)
        answer = next(i for i, c in enumerate(charts) if c is bad)
        out_rounds.append({"index": r, "charts": [{k: v for k, v in c.items() if k != "source"} for c in charts], "answer": answer, "explanation": bad["reveal"], "concept": "wash-trading" if bad["label"] == "Wash trading" else "anomaly-patterns"})
    return {"seed": seed, "rounds": out_rounds}
