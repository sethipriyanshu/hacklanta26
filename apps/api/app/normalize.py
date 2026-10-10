"""Turn raw venue payloads into the shared Market / Event / PricePoint / Trade / OrderBook shapes."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from app.models import BookLevel, Category, Event, Market, OrderBook, PricePoint, Trade

# ---------- categories ----------

KALSHI_CATEGORY: dict[str, Category] = {
    "Economics": "Economics", "Financials": "Economics", "Politics": "Politics", "Elections": "Politics",
    "World": "Politics", "Sports": "Sports", "Science and Technology": "Tech", "Companies": "Tech",
    "Crypto": "Crypto", "Entertainment": "Other", "Climate and Weather": "Other", "Health": "Other", "Social": "Other",
}
CRYPTO_RE = re.compile(r"\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|dogecoin|xrp)\b", re.I)
TECH_RE = re.compile(r"\b(openai|agi|nvidia|apple|tesla|spacex|ai model|gpt|iphone|starship)\b", re.I)
ECON_RE = re.compile(r"\b(fed|fomc|cpi|inflation|gdp|jobs report|unemployment|rate cut|rate hike|tariff|recession)\b", re.I)
POLY_TAG_CATEGORY: list[tuple[re.Pattern[str], Category]] = [
    (re.compile(r"^(sports|esports|nfl|nba|mlb|nhl|soccer|ufc|tennis|golf|games|counter strike|league of legends)", re.I), "Sports"),
    (re.compile(r"^(crypto|bitcoin|ethereum|solana|crypto prices|hit price|memecoins)", re.I), "Crypto"),
    (re.compile(r"^(economy|fed|fomc|economics|macro|inflation|interest rates|business|earnings|tariffs|stocks)", re.I), "Economics"),
    (re.compile(r"^(politics|elections|us election|geopolitics|world|trump|congress|senate|middle east|ukraine|iran|israel|global elections)", re.I), "Politics"),
    (re.compile(r"^(tech|ai|science|space|openai|artificial intelligence|big tech)", re.I), "Tech"),
]


def categorize_kalshi(category: str | None, title: str) -> Category:
    if CRYPTO_RE.search(title):
        return "Crypto"
    return KALSHI_CATEGORY.get(category or "", "Other")


def categorize_poly(tags: list[dict[str, Any]], title: str) -> Category:
    labels = [str(t.get("label") or "") for t in tags]
    if CRYPTO_RE.search(title):
        return "Crypto"
    for label in labels:
        for pat, cat in POLY_TAG_CATEGORY:
            if pat.search(label):
                return cat
    if ECON_RE.search(title):
        return "Economics"
    if TECH_RE.search(title):
        return "Tech"
    return "Other"


# ---------- helpers ----------

def f(x: Any, default: float | None = None) -> float | None:
    try:
        if x is None or x == "":
            return default
        return float(x)
    except (TypeError, ValueError):
        return default


def ts_of(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def kalshi_id(ticker: str) -> str:
    return f"kalshi:{ticker}"


def poly_id(gamma_market_id: str) -> str:
    return f"poly:{gamma_market_id}"


# ---------- Kalshi ----------

def kalshi_event(ev: dict[str, Any]) -> tuple[Event, list[Market]]:
    cat = categorize_kalshi(ev.get("category"), ev.get("title", ""))
    series = ev.get("series_ticker", "")
    url = f"https://kalshi.com/markets/{series.lower()}" if series else "https://kalshi.com"
    markets: list[Market] = []
    for m in ev.get("markets", []):
        bid, ask = f(m.get("yes_bid_dollars")), f(m.get("yes_ask_dollars"))
        last = f(m.get("last_price_dollars"))
        mid = (bid + ask) / 2 if bid is not None and ask is not None and (bid or ask) else last
        prev = f(m.get("previous_price_dollars"))
        markets.append(
            Market(
                id=kalshi_id(m["ticker"]),
                venue="kalshi",
                ticker=m["ticker"],
                title=m.get("title") or ev.get("title", ""),
                subtitle=m.get("yes_sub_title") or None,
                event_id=f"kalshi:{ev['event_ticker']}",
                event_title=ev.get("title", ""),
                category=cat,
                outcomes=["Yes", "No"],
                yes_price=round(mid if mid is not None else 0.0, 4),
                yes_bid=bid,
                yes_ask=ask,
                last_price=last,
                spread=round(ask - bid, 4) if bid is not None and ask is not None else None,
                change_24h=round((mid or 0) - prev, 4) if prev is not None and mid is not None else None,
                volume=f(m.get("volume_fp"), 0.0) or 0.0,
                volume_24h=f(m.get("volume_24h_fp"), 0.0) or 0.0,
                open_interest=f(m.get("open_interest_fp")),
                liquidity=None,
                close_time=ts_of(m.get("close_time")),
                rules_text=(m.get("rules_primary") or "") + ("\n\n" + m["rules_secondary"] if m.get("rules_secondary") else ""),
                url=url,
                status=m.get("status", "open"),
                mutually_exclusive=bool(ev.get("mutually_exclusive")),
                meta={"series": series, "eventTicker": ev["event_ticker"], "result": m.get("result") or None},
            )
        )
    event = Event(
        id=f"kalshi:{ev['event_ticker']}",
        venue="kalshi",
        title=ev.get("title", ""),
        category=cat,
        mutually_exclusive=bool(ev.get("mutually_exclusive")),
        market_ids=[m.id for m in markets],
        total_markets=len(markets),
        close_time=max((m.close_time for m in markets if m.close_time), default=None),
        url=url,
    )
    return event, markets


def kalshi_candles(market_id: str, candles: list[dict[str, Any]]) -> list[PricePoint]:
    out: list[PricePoint] = []
    last_price: float | None = None
    for c in candles:
        price = f((c.get("price") or {}).get("close_dollars"))
        if price is None:
            bid, ask = f((c.get("yes_bid") or {}).get("close_dollars")), f((c.get("yes_ask") or {}).get("close_dollars"))
            price = (bid + ask) / 2 if bid is not None and ask is not None else last_price
        if price is None:
            continue
        last_price = price
        out.append(PricePoint(market_id=market_id, ts=int(c["end_period_ts"]), price=round(price, 4), volume=f(c.get("volume_fp"), 0.0)))
    return out


def kalshi_trades(market_id: str, rows: list[dict[str, Any]]) -> list[Trade]:
    out: list[Trade] = []
    for t in rows:
        ts = ts_of(t.get("created_time"))
        if not ts:
            continue
        side = "yes" if t.get("taker_side") == "yes" else "no"
        out.append(Trade(market_id=market_id, ts=int(ts.timestamp()), side=side, price=f(t.get("yes_price_dollars"), 0.0) or 0.0, size=f(t.get("count_fp"), 0.0) or 0.0))
    return out


def kalshi_book(market_id: str, ob: dict[str, Any], ts: int) -> OrderBook:
    yes = [BookLevel(price=float(p), size=float(s)) for p, s in ob.get("yes_dollars") or []]
    no = [BookLevel(price=round(1 - float(p), 4), size=float(s)) for p, s in ob.get("no_dollars") or []]  # NO bids are YES asks
    yes.sort(key=lambda l: -l.price)
    no.sort(key=lambda l: l.price)
    return OrderBook(market_id=market_id, ts=ts, bids=yes, asks=no)


# ---------- Polymarket ----------

def _jlist(s: Any) -> list[Any]:
    if isinstance(s, list):
        return s
    try:
        return json.loads(s) if s else []
    except (TypeError, ValueError):
        return []


def poly_event(ev: dict[str, Any]) -> tuple[Event, list[Market]]:
    cat = categorize_poly(ev.get("tags") or [], ev.get("title", ""))
    url = f"https://polymarket.com/event/{ev.get('slug', '')}"
    markets: list[Market] = []
    for m in ev.get("markets", []):
        if not m.get("conditionId") or m.get("archived"):
            continue
        outcomes = [str(o) for o in _jlist(m.get("outcomes"))] or ["Yes", "No"]
        prices = [f(p, 0.0) or 0.0 for p in _jlist(m.get("outcomePrices"))]
        tokens = [str(t) for t in _jlist(m.get("clobTokenIds"))]
        yes_price = prices[0] if prices else 0.0
        bid, ask = f(m.get("bestBid")), f(m.get("bestAsk"))
        change = f(m.get("oneDayPriceChange"))
        markets.append(
            Market(
                id=poly_id(str(m["id"])),
                venue="polymarket",
                ticker=m.get("slug", str(m["id"])),
                title=m.get("question") or ev.get("title", ""),
                subtitle=m.get("groupItemTitle") or None,
                event_id=f"poly:{ev['id']}",
                event_title=ev.get("title", ""),
                category=cat,
                outcomes=outcomes,
                yes_price=round(yes_price, 4),
                yes_bid=bid,
                yes_ask=ask,
                last_price=f(m.get("lastTradePrice")),
                spread=f(m.get("spread")),
                change_24h=round(change, 4) if change is not None else None,
                volume=f(m.get("volumeNum"), 0.0) or 0.0,
                volume_24h=f(m.get("volume24hr"), 0.0) or 0.0,
                open_interest=None,
                liquidity=f(m.get("liquidityNum")),
                close_time=ts_of(m.get("endDate")),
                rules_text=m.get("description") or "",
                url=url,
                status="closed" if m.get("closed") else "open",
                mutually_exclusive=bool(ev.get("negRisk")),
                meta={"conditionId": m["conditionId"], "tokens": tokens, "eventSlug": ev.get("slug"), "resolved": bool(m.get("closed")), "resolvedYes": (prices[0] == 1.0) if m.get("closed") and prices else None},
            )
        )
    event = Event(
        id=f"poly:{ev['id']}",
        venue="polymarket",
        title=ev.get("title", ""),
        category=cat,
        mutually_exclusive=bool(ev.get("negRisk")),
        market_ids=[m.id for m in markets],
        total_markets=len(markets),
        close_time=ts_of(ev.get("endDate")),
        url=url,
    )
    return event, markets


def poly_history(market_id: str, rows: list[dict[str, Any]]) -> list[PricePoint]:
    return [PricePoint(market_id=market_id, ts=int(r["t"]), price=round(float(r["p"]), 4)) for r in rows if "t" in r and "p" in r]


def poly_trades(market_id: str, rows: list[dict[str, Any]]) -> list[Trade]:
    out: list[Trade] = []
    for t in rows:
        # Data API reports the traded outcome token; convert to a YES-side view.
        is_yes_token = t.get("outcomeIndex") == 0
        buying = t.get("side") == "BUY"
        side = "yes" if (is_yes_token == buying) else "no"
        price = float(t.get("price") or 0)
        yes_price = price if is_yes_token else round(1 - price, 4)
        out.append(
            Trade(
                market_id=market_id,
                ts=int(t.get("timestamp") or 0),
                side=side,
                price=yes_price,
                size=float(t.get("size") or 0),
                wallet=t.get("proxyWallet"),
                wallet_label=t.get("pseudonym") or None,
                outcome=t.get("outcome"),
            )
        )
    return out


def poly_book(market_id: str, raw: dict[str, Any]) -> OrderBook:
    ts = int(int(raw.get("timestamp") or 0) / 1000) or int(datetime.now(timezone.utc).timestamp())
    bids = sorted((BookLevel(price=float(l["price"]), size=float(l["size"])) for l in raw.get("bids") or []), key=lambda l: -l.price)
    asks = sorted((BookLevel(price=float(l["price"]), size=float(l["size"])) for l in raw.get("asks") or []), key=lambda l: l.price)
    return OrderBook(market_id=market_id, ts=ts, bids=bids[:12], asks=asks[:12])


def bucket_volume(points: list[PricePoint], trades: list[Trade], bucket_seconds: int) -> list[PricePoint]:
    """Attach traded volume to price points that lack it (Polymarket history has none)."""
    if not points:
        return points
    vol: dict[int, float] = {}
    for t in trades:
        vol[t.ts // bucket_seconds] = vol.get(t.ts // bucket_seconds, 0.0) + t.size
    oldest = min((t.ts for t in trades), default=None)
    out: list[PricePoint] = []
    for p in points:
        if p.volume is not None:
            out.append(p)
        elif oldest is None or p.ts < (oldest // bucket_seconds) * bucket_seconds:
            out.append(p)  # volume unknown here, not zero
        else:
            out.append(p.model_copy(update={"volume": round(vol.get(p.ts // bucket_seconds, 0.0), 2)}))
    return out
