from fastapi import APIRouter

router = APIRouter(prefix="/learn", tags=["learn"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"module": "learn", "status": "stub"}
