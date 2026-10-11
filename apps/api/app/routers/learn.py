"""Concept cards and the Spot the Manipulation game. Charts are anonymized real histories plus clearly-labelled synthetic patterns."""

from __future__ import annotations

import json
import random
from datetime import datetime, timezone
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
async def game(seed: int | None = Query(None), rounds: int = Query(5, ge=1, le=6)) -> dict[str, Any]:
    seed = random.randrange(1000) if seed is None else seed  # no seed: a fresh mix every visit
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


# ---------- live examples: each module can show a real, current market that illustrates it ----------

def _brief(m) -> dict[str, Any]:
    return {
        "marketId": m.id, "title": m.title, "eventTitle": m.event_title, "subtitle": m.subtitle, "venue": m.venue, "category": m.category,
        "yesPrice": m.yes_price, "bid": m.yes_bid, "ask": m.yes_ask, "spread": m.spread, "volume24h": m.volume_24h,
        "closeTime": m.close_time.isoformat() if m.close_time else None,
        "daysToClose": round((m.close_time - datetime.now(timezone.utc)).total_seconds() / 86400, 1) if m.close_time else None,
    }


def _listable() -> list:
    from datetime import datetime, timezone

    from app.services import signals as sv

    now = datetime.now(timezone.utc)
    return [m for m in store.markets.values() if sv.is_listable(store, m, now)]


def _liquid(ms: list, *, mid_only: bool = True) -> list:
    """Busy markets with a real two-sided quote, most traded first; mid-priced ones make the clearest examples.
    Games in progress are left out: their prices jump every play, which muddies a calm example."""
    import time as _t

    from app.services import games

    now = int(_t.time())
    out = [
        m for m in ms
        if m.yes_bid and m.yes_ask and m.spread is not None and m.spread <= 0.03 and m.volume_24h >= 20_000
        and (not mid_only or 0.2 <= m.yes_price <= 0.8) and games.game_state(m, now) is None
    ]
    return sorted(out, key=lambda m: -m.volume_24h)


@router.get("/example")
async def example(kind: str = Query(..., pattern="^(liquid|spread|book|flagged|gap|rules|long_dated|live_game|outcome_set)$")) -> dict[str, Any] | None:
    """A real market that shows the module's idea right now. Returns null when nothing current fits."""
    import time as _t

    from app.services import games
    from app.services import market_data as md
    from app.services import signals as sv

    ms = _listable()
    if kind in ("liquid", "spread"):
        pool = _liquid(ms)
        if kind == "spread":  # a visibly wider spread teaches more than a 1-cent one
            pool = sorted(pool[:200], key=lambda m: -(m.spread or 0))
        return _brief(pool[0]) if pool else None
    if kind == "book":
        for m in _liquid(ms)[:8]:
            try:
                ob = await md.book(store, m)
            except Exception:  # noqa: BLE001 — a venue hiccup just means trying the next market
                continue
            if ob.asks and ob.bids:
                asks = sorted(ob.asks, key=lambda lv: lv.price)[:6]
                bids = sorted(ob.bids, key=lambda lv: -lv.price)[:6]
                return {**_brief(m), "book": {"asks": [lv.model_dump() for lv in asks], "bids": [lv.model_dump() for lv in bids]}}
        return None
    if kind == "flagged":
        flagged = sorted((m for m in ms if sv.max_score(m.id) >= 40), key=lambda m: -sv.max_score(m.id))
        if not flagged:
            return None
        m = flagged[0]
        top = max(sv.signals.by_market.get(m.id, []), key=lambda s: s.score)
        return {**_brief(m), "flag": {"type": top.type, "score": round(top.score), "explanation": top.explanation}}
    if kind == "gap":
        rows = sorted(sv.signals.pair_results.values(), key=lambda r: -float(r["gap"].get("gap") or 0))
        rows = [r for r in rows if not r["pair"]["id"].startswith("autoent:")]
        if not rows:
            return None
        r = rows[0]
        k = store.markets.get(r["pair"]["kalshiId"])
        g = r["gap"]
        return {**(_brief(k) if k else {}), "gap": {"kalshi": g["kalshi_price"], "poly": g["poly_price"], "gapCents": round(g["gap"] * 100, 1), "costCents": round(g["threshold"] * 100, 1), "edgeCents": g["edge_cents"], "flagged": g.get("flagged", False)}}
    if kind == "rules":
        keys = ("originally scheduled", "postponed", "cancelled", "canceled", "if no ", "resolve to no", "resolves to no")
        pool = [m for m in _liquid(ms, mid_only=False)[:400] if any(k in (m.rules_text or "").lower() for k in keys)]
        if not pool:
            return None
        m = pool[0]
        return {**_brief(m), "rules": (m.rules_text or "")[:900]}
    if kind == "long_dated":
        from datetime import datetime, timedelta, timezone

        far = datetime.now(timezone.utc) + timedelta(days=365)
        pool = [m for m in _liquid(ms, mid_only=False) if m.close_time and m.close_time > far and 0.85 <= m.yes_price <= 0.97]
        return _brief(pool[0]) if pool else None
    if kind == "live_game":
        now = int(_t.time())
        pool = sorted((m for m in ms if games.is_live(m, now) and m.volume_24h >= 10_000), key=lambda m: -m.volume_24h)
        if not pool:
            return None
        m = pool[0]
        return {**_brief(m), "score": m.meta.get("score"), "period": m.meta.get("period")}
    if kind == "outcome_set":
        best = None
        for ev in store.events.values():
            if not ev.mutually_exclusive:
                continue
            legs = [store.markets[i] for i in ev.market_ids if i in store.markets and store.markets[i].status != "closed"]
            if not (3 <= len(legs) <= 12) or sum(x.volume_24h for x in legs) < 50_000:
                continue
            total = sum(x.yes_price for x in legs)
            score = abs(total - 1)
            if best is None or score > best[0]:
                best = (score, ev, legs, total)
        if not best:
            return None
        _, ev, legs, total = best
        return {"eventTitle": ev.title, "venue": ev.venue, "sum": round(total, 4), "outcomes": [{"label": x.subtitle or x.title, "yesPrice": x.yes_price} for x in sorted(legs, key=lambda x: -x.yes_price)]}
    return None


