from fastapi import APIRouter

router = APIRouter(prefix="/desk", tags=["desk"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"module": "desk", "status": "stub"}
