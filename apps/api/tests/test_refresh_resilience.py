"""A failing venue keeps its last good markets listed; a successful one replaces its own; unpolled markets are evicted."""
import asyncio

from app.models import Event, Market
from app.services import games
from app.services import market_data as md
from app.store import MarketStore


def _m(i: str, venue: str) -> Market:
    return Market(id=i, venue=venue, ticker=i, title=i, event_id=f"{venue}:e", event_title="e", category="Other", yes_price=0.5, url="")


def _ev(venue: str) -> Event:
    return Event(id=f"{venue}:e", venue=venue, title="e", category="Other")


def test_failed_venue_keeps_its_markets(monkeypatch):
    store = MarketStore()

    async def kalshi_ok():
        return [_ev("kalshi")], [_m("k1", "kalshi"), _m("k2", "kalshi")]

    async def poly_ok():
        return [_ev("polymarket")], [_m("p1", "polymarket")]

    async def poly_down():
        raise RuntimeError("gamma 503")

    async def no_schedule():
        return {}

    monkeypatch.setattr(md, "pull_kalshi", kalshi_ok)
    monkeypatch.setattr(md, "pull_polymarket", poly_ok)
    monkeypatch.setattr(games, "pull_kalshi_schedule", no_schedule)
    asyncio.run(md.refresh_markets(store))
    assert store.live_ids == {"k1", "k2", "p1"}

    async def kalshi_shrunk():
        return [_ev("kalshi")], [_m("k1", "kalshi")]

    monkeypatch.setattr(md, "pull_kalshi", kalshi_shrunk)
    monkeypatch.setattr(md, "pull_polymarket", poly_down)
    asyncio.run(md.refresh_markets(store))
    assert store.live_ids == {"k1", "p1"}  # Polymarket's last good set survives its outage
    assert "k2" not in store.markets  # Kalshi dropped k2, so it is evicted
    assert store.poll["polymarket"]["ok"] is False and store.poll["kalshi"]["ok"] is True
