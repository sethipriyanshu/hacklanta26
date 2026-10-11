from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]  # repo root (trust-me-bro/)
FIXTURES_DIR = ROOT / "fixtures"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    demo_mode: bool = True
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    llm_provider: str = "anthropic"  # anthropic | gemini | azure
    llm_model: str = ""  # empty = provider default
    llm_daily_token_cap: int = 200_000
    # Azure OpenAI (provider = azure). Deployment is pinned to the cheap model; nothing else is called.
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = "gpt-4.1-mini"
    azure_openai_api_version: str = "2024-10-21"
    azure_openai_api_key: str = ""
    # Hard daily (UTC) dollar ceiling on live LLM spend. The wrapper refuses a call that would cross it; the ledger resets at midnight.
    session_cost_cap_usd: float = 5.0
    poll_interval_seconds: int = 45
    # Tiger Data (TimescaleDB on Tiger Cloud). Empty = no database; the app runs from memory as before.
    tiger_database_url: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
