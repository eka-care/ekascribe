# ekascribe

On-prem, self-hostable AI medical scribe: record a consultation → transcribe →
structured clinical note → edit → print/copy. Forked from eka.care's EkaScribe
stack with every cloud dependency made pluggable.

## Stack

| Layer | On-prem default | Alternative |
|---|---|---|
| Database | Postgres (relational tables + JSONB) | DynamoDB (endpoint-overridable) |
| Blob storage | Local filesystem, backend-served URLs | S3 / MinIO / LocalStack |
| Job queue | procrastinate (same Postgres) | SQS |
| STT | Sarvam (bring your key) | Deepgram / OpenAI / Gemini via echo |
| LLM | Any OpenAI-compatible endpoint (vLLM / Ollama) | OpenAI / Anthropic / Bedrock / Gemini |
| Prompts | Files in `prompts/` | Langfuse |
| Auth (v1) | Dev-token (`DEV_AUTH_TOKEN`) | proper login — phase 2 |

## Layout

```
apps/api          FastAPI backend (voice2rx-be fork)
apps/worker       Pipeline worker: chunk STT, stitching, structuring
apps/web          Next.js app (ekascribe-web fork)
packages/core     scribe_core: settings, auth, storage, db, queue, logging
packages/echo     echo SDK (STT + LLM providers, prompts, agents)
packages/scribe-client-sdk  Vendored frontend SDKs (see its README)
packages/ui-lib   Design components (inlined)
prompts/          Agent prompts (file provider)
templates/        Seed sections + default templates
scripts/setup.py  One-command init: .env, checks, migrations, seeds, smoke
deploy/           Dockerfiles + docker-compose (+ AWS/LocalStack overlay)
```

## Quick start

```bash
# 1. install
uv sync --all-packages     # python workspace
npm install                # web workspace

# 2. database (skip if you have Postgres)
docker compose -f deploy/docker-compose.yml up -d postgres

# 3. init: .env with generated secrets, schema, seeds, checks
make setup                 # edit .env for SARVAM_API_KEY / ECHO_LLM_BASE_URL, re-run

# 4. run
make api                   # http://localhost:8000
make worker                # pipeline consumer
make web                   # http://localhost:3000

# or everything in containers:
docker compose -f deploy/docker-compose.yml up --build
```

End-to-end smoke test (api + worker running): `uv run python scripts/setup.py --smoke`

## Configuration

Everything is a `.env` variable — see `.env.example` (backend selectors,
model providers, feature flags) and `apps/web/.env.example` (frontend hosts,
feature flags, opt-in trackers). v1 ships scribe-only: non-scribe features
(payments, patient directory, records vault, onboarding, publish integrations,
FHIR, streaming) are present in code but disabled by default.

## Docs

- `docs/architecture.md` — how the pieces fit (pipeline, pluggable layers)
- `CONTRIBUTING.md` — dev workflow
- `claude/onprem-scribe-plan.md` (project docs) — full migration plan & decisions

## License

TBD — not yet public. Before any public release: rotate all keys that ever
lived in ancestor repos, finish the Langfuse prompt/template export, and pick
a license.
