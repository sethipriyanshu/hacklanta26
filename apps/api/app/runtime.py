"""Runtime LLM state: whether live calls are allowed, and a daily dollar ledger.

Live AI is on by default whenever a provider key is configured (there is no UI toggle). Answers are still cached
on disk, so each question is paid for once. Spend is capped per UTC day at `cap_usd`; past the cap, new questions
fail with a clear message and cached answers keep working. The ledger resets itself at UTC midnight.
Prices are gpt-4.1-mini (Azure), the only model this project calls live."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone

from app.settings import get_settings

# gpt-4.1-mini (Azure) list price, USD per token. Verified 2026.
PRICE_IN = 0.40 / 1_000_000
PRICE_OUT = 1.60 / 1_000_000


@dataclass
class _State:
    llm_live: bool
    session_cost_usd: float
    cap_usd: float
    day: str = ""  # UTC date the ledger belongs to


_state: _State | None = None
_lock = threading.Lock()


def state() -> _State:
    global _state
    if _state is None:
        _state = _State(llm_live=_key_present(), session_cost_usd=0.0, cap_usd=get_settings().session_cost_cap_usd, day=_today())
    if _state.day != _today():  # a new UTC day: the spend cap starts over
        with _lock:
            _state.day, _state.session_cost_usd = _today(), 0.0
    return _state


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _key_present() -> bool:
    s = get_settings()
    return bool(
        (s.llm_provider == "azure" and s.azure_openai_api_key)
        or (s.llm_provider == "anthropic" and s.anthropic_api_key)
        or (s.llm_provider == "gemini" and s.gemini_api_key)
    )


def is_live() -> bool:
    return state().llm_live


def set_live(on: bool) -> None:
    state().llm_live = bool(on)


def cost_of(inp: int, out: int) -> float:
    return inp * PRICE_IN + out * PRICE_OUT


def estimate_cost(system: str, user: str, max_tokens: int) -> float:
    """Conservative pre-flight estimate: ~4 chars/token in, and assume the full output budget is spent."""
    est_in = (len(system) + len(user)) // 4
    return cost_of(est_in, max_tokens)


def add_usage(inp: int, out: int) -> float:
    st = state()
    with _lock:
        st.session_cost_usd += cost_of(inp, out)
    return st.session_cost_usd


def remaining() -> float:
    st = state()
    return max(0.0, st.cap_usd - st.session_cost_usd)


def cap_reached() -> bool:
    return state().session_cost_usd >= state().cap_usd


def would_exceed(est_usd: float) -> bool:
    st = state()
    return (st.session_cost_usd + est_usd) > st.cap_usd


def reset_cost() -> None:
    with _lock:
        state().session_cost_usd = 0.0


def snapshot() -> dict[str, object]:
    st = state()
    s = get_settings()
    provider = s.llm_provider
    key_present = _key_present()
    model = s.azure_openai_deployment if provider == "azure" else (s.llm_model or "")
    return {
        "llmLive": st.llm_live,
        "sessionCostUsd": round(st.session_cost_usd, 4),
        "capUsd": st.cap_usd,
        "remainingUsd": round(remaining(), 4),
        "capReached": cap_reached(),
        "provider": provider,
        "model": model,
        "keyPresent": key_present,
    }
