from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import desk, learn, markets, signals, sim
from app.settings import get_settings

settings = get_settings()

app = FastAPI(
    title="Trust Me Bro API",
    version="0.1.0",
    description="Read-only prediction-market intelligence. No trading, ever.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (markets, signals, desk, sim, learn):
    app.include_router(r.router)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "demoMode": settings.demo_mode, "mode": "replay" if settings.demo_mode else "live"}
