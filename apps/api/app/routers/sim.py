from fastapi import APIRouter

router = APIRouter(prefix="/sim", tags=["sim"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"module": "sim", "status": "stub"}
