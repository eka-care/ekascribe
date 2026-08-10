.PHONY: install setup dev api worker web test lint up down start start-prod

install:
	uv sync --all-packages

setup:
	uv run python scripts/setup.py

api:
	uv run uvicorn scribe.main:app --reload --port 8000

web:
	npm run dev --workspace apps/web

worker:
	uv run procrastinate --app scribe_worker.main.queue_app worker

dev: ## api + worker natively against dockerized postgres
	docker compose -f deploy/docker-compose-local.yml up -d postgres
	$(MAKE) -j2 api worker

test:
	uv run pytest

lint:
	uv run ruff check .

up:
	docker compose -f deploy/docker-compose-local.yml up --build

down:
	docker compose -f deploy/docker-compose-local.yml down


COMPOSE = docker compose -f deploy/docker-compose-local.yml

start: ## one command: build image (API + web UI) + init DB + start postgres/api (in-process default)
	@[ -f .env ] || { cp .env.example .env; echo ">> created .env from .env.example — add SARVAM_API_KEY + your LLM key before real use"; }
	$(COMPOSE) up -d --build postgres
	$(COMPOSE) build api
	$(COMPOSE) run --rm api uv run python scripts/setup.py --non-interactive --no-env --skip-model-check --no-serve-check
	$(COMPOSE) up -d api
	@echo ">> ekascribe running — app + api: http://localhost:8000"
	@echo ">>   (in-process mode; no worker. logs: $(COMPOSE) logs -f api)"

COMPOSE_PROD = docker compose -f deploy/docker-compose-prod.yml

start-prod: ## prod VM: build image (API + web UI) + init DB + start stack. Needs .env with keys, ENV=prod, SELF_URL=https://<your-domain>
	@[ -f .env ] || { cp .env.example .env; echo ">> created .env from .env.example — set API keys, ENV=prod and SELF_URL=https://<your-domain>, then re-run"; exit 1; }
	@grep -q "^ENV=prod" .env || echo ">> WARNING: ENV is not 'prod' in .env"
	@grep -q "^SELF_URL=https://" .env || echo ">> WARNING: SELF_URL in .env is not an https:// URL — browser-facing upload/session URLs derive from it"
	$(COMPOSE_PROD) up -d --build postgres
	$(COMPOSE_PROD) build api
	$(COMPOSE_PROD) run --rm api uv run python scripts/setup.py --non-interactive --no-env --skip-model-check --no-serve-check
	$(COMPOSE_PROD) up -d api
	@echo ">> ekascribe (prod) running — app + api on container port 8000"
	@echo ">>   front it with your HTTPS proxy (mic needs a secure context). logs: $(COMPOSE_PROD) logs -f api"
