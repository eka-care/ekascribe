.PHONY: install setup dev api worker web test lint up down

install:
	uv sync --all-packages

setup:
	uv run python scripts/setup.py

api:
	uv run uvicorn scribe_api.main:app --reload --port 8000

web:
	npm run dev --workspace apps/web

worker:
	uv run procrastinate --app scribe_worker.main.queue_app worker

dev: ## api + worker natively against dockerized postgres
	docker compose -f deploy/docker-compose.yml up -d postgres
	$(MAKE) -j2 api worker

test:
	uv run pytest

lint:
	uv run ruff check .

up:
	docker compose -f deploy/docker-compose.yml up --build

down:
	docker compose -f deploy/docker-compose.yml down
