"""The six demo scenarios. Market ids were chosen by hand on 2026-10-07 after browsing both venues."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from app.models import Model


class ScenarioHeadline(Model):
    title: str
    at: datetime
    source: str = ""


class Scenario(Model):
    id: int
    code: str
    title: str
    module: Literal["scanner", "desk", "sim", "learn"]
    route: str
    proves: str
    market_id: str | None = None
    event_id: str | None = None
    pair: dict[str, Any] | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    headline: ScenarioHeadline | None = None


def _t(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


SCENARIOS: list[Scenario] = [
    Scenario(id=1, code="SCENARIO 1", title="Live scanner with flags", module="scanner", route="/scanner", proves="Real data, real signals, polished UI"),
    Scenario(
        id=2, code="SCENARIO 2", title="Pre-news spike replay", module="scanner", route="/scanner/poly:560868?scenario=2",
        proves="Anomaly score fires before the headline; wallet panel shows fresh wallets",
        market_id="poly:560868", event_id="poly:31406",
        window_start=_t("2025-10-08T00:00:00"), window_end=_t("2025-10-11T00:00:00"),
        headline=ScenarioHeadline(title="Nobel Peace Prize 2025 awarded to María Corina Machado", at=_t("2025-10-10T09:00:00"), source="Norwegian Nobel Committee"),
    ),
    Scenario(
        id=3, code="SCENARIO 3", title="Cross-venue gap", module="scanner", route="/scanner?view=gaps&scenario=3",
        proves="Same event priced differently on Kalshi and Polymarket, with an LLM rule check",
        market_id="kalshi:KXFED-26OCT-T4.00", event_id="kalshi:KXFED-26OCT",
        pair={"kalshiId": "kalshi:KXFED-26OCT-T4.00", "polyIds": ["poly:2589813", "poly:2589814"], "polyEventId": "poly:606422", "note": "Kalshi 'above 4.00%' spans Polymarket's +25 and +50 brackets"},
    ),
    Scenario(
        id=4, code="SCENARIO 4", title="Same contract, two profiles", module="desk", route="/desk?market=poly:2589812&scenario=4",
        proves="Student gets Pass; high-income user gets a small capped position",
        market_id="poly:2589812", event_id="poly:606422",
    ),
    Scenario(
        id=5, code="SCENARIO 5", title="Backtest on a resolved event", module="sim", route="/sim?market=poly:2252245&scenario=5",
        proves="Simulated curve tracks the real curve, with an error score",
        market_id="poly:2252245", event_id="poly:481717",
        window_start=_t("2026-09-15T12:00:00"), window_end=_t("2026-09-17T00:00:00"),
        headline=ScenarioHeadline(title="FOMC raises the target range by 25 basis points", at=_t("2026-09-16T18:00:00"), source="Federal Reserve"),
    ),
    Scenario(
        id=6, code="SCENARIO 6", title="Demographic what-if", module="sim", route="/sim?market=poly:2252245&scenario=6",
        proves="Slow-information swarm vs fast-information swarm reacts differently",
        market_id="poly:2252245", event_id="poly:481717",
        window_start=_t("2026-09-15T12:00:00"), window_end=_t("2026-09-17T00:00:00"),
        headline=ScenarioHeadline(title="FOMC raises the target range by 25 basis points", at=_t("2026-09-16T18:00:00"), source="Federal Reserve"),
    ),
]

# Kalshi twins of scenario markets, recorded alongside so cross-venue views have both sides.
KALSHI_COMPANIONS: dict[int, list[tuple[str, str]]] = {
    5: [("KXFED", "KXFED-26SEP-T3.75"), ("KXFED", "KXFED-26SEP-T4.00")],
}
