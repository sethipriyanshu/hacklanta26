"""Frozen flags for the unlisted /demo page: real past anomalies and gaps, so a demo never depends on today's market.

Each case is a copy of real markets at the moment they were flagged, stored under `demo:` ids next to the live
markets. Every normal endpoint (market, history, signals, wallets, desk, sim) then works on them unchanged; only the
listing, book and fetch endpoints check `is_demo` so nothing live ever overwrites the frozen state.

Two sources:
- replays: an hourly history in the recorded snapshot, cut at the hour its anomaly score peaked;
- captures: flags the live scanner raised, copied as they happen (strongest few kept in .cache).
The curated set lives in fixtures/demo/cases.json; `python -m app.services.demo_cases` rebuilds it.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.engines import anomaly as an
from app.models import Event, Headline, Market, OrderBook, PricePoint, Trade
from app.models.signals import Signal
from app.settings import FIXTURES_DIR
from app.store import MarketStore

log = logging.getLogger("tmb.demo")
PREFIX = "demo:"
CASES_FILE = FIXTURES_DIR / "demo" / "cases.json"
CAPTURES_FILE = Path(__file__).resolve().parents[2] / ".cache" / "demo_captures.json"
MAX_CAPTURES = 6
CAPTURE_EVERY = 15 * 60
HISTORY_DAYS = 7
PAST_GAP_MIN_VOLUME = 10  # past pre-game gaps are all thin; the live scanner would hold these under the flag line
MIN_CAPTURE = 60  # only clear flags are worth freezing; a borderline 40-something makes a weak demo

# Recorded markets whose anomaly peak makes a clear story (picked by scanning the snapshot's hourly histories).
REPLAYS: list[str] = ["poly:560868", "poly:601826", "poly:562803", "poly:560317"]


def is_demo(market_id: str) -> bool:
    return market_id.startswith(PREFIX)


def _d(mid: str) -> str:
    return mid if is_demo(mid) else PREFIX + mid


class DemoIndex:
    def __init__(self) -> None:
        self.cases: list[dict[str, Any]] = []
        self.signals: dict[str, list[Signal]] = {}
        self.pair_results: dict[str, dict[str, Any]] = {}
        self.order: list[str] = []  # demo market ids to list, strongest flag first
        self._captured_at = 0.0


demo = DemoIndex()


# ---------- building cases ----------

def _freeze_market(m: Market, **over: Any) -> dict[str, Any]:
    row = m.model_dump(mode="json", by_alias=True)
    meta = {k: v for k, v in m.meta.items() if k not in ("gameLive", "gameStatus")}  # a frozen game is never "in progress"
    row.update({"id": _d(m.id), "eventId": _d(m.event_id), "status": "open", "meta": meta, **over})
    return row


def _event(store: MarketStore, m: Market, ids: list[str]) -> dict[str, Any] | None:
    ev = store.events.get(m.event_id)
    if not ev:
        return None
    row = ev.model_dump(mode="json", by_alias=True)
    row.update({"id": _d(ev.id), "marketIds": [_d(i) for i in ids], "totalMarkets": None})
    return row


def _rows(rows: list[Any], mid: str) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        d = r.model_dump(mode="json", by_alias=True)
        if "marketId" in d:
            d["marketId"] = _d(mid)
        out.append(d)
    return out


def _signal(s: Signal, *, as_of: int | None = None) -> dict[str, Any]:
    d = s.model_dump(mode="json", by_alias=True)
    d["marketId"] = _d(s.market_id)
    det = d.get("details") or {}
    for k in ("kalshiId", "pairId"):
        if isinstance(det.get(k), str):
            det[k] = _d(det[k])
    if isinstance(det.get("polyIds"), list):
        det["polyIds"] = [_d(x) for x in det["polyIds"]]
    if as_of is not None:
        d["asOf"] = as_of
    return d


def replay_case(store: MarketStore, mid: str) -> dict[str, Any] | None:
    """A recorded market frozen at the hour its anomaly score peaked (outside any game window)."""
    from app.services import signals as sv

    m = store.markets.get(mid)
    pts = store.history.get(mid)
    if not m or not pts:
        return None
    heads = store.news.get(mid) or None
    scores = [(t, s) for t, s in an.timeline_scores(pts, headlines=heads) if not sv.in_game_window(m, t)]
    if not scores:
        return None
    peak, score = max(scores, key=lambda x: x[1])
    if score < 40:
        return None
    until = peak  # the score as it stood at the peak hour
    hist = [p for p in pts if until - HISTORY_DAYS * 86400 <= p.ts <= until]
    bars = an.resample_hourly(hist)
    price = bars[-1].close
    day_ago = next((b.close for b in reversed(bars) if b.ts <= bars[-1].ts - 86400), bars[0].close)
    trades = [t for t in store.trades.get(mid, []) if t.ts <= until]
    # Polymarket's price history carries no volume: use the recorded trades in that day, else the market's own figure.
    vol24 = sum(p.volume or 0 for p in hist if p.ts > until - 86400) or sum(t.size * t.price for t in trades if t.ts > until - 86400) or m.volume_24h
    sig = sv.anomaly_signal(store, m, until=until)
    if not sig or sig.score < 40:
        return None
    sig.details["frozenAt"] = until
    news = [h for h in store.news.get(mid, []) if h.published_at.timestamp() <= until]
    ev = _event(store, m, [mid])
    return {
        "kind": "anomaly", "source": "replay", "originalId": mid, "asOf": until, "score": round(sig.score, 1),
        "markets": [_freeze_market(m, yesPrice=round(price, 4), lastPrice=round(price, 4), yesBid=None, yesAsk=None, spread=None, change24h=round(price - day_ago, 4), volume24h=round(vol24, 2))],
        "events": [ev] if ev else [],
        "history": {_d(mid): _rows(hist, mid)},
        "trades": {_d(mid): _rows(trades, mid)} if trades else {},
        "news": {_d(mid): [h.model_dump(mode="json", by_alias=True) for h in news]} if news else {},
        "wallets": {_d(mid): store.wallet_meta[mid]} if mid in store.wallet_meta else {},
        "books": {},
        "signals": [_signal(sig, as_of=until)],
        "pairs": {},
    }


def capture_case(store: MarketStore, mid: str) -> dict[str, Any] | None:
    """A market the live scanner flags right now, copied with everything its pages show. Gaps bring both venues."""
    from app.services import signals as sv

    m = store.markets.get(mid)
    sigs = [s for s in sv.signals.by_market.get(mid, []) if s.score >= 40]
    if not m or not sigs:
        return None
    top = max(sigs, key=lambda s: s.score)
    ids = [mid]
    pairs: dict[str, Any] = {}
    if top.type == "gap":
        ids = [top.details["kalshiId"], *top.details["polyIds"]]
        pr = sv.signals.pair_results.get(top.details["pairId"])
        if pr:
            pair = {**pr["pair"], "id": _d(pr["pair"]["id"]), "kalshiId": _d(pr["pair"]["kalshiId"]), "polyIds": [_d(x) for x in pr["pair"]["polyIds"]]}
            pairs[pair["id"]] = {"pair": pair, "gap": {**pr["gap"], "liveGame": False}}
    now = int(time.time())
    markets, events, history, trades, news, books, wallets, signals = [], {}, {}, {}, {}, {}, {}, []
    for i in ids:
        x = store.markets.get(i)
        if not x:
            return None
        markets.append(_freeze_market(x))
        ev = _event(store, x, [j for j in ids if store.markets.get(j) and store.markets[j].event_id == x.event_id])
        if ev:
            events[ev["id"]] = ev
        if store.history.get(i):
            history[_d(i)] = _rows([p for p in store.history[i] if p.ts >= now - HISTORY_DAYS * 86400], i)
        if store.trades.get(i):
            trades[_d(i)] = _rows(store.trades[i], i)
        if store.news.get(i):
            news[_d(i)] = [h.model_dump(mode="json", by_alias=True) for h in store.news[i]]
        if store.books.get(i):
            b = store.books[i].model_dump(mode="json", by_alias=True)
            b["marketId"] = _d(i)
            books[_d(i)] = b
        if i in store.wallet_meta:
            wallets[_d(i)] = store.wallet_meta[i]
        signals += [_signal(s) for s in sv.signals.by_market.get(i, []) if s.type == top.type]
    return {
        "kind": top.type, "source": "capture", "originalId": mid, "asOf": now, "score": round(top.score, 1),
        "markets": markets, "events": list(events.values()), "history": history, "trades": trades, "news": news,
        "wallets": wallets, "books": books, "signals": signals, "pairs": pairs,
    }


# ---------- installing into the store ----------

def install(store: MarketStore, cases: list[dict[str, Any]]) -> None:
    """Put cases into the store under their demo ids. Replaces any earlier demo set."""
    for mid in [i for i in store.markets if is_demo(i)]:
        del store.markets[mid]
        for d in (store.history, store.trades, store.news, store.books, store.wallet_meta):
            d.pop(mid, None)
        store.fixture_ids.discard(mid)
    demo.cases, demo.signals, demo.pair_results, seen = [], {}, {}, set()
    ranked: list[tuple[float, str]] = []
    for c in cases:
        ids = [r["id"] for r in c["markets"]]
        if any(i in seen for i in ids):
            continue
        seen.update(ids)
        demo.cases.append(c)
        for r in c["markets"]:
            store.markets[r["id"]] = Market.model_validate(r)
            store.fixture_ids.add(r["id"])  # never evicted by the live poller
        for e in c["events"]:
            store.events[e["id"]] = Event.model_validate(e)
        for mid, rows in c["history"].items():
            store.history[mid] = [PricePoint.model_validate(r) for r in rows]
        for mid, rows in c["trades"].items():
            store.trades[mid] = [Trade.model_validate(r) for r in rows]
        for mid, rows in c["news"].items():
            store.news[mid] = [Headline.model_validate(r) for r in rows]
        for mid, b in c["books"].items():
            store.books[mid] = OrderBook.model_validate(b)
        for mid, w in c["wallets"].items():
            store.wallet_meta[mid] = w
        for s in c["signals"]:
            demo.signals.setdefault(s["marketId"], []).append(Signal.model_validate(s))
        demo.pair_results.update(c["pairs"])
        flagged = [s["marketId"] for s in c["signals"] if s["score"] >= 40]
        ranked += [(c["score"], i) for i in dict.fromkeys(flagged)]
    demo.order = [i for _, i in sorted(ranked, key=lambda x: -x[0])]
    store._venue_counts = None
    log.info("demo: %d cases, %d flagged markets", len(demo.cases), len(demo.order))


def _read(path: Path) -> list[dict[str, Any]]:
    try:
        return json.loads(path.read_text()) if path.exists() else []
    except (OSError, ValueError) as e:
        log.warning("demo cases unreadable at %s: %s", path, e)
        return []


def load(store: MarketStore) -> None:
    """Curated cases first, then the most recent live captures."""
    install(store, _read(CASES_FILE) + _read(CAPTURES_FILE))


def _flagged_now(store: MarketStore, limit: int) -> list[str]:
    """The strongest live flag per event, strongest first."""
    from app.services import signals as sv

    best: dict[str, tuple[float, str]] = {}
    for mid, sigs in list(sv.signals.by_market.items()):
        top = max((s.score for s in sigs), default=0)
        m = store.markets.get(mid)
        if top < MIN_CAPTURE or not m or is_demo(mid) or not sv.is_listable(store, m):
            continue
        if m.event_id not in best or top > best[m.event_id][0]:
            best[m.event_id] = (top, mid)
    return [mid for _, mid in sorted(best.values(), reverse=True)[:limit]]


async def _prefetch(store: MarketStore, mid: str) -> None:
    """Live markets fetch history, book and trades on demand; pull them now so the frozen copy has its chart and book."""
    from app.services import market_data as md
    from app.services import signals as sv

    ids = [mid]
    for s in sv.signals.by_market.get(mid, []):
        if s.type == "gap" and s.score >= 40:
            ids = [s.details["kalshiId"], *s.details["polyIds"]]
    for i in ids:
        m = store.markets.get(i)
        if not m:
            continue
        for fetch in (md.history, md.book, md.trades):
            try:
                await fetch(store, m)
            except Exception as e:  # noqa: BLE001 — a missing piece just shows as empty on the demo page
                log.warning("demo prefetch %s %s: %s", fetch.__name__, i, e)


async def capture_live(store: MarketStore) -> None:
    """After a poll: copy the strongest live flags (one per event) so /demo always has recent real examples too."""
    if time.monotonic() - demo._captured_at < CAPTURE_EVERY:
        return
    demo._captured_at = time.monotonic()
    fresh = []
    for mid in _flagged_now(store, MAX_CAPTURES):
        await _prefetch(store, mid)
        if c := capture_case(store, mid):
            fresh.append(c)
    if not fresh:
        return
    old = [c for c in _read(CAPTURES_FILE) if c["originalId"] not in {f["originalId"] for f in fresh}]
    keep = (fresh + old)[:MAX_CAPTURES]
    CAPTURES_FILE.parent.mkdir(parents=True, exist_ok=True)
    CAPTURES_FILE.write_text(json.dumps(keep))
    install(store, _read(CASES_FILE) + keep)
    log.info("demo: captured %d live flags", len(fresh))


def _at(m: Market, price: float, half_spread: float, **over: Any) -> Market:
    bid = max(0.01, round(price - half_spread, 3))
    ask = min(0.99, round(price + half_spread, 3))
    return m.model_copy(update={"yes_price": price, "last_price": price, "yes_bid": bid, "yes_ask": ask, "spread": round(ask - bid, 3), **over})


async def past_gap_cases(store: MarketStore, limit: int = 3, scan: int = 80) -> list[dict[str, Any]]:
    """Real cross-venue gaps from the last week: matched game pairs whose hourly prices split by more than costs
    before kickoff. Quotes at that hour are rebuilt from the price and each market's current spread."""
    from app.engines import mispricing as mp
    from app.services import market_data as md
    from app.services import signals as sv

    now = int(time.time())
    cands = []
    for pid, pr in list(sv.signals.pair_results.items()):
        pair = pr["pair"]
        if not pid.startswith(("auto:", "pair:")) or pair["match"] != "same" or len(pair["polyIds"]) != 1:
            continue
        k, p = store.markets.get(pair["kalshiId"]), store.markets.get(pair["polyIds"][0])
        if k and p and min(k.volume_24h, p.volume_24h) >= 1000:
            cands.append((min(k.volume_24h, p.volume_24h), pid, k, p))
    found: list[tuple[float, dict[str, Any]]] = []
    for _, pid, k, p in sorted(cands, key=lambda x: -x[0])[:scan]:
        try:
            hk, hp = await md.history(store, k), await md.history(store, p)
        except Exception:  # noqa: BLE001
            continue
        bk = {b.ts: b for b in an.resample_hourly(hk)}
        bp = {b.ts: b for b in an.resample_hourly(hp)}
        best = None
        for t in sorted(set(bk) & set(bp)):
            if t < now - HISTORY_DAYS * 86400 or sv.in_game_window(k, t) or sv.in_game_window(p, t):
                continue
            # Both venues must really be trading then, or one price is a stale default: Kalshi shows volume in the
            # last 6 hours; Polymarket's history has no volume, so its price must have moved during the day.
            if sum(b.volume or 0 for ts, b in bk.items() if t - 6 * 3600 < ts <= t) <= 0 or sum(b.volume or 0 for ts, b in bk.items() if t - 86400 < ts <= t) < PAST_GAP_MIN_VOLUME:
                continue
            if len({round(b.close, 3) for ts, b in bp.items() if t - 86400 < ts <= t}) < 3:
                continue
            kk = _at(k, bk[t].close, (k.spread or 0.01) / 2)
            pp = _at(p, bp[t].close, (p.spread or 0.01) / 2)
            g = mp.cross_venue_gap(kk, [pp])
            v24 = sum(b.volume or 0 for ts, b in bk.items() if t - 86400 < ts <= t)
            if g.flagged and (best is None or g.edge_cents > best[0].edge_cents):
                best = (g, t, kk, pp, v24)
        if not best:
            continue
        g, t, kk, pp, v24 = best
        pr = sv.signals.pair_results[pid]
        dpid, dk, dp = _d(pid), _d(k.id), _d(p.id)
        score = round(min(100.0, max(40.0, g.edge_cents * 12)), 1)
        sigs = []
        for mid in (dk, dp):
            sigs.append({
                "marketId": mid, "type": "gap", "score": score,
                "subScores": {"gapCents": round(g.gap * 100, 1), "thresholdCents": round(g.threshold * 100, 1), "edgeCents": g.edge_cents},
                "weights": {}, "explanation": g.explanation, "detectedAt": datetime.fromtimestamp(t, timezone.utc).isoformat(), "asOf": t,
                "details": {"pairId": dpid, "kalshiId": dk, "polyIds": [dp], "kalshiPrice": g.kalshi_price, "polyPrice": g.poly_price, "match": pr["pair"]["match"], "checkedBy": pr["pair"].get("checkedBy"), "reason": pr["pair"].get("reason"), "flagged": True, "frozenAt": t},
            })
        markets, events, history = [], {}, {}
        for orig, frozen, hist in ((k, kk, hk), (p, pp, hp)):
            day = [x for x in hist if t - 86400 < x.ts <= t]
            prev = next((x.price for x in reversed(hist) if x.ts <= t - 86400), day[0].price if day else frozen.yes_price)
            markets.append(_freeze_market(frozen, change24h=round(frozen.yes_price - prev, 4), volume24h=round(sum(x.volume or 0 for x in day) or orig.volume_24h, 2)))  # Polymarket history has no volume
            ev = _event(store, orig, [orig.id])
            if ev:
                events[ev["id"]] = ev
            history[_d(orig.id)] = _rows([x for x in hist if t - HISTORY_DAYS * 86400 <= x.ts <= t], orig.id)
        pair = {**pr["pair"], "id": dpid, "kalshiId": dk, "polyIds": [dp]}
        gap = {**g.__dict__, "flagged": True, "thin": False, "liveGame": False, "demoNote": "thin pre-game market"}
        found.append((v24, {
            "kind": "gap", "source": "past-gap", "originalId": k.id, "asOf": t, "score": score,
            "markets": markets, "events": list(events.values()), "history": history, "trades": {}, "news": {}, "wallets": {}, "books": {},
            "signals": sigs, "pairs": {dpid: {"pair": pair, "gap": gap}},
        }))
    found.sort(key=lambda x: -x[0])  # the most actively traded first: the most believable gap
    out, seen_events = [], set()
    for _, c in found:
        ev = c["markets"][0]["eventId"]
        if ev not in seen_events:
            seen_events.add(ev)
            out.append(c)
    return out[:limit]


