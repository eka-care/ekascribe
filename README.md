# ekascribe

On-prem, self-hostable AI medical scribe: record a consultation → transcribe →
structured clinical note → edit → print/copy. Forked from eka.care's EkaScribe
stack with every cloud dependency made pluggable.

## Quick start

One command builds everything (installs all deps), initializes the DB + seeds
templates, and starts the full stack in Docker (in-process default — no worker):

```bash
make start          # Postgres + API (:8000) + web (:3000)
```

Add your keys to `.env` first (the command creates one from `.env.example` if
missing): `SARVAM_API_KEY` for STT and your LLM key. Re-running `make start` is
safe. Stop with `make down`.

Native dev loop (no Docker for the app):

```bash
uv sync --all-packages && npm install
docker compose -f deploy/docker-compose-local.yml up -d postgres
make setup          # writes .env (add keys, re-run), runs migrations + seeds
make api            # http://localhost:8000
make web            # http://localhost:3000
```

## Execution modes

The commit-time pipeline (chunk STT → stitch → structure → finalize) runs in one
of two modes, selected by `EXECUTION_MODE` in `.env`:

- **`inprocess`** (default) — runs as background jobs inside the API process. One
  container, no queue, no worker. Best for single-clinic / dev / low concurrency.
- **`worker`** — jobs are deferred to Postgres (procrastinate) and consumed by the
  `apps/worker` container. Durable, retryable, and horizontally scalable for high
  concurrency. Enable with `EXECUTION_MODE=worker` + `UVICORN_WORKERS=4`, then
  `docker compose -f deploy/docker-compose-local.yml --profile worker up -d --build`.

Same pipeline code runs in both modes; only the dispatch backend changes.

## Stack

| Layer | On-prem default | Alternative |
|---|---|---|
| Database | Postgres (relational tables + JSONB) | DynamoDB (endpoint-overridable) |
| Blob storage | Local filesystem, backend-served URLs | S3 / MinIO / LocalStack |
| Pipeline execution | In-process background jobs | Postgres/procrastinate worker |
| STT | Sarvam (bring your key) | Deepgram / OpenAI / Gemini via echo |
| LLM | Anthropic / OpenAI-compatible endpoint (vLLM / Ollama) | OpenAI / Bedrock / Gemini |
| Prompts | Files in `prompts/` | Langfuse |
| Auth (v1) | Dev-token (`DEV_AUTH_TOKEN`) | proper login — phase 2 |

## Layout

```
apps/api                    FastAPI backend (voice2rx-be fork)
  └ voice2rx/background/     Pipeline (queue-agnostic) + in-process job runner
apps/worker                 Procrastinate wrappers over the same pipeline (worker mode)
apps/web                    Next.js app (ekascribe-web fork)
packages/core               scribe_core: settings, auth, storage, db, queue, logging
packages/scribe-client-sdk  Vendored frontend SDKs (see its README)
packages/ui-lib             Design components (inlined)
prompts/                    Agent prompts (file provider)
templates/                  Seed data: 5 default markdown templates
scripts/setup.py            Init: .env, checks, migrations, seeds, smoke
deploy/                     Dockerfiles + docker-compose (+ AWS/LocalStack overlay)
  ├ push.sh                 Build + push api/web images to Docker Hub
  └ k8s/                    Kubernetes manifests (api + web, namespace eka-care)
```

echo (STT + LLM providers, prompts, agents) is an external git dependency,
pinned in `pyproject.toml` (`echo = { git = ..., tag = "v0.3.10" }`).

End-to-end smoke test (stack running): `uv run python scripts/setup.py --smoke`

## Configuration

Everything is a `.env` variable — see `.env.example` (backend selectors,
execution mode, model providers, feature flags) and `apps/web/.env.example`
(frontend hosts, feature flags, opt-in trackers). v1 ships scribe-only:
non-scribe features (payments, patient directory, records vault, onboarding,
publish integrations, FHIR, streaming) are present in code but disabled by
default.

## Docs

- `docs/architecture.md` — how the pieces fit (pipeline, pluggable layers)
- `deploy/k8s/README.md` — publishing images (`deploy/push.sh`) and deploying
  api + web to Kubernetes
- `CONTRIBUTING.md` — dev workflow
- `claude/onprem-scribe-plan.md` (project docs) — full migration plan & decisions

## License

TBD — not yet public. Before any public release: rotate all keys that ever
lived in ancestor repos, finish the Langfuse prompt/template export, and pick
a license.
