from fastapi import APIRouter

from app.scenarios import SCENARIOS, Scenario

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=list[Scenario])
async def list_scenarios() -> list[Scenario]:
    return SCENARIOS