# ---------- Call the move: guess the move, then see what really happened ----------

@router.get("/moves")
async def moves(seed: int | None = Query(None), rounds: int = Query(5, ge=2, le=8)) -> dict[str, Any]:
    """Rounds built only from recorded data. Headline rounds use the real minute windows around a recorded headline;
    chart rounds show a real market's hourly history and hide the next 24 hours."""
    seed = random.randrange(1000) if seed is None else seed
    rng = random.Random(seed)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for sc in SCENARIOS:
        if not sc.headline or not sc.market_id or sc.market_id in seen or sc.market_id not in store.history_1m:
            continue
        seen.add(sc.market_id)
        pts = sorted(store.history_1m[sc.market_id], key=lambda p: p.ts)
        head = int(sc.headline.at.timestamp())
        before = [p for p in pts if p.ts <= head - 300]
        after = [p for p in pts if p.ts >= head + 7200] or pts[-1:]
        if not before:
            continue
        m = store.markets.get(sc.market_id)
        lead = [p.price for p in before][-180:][::5]
        out.append({
            "kind": "headline", "marketId": sc.market_id, "title": (m.event_title + " · " + (m.subtitle or m.title)) if m else sc.title,
            "headline": sc.headline.title, "headlineAt": head, "before": before[-1].price, "after": after[0].price, "horizon": "2 hours after the headline",
            "lead": [round(x, 4) for x in lead],
        })
    flat: list[dict[str, Any]] = []
    movers: list[dict[str, Any]] = []  # windows where the next day really moved: a game of only flat lines teaches nothing
    for mid, ptsh in store.history.items():
        bars = resample_hourly(ptsh)
        if len(bars) < 96:
            continue
        m = store.markets.get(mid)
        title = (m.event_title + " · " + (m.subtitle or m.title)) if m else mid

        def window(cut: int) -> dict[str, Any] | None:
            lead_b, next_b = bars[cut - 48 : cut], bars[cut : cut + 24]
            p0, p1 = lead_b[-1].close, next_b[-1].close
            if not (0.05 <= p0 <= 0.95):
                return None
            return {
                "kind": "chart", "marketId": mid, "title": title, "headline": None, "headlineAt": None,
                "before": p0, "after": p1, "horizon": "the next 24 hours", "lead": [round(b.close, 4) for b in lead_b],
                "reveal": [round(b.close, 4) for b in next_b],
            }

        w = window(rng.randint(48, len(bars) - 25))
        if w:
            flat.append(w)
        cuts = list(range(48, len(bars) - 24, 6))
        best = max(cuts, key=lambda c: abs(bars[c + 23].close - bars[c - 1].close))
        bw = window(best)
        if bw and abs(bw["after"] - bw["before"]) >= 0.04:
            movers.append(bw)
    rng.shuffle(flat)
    rng.shuffle(movers)
    pool: list[dict[str, Any]] = []
    used: set[str] = set()
    for src in [x for pair in zip(movers, flat) for x in pair] + movers + flat:  # alternate: mostly real moves, some quiet days
        if src["marketId"] not in used:
            used.add(src["marketId"])
            pool.append(src)
    out += pool[: max(0, rounds - len(out))]
    rng.shuffle(out)
    return {"seed": seed, "rounds": out[:rounds]}
