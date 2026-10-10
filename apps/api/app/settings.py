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
    llm_provider: str = "anthropic"  # anthropic | gemini
    llm_daily_token_cap: int = 200_000
    poll_interval_seconds: int = 45
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
