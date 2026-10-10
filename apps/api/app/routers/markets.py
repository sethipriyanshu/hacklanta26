from fastapi import APIRouter

router = APIRouter(prefix="/markets", tags=["markets"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"module": "markets", "status": "stub"}
