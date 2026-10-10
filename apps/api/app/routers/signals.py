from fastapi import APIRouter

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"module": "signals", "status": "stub"}
