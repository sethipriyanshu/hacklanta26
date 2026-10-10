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

from app.settings import FIXTURES_DIR, get_settings

log = logging.getLogger("tmb.llm")
T = TypeVar("T", bound=BaseModel)

CACHE_DIR = FIXTURES_DIR / "llm_cache"
LEDGER = CACHE_DIR / "ledger.jsonl"
DEFAULT_MODELS = {"anthropic": "claude-opus-5-5", "gemini": "gemini-2.5-flash"}


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


async def structured(system: str, user: str, schema: type[T], *, tag: str, max_tokens: int = 1500, use_cache: bool = True) -> T:
    """Return a validated instance of `schema`. Cached forever by input hash."""
    s = get_settings()
    provider = s.llm_provider
    model = s.llm_model or DEFAULT_MODELS[provider]
    key = _key(provider, model, system, user, schema.model_json_schema())
    path = CACHE_DIR / f"{key}.json"
    if use_cache and path.exists():
        return schema.model_validate(json.loads(path.read_text())["output"])
    if s.demo_mode:
        raise LLMUnavailable(f"demo mode and no cached answer for {tag}")
    if (provider == "anthropic" and not s.anthropic_api_key) or (provider == "gemini" and not s.gemini_api_key):
        raise LLMUnavailable(f"no API key for {provider}")
    if _tokens_today() >= s.llm_daily_token_cap:
        raise LLMUnavailable("daily token cap reached")
    call = _call_anthropic if provider == "anthropic" else _call_gemini
    last: Exception | None = None
    for attempt in range(2):
        t0 = time.monotonic()
        try:
            out, inp, outp = await call(model, system, user, schema, max_tokens)
            _record(provider, model, tag, inp, outp, time.monotonic() - t0)
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"tag": tag, "provider": provider, "model": model, "system": system, "user": user, "output": out.model_dump(mode="json")}, indent=1))
            return out
        except ValidationError as e:
            last = e
            log.warning("invalid JSON from %s (attempt %d): %s", provider, attempt + 1, e)
        except LLMUnavailable:
            raise
    raise LLMUnavailable(f"provider returned invalid output twice: {last}")
