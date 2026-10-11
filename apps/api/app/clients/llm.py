"""One LLM wrapper: structured JSON output, schema validation, retry, disk cache keyed by input hash, token ledger.

Budget rules (see DECISIONS.md): demo mode never calls a provider; every result is cached under fixtures/llm_cache;
a daily token cap refuses further calls. Providers: Anthropic (default) or Gemini via LLM_PROVIDER."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import date
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app import runtime
from app.settings import FIXTURES_DIR, get_settings

log = logging.getLogger("tmb.llm")
T = TypeVar("T", bound=BaseModel)

CACHE_DIR = FIXTURES_DIR / "llm_cache"
LEDGER = CACHE_DIR / "ledger.jsonl"
DEFAULT_MODELS = {"anthropic": "claude-opus-5-5", "gemini": "gemini-2.5-flash"}
MAX_TOKENS_CEILING = 3000  # no single call may request more output than this


class LLMUnavailable(RuntimeError):
    """Raised when a call cannot be made: demo mode, missing key, or budget cap. Callers must degrade gracefully."""


def _key(provider: str, model: str, system: str, user: str, schema: dict) -> str:
    raw = json.dumps({"p": provider, "m": model, "s": system, "u": user, "schema": schema}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _tokens_today() -> int:
    if not LEDGER.exists():
        return 0
    today = date.today().isoformat()
    total = 0
    for line in LEDGER.read_text().splitlines():
        try:
            row = json.loads(line)
            if row.get("day") == today:
                total += int(row.get("input", 0)) + int(row.get("output", 0))
        except ValueError:
            continue
    return total


def _record(provider: str, model: str, tag: str, inp: int, out: int, seconds: float) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a") as f:
        f.write(json.dumps({"day": date.today().isoformat(), "ts": int(time.time()), "provider": provider, "model": model, "tag": tag, "input": inp, "output": out, "seconds": round(seconds, 2)}) + "\n")
    log.info("llm %s/%s %s: %d in, %d out, %.1fs (today %d tokens)", provider, model, tag, inp, out, seconds, _tokens_today())


async def _call_anthropic(model: str, system: str, user: str, schema: type[T], max_tokens: int) -> tuple[T, int, int]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    resp = await client.messages.parse(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=schema,
        output_config={"effort": "low"},
    )
    if resp.stop_reason == "refusal":
        raise LLMUnavailable("provider declined the request")
    parsed = resp.parsed_output
    if parsed is None:
        raise ValidationError.from_exception_data("empty", [])
    return parsed, resp.usage.input_tokens, resp.usage.output_tokens


async def _call_azure(model: str, system: str, user: str, schema: type[T], max_tokens: int) -> tuple[T, int, int]:
    """Azure OpenAI with structured outputs. `model` is the deployment name, pinned to the cheap model."""
    from openai import AsyncAzureOpenAI

    s = get_settings()
    client = AsyncAzureOpenAI(api_key=s.azure_openai_api_key, azure_endpoint=s.azure_openai_endpoint, api_version=s.azure_openai_api_version)
    resp = await client.beta.chat.completions.parse(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format=schema,
    )
    choice = resp.choices[0]
    if getattr(choice.message, "refusal", None):
        raise LLMUnavailable("provider declined the request")
    parsed = choice.message.parsed
    if parsed is None:
        raise ValidationError.from_exception_data("empty", [])
    usage = resp.usage
    return parsed, int(getattr(usage, "prompt_tokens", 0) or 0), int(getattr(usage, "completion_tokens", 0) or 0)


async def _call_gemini(model: str, system: str, user: str, schema: type[T], max_tokens: int) -> tuple[T, int, int]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=get_settings().gemini_api_key)
    resp = await client.aio.models.generate_content(
        model=model,
        contents=user,
        config=types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json", response_schema=schema, max_output_tokens=max_tokens),
    )
    parsed = schema.model_validate_json(resp.text or "{}")
    usage = resp.usage_metadata
    return parsed, int(getattr(usage, "prompt_token_count", 0) or 0), int(getattr(usage, "candidates_token_count", 0) or 0)


CALLS = {"anthropic": _call_anthropic, "gemini": _call_gemini, "azure": _call_azure}
KEY_FIELD = {"anthropic": "anthropic_api_key", "gemini": "gemini_api_key", "azure": "azure_openai_api_key"}


async def structured(system: str, user: str, schema: type[T], *, tag: str, max_tokens: int = 1500, use_cache: bool = True) -> T:
    """Return a validated instance of `schema`. Cached forever by input hash.

    The cache is always served when an answer exists, so nothing is ever paid for twice: a live run only calls the
    model for inputs not yet cached, and every successful call is written back. Only the LLM live toggle
    (runtime.is_live) permits a call at all — independent of DEMO_MODE, which controls live market data, not spend —
    so live data never opens the token tap; a session dollar cap backstops spend. The recorder sets the toggle itself."""
    s = get_settings()
    provider = s.llm_provider
    model = (s.azure_openai_deployment or "gpt-4.1-mini") if provider == "azure" else (s.llm_model or DEFAULT_MODELS[provider])
    max_tokens = min(max_tokens, MAX_TOKENS_CEILING)
    key = _key(provider, model, system, user, schema.model_json_schema())
    path = CACHE_DIR / f"{key}.json"
    # Always serve a cached answer when we have one — live or not — so a live run never re-spends on cached work.
    if use_cache and path.exists():
        return schema.model_validate(json.loads(path.read_text())["output"])
    # Allowed to call a provider only when the LLM live toggle is on. DEMO_MODE (live market data) has no say here.
    if not runtime.is_live():
        raise LLMUnavailable(f"cached mode and no cached answer for {tag}")
    if not getattr(s, KEY_FIELD[provider]):
        raise LLMUnavailable(f"no API key for {provider}")
    # Hard per-session dollar ceiling. Refuse before spending, and drop back to cached so the demo never stalls.
    # AI stays on (there is no toggle); past the daily spend cap new questions wait until the ledger resets at UTC midnight.
    if runtime.cap_reached():
        raise LLMUnavailable(f"daily AI spend cap of ${runtime.state().cap_usd:.2f} reached; new analyses resume tomorrow")
    if runtime.would_exceed(runtime.estimate_cost(system, user, max_tokens)):
        raise LLMUnavailable(f"call for {tag} would exceed the ${runtime.state().cap_usd:.2f} daily AI spend cap; new analyses resume tomorrow")
    if _tokens_today() >= s.llm_daily_token_cap:
        raise LLMUnavailable("daily token cap reached")
    call = CALLS[provider]
    last: Exception | None = None
    for attempt in range(2):
        t0 = time.monotonic()
        try:
            out, inp, outp = await call(model, system, user, schema, max_tokens)
            spent = runtime.add_usage(inp, outp)
            _record(provider, model, tag, inp, outp, time.monotonic() - t0)
            log.info("session spend now $%.4f of $%.2f", spent, runtime.state().cap_usd)
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"tag": tag, "provider": provider, "model": model, "system": system, "user": user, "output": out.model_dump(mode="json")}, indent=1))
            return out
        except ValidationError as e:
            last = e
            log.warning("invalid JSON from %s (attempt %d): %s", provider, attempt + 1, e)
        except LLMUnavailable:
            raise
    raise LLMUnavailable(f"provider returned invalid output twice: {last}")
