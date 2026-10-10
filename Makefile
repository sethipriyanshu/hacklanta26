.PHONY: dev web api redis types test
dev: ## run web + api together
	@(cd apps/api && uv run uvicorn app.main:app --reload --port 8000) & (cd apps/web && pnpm dev); wait
web:
	cd apps/web && pnpm dev
api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000
redis:
	docker compose up -d redis
types: ## regenerate TS types from the FastAPI OpenAPI schema (api must be running)
	cd apps/web && pnpm exec openapi-typescript http://localhost:8000/openapi.json -o lib/api.types.ts
test:
	cd apps/api && uv run pytest -q
