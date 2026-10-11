"""Game state comes from the venues' own data; the signal game window follows it."""
from app.models import Market
from app.services.games import MAX_GAME_HOURS, game_state, kalshi_league
from app.services.signals import GAME_WINDOW_BEFORE, in_game_window

HOUR = 3600
START = 1_000_000


def _m(venue: str = "kalshi", **meta) -> Market:
    return Market(id="x", venue=venue, ticker="KXNCAAFGAME-X", title="Team wins", event_id="e", event_title="A vs B", category="Sports", yes_price=0.5, url="", meta=meta)


def test_no_kickoff_means_not_a_game():
    assert game_state(_m(), START) is None


def test_kalshi_milestone_status_drives_state():
    assert game_state(_m(gameStartTime=START, gameStatus="not_started"), START - HOUR) == "upcoming"
    assert game_state(_m(gameStartTime=START, gameStatus="inprogress"), START + HOUR) == "live"
    assert game_state(_m(gameStartTime=START, gameStatus="finished"), START + HOUR) == "over"
    assert game_state(_m(gameStartTime=START, gameStatus="Match Complete - X won"), START + HOUR) == "over"


def test_polymarket_flags_win_over_the_clock():
    assert game_state(_m("polymarket", gameStartTime=START, gameLive=True), START + 9 * HOUR) == "live"
    assert game_state(_m("polymarket", gameStartTime=START, gameEnded=True), START + HOUR) == "over"


def test_kickoff_window_is_the_fallback_and_is_bounded():
    m = _m("polymarket", gameStartTime=START)
    assert game_state(m, START + HOUR) == "live"
    assert game_state(m, START + (MAX_GAME_HOURS + 1) * HOUR) == "over"


def test_settled_market_is_over():
    assert game_state(_m(gameStartTime=START, acceptingOrders=False), START + HOUR) == "over"


def test_signal_window_opens_before_kickoff_and_closes_when_over():
    m = _m(gameStartTime=START, gameStatus="inprogress")
    assert in_game_window(m, START - GAME_WINDOW_BEFORE)
    assert not in_game_window(m, START - GAME_WINDOW_BEFORE - 1)
    assert in_game_window(m, START + 2 * HOUR)
    assert not in_game_window(_m(gameStartTime=START, gameStatus="finished"), START + 12 * HOUR)


def test_kalshi_league_from_series():
    assert kalshi_league("KXNCAAFGAME") == "CFB" and kalshi_league("KXNFLSPREAD") == "NFL" and kalshi_league("KXFED") is None
