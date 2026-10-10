import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.clients.http import close as close_http
from app.routers import desk, learn, markets, scenarios, signals, sim
from app.services import market_data as md
from app.settings import FIXTURES_DIR, get_settings
from app.store import store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tmb")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.load(FIXTURES_DIR / "snapshot")
    store.mode = "replay"
    task: asyncio.Task[None] | None = None
    if not settings.demo_mode:
        task = asyncio.create_task(md.poll_forever(store, settings.poll_interval_seconds))
        log.info("live mode: polling every %ss", settings.poll_interval_seconds)
    else:
        log.info("demo mode: %d markets from fixtures, no outbound calls", len(store.markets))
    yield
    if task:
        task.cancel()
    await close_http()


app = FastAPI(
    title="Trust Me Bro API",
    version="0.1.0",
    description="Read-only prediction-market intelligence. No trading, ever.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

for r in (markets, signals, desk, sim, learn, scenarios):
    app.include_router(r.router)


@app.get("/health")
async def health() -> dict[str, object]:
    snap = store.snapshot()
    return {"ok": True, "demoMode": settings.demo_mode, "mode": store.mode, "marketCount": snap.market_count, "recordedAt": snap.recorded_at.isoformat()}