async def build_fixture(store: MarketStore) -> list[dict[str, Any]]:
    """The curated set: snapshot replays, past cross-venue gaps, and whatever the live scanner flags at build time."""
    cases = [c for mid in REPLAYS if (c := replay_case(store, mid))]
    cases += await past_gap_cases(store)
    for mid in _flagged_now(store, MAX_CAPTURES):
        await _prefetch(store, mid)
        if c := capture_case(store, mid):
            cases.append(c)
    return cases


if __name__ == "__main__":
    # Rebuild fixtures/demo/cases.json from the recorded snapshot plus the live API's current flags.
    import asyncio

    from app.services import market_data as md
    from app.services import signals as sv
    from app.store import store

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    store.load(FIXTURES_DIR / "snapshot")
    store.fixture_ids = set(store.markets)
    if not store.load_live():
        asyncio.run(md.refresh_markets(store))
    sv.load_pairs()
    sv.recompute(store)

    async def _build() -> list[dict[str, Any]]:
        try:
            return await build_fixture(store)
        finally:
            from app.clients.http import close

            await close()

    cases = asyncio.run(_build())
    CASES_FILE.parent.mkdir(parents=True, exist_ok=True)
    CASES_FILE.write_text(json.dumps(cases))
    stamp = lambda c: datetime.fromtimestamp(c["asOf"], timezone.utc).strftime("%Y-%m-%d %H:%M")  # noqa: E731
    for c in cases:
        print(f"{c['kind']:8} {c['source']:8} {c['score']:5}  {stamp(c)}  {c['markets'][0]['eventTitle'][:50]}")
    print(f"wrote {len(cases)} cases to {CASES_FILE}")
