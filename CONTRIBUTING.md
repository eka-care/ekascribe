# Contributing

## Setup

```bash
uv sync --all-packages && npm install
docker compose -f deploy/docker-compose.yml up -d postgres
make setup
```

## Day-to-day

- `make api` / `make worker` / `make web` — run pieces natively
- `make test` — backend suite (Postgres-dependent tests skip if no DB)
- `make lint` — ruff
- `npm run build --workspace apps/web` — frontend build check

## Ground rules

- Every external dependency goes behind an interface in `packages/core` with
  an on-prem default (`STORAGE_BACKEND` / `DB_BACKEND` / `QUEUE_BACKEND`
  pattern). No hardcoded hosts, buckets, or keys — settings only.
- Feature code is kept, not deleted: gate with `FEATURE_*` (backend) /
  `NEXT_PUBLIC_FEATURE_*` (web).
- No secrets in the repo — `.env` is gitignored; add new vars to
  `.env.example` with safe defaults.
- No real patient audio/data in fixtures — synthetic only
  (`apps/api/scripts/files/synthetic_audio/`).
- Keep the ds-service callback contract (`PATCH /voice/api/v2/transaction`)
  stable; the worker and any external processor depend on it.
