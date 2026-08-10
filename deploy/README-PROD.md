# Production deployment — third-party server

Everything needed to stand up ekascribe on a fresh Linux VM you don't control
the rest of (a "third-party" / customer server), using
`deploy/docker-compose-prod.yml`. This doc consolidates what is otherwise
spread across `.env.example`, the header comment of
`deploy/docker-compose-prod.yml`, and the Dockerfiles.

---

## 1. What must be installed on the server

| Requirement | Why | Verify |
|---|---|---|
| Docker Engine 24+ | runs all services | `docker --version` |
| Docker Compose v2 | `docker compose` (plugin, not `docker-compose` v1) | `docker compose version` |
| git | clone this repo | `git --version` |
| ~10 GB free disk | images + Postgres data + audio storage volumes | `df -h /var/lib/docker` |
| Open port 8000 (to your reverse proxy only) | API + web UI | `ss -ltn` |

**Only needed if you run `scripts/setup.py` natively** (option B in §4):

| Requirement | Verify |
|---|---|
| Python 3.11+ | `python3 --version` |
| [uv](https://docs.astral.sh/uv/) | `uv --version` |

**Outbound network access required at build time** (one-time, per build):

- `github.com` — the `echo` dependency installs from
  `git+https://github.com/eka-care/echo-sdk.git` (public repo, no credentials
  needed), pinned by tag in the root `pyproject.toml`
- `pypi.org`, `registry.npmjs.org`, `ghcr.io` (uv binary), Docker Hub

**Outbound network access required at runtime:**

- Your STT provider (`api.sarvam.ai` by default)
- Your LLM provider (`api.anthropic.com` by default, or nothing if you point
  `ECHO_LLM_BASE_URL` at an on-prem vLLM/Ollama)

**Not needed on the server:** Node, Python packages, ffmpeg, Postgres — all
live inside the containers. TLS is also not handled by this stack: the compose
file publishes plain HTTP on `:8000` (API + web UI in one container) and expects the
server's own reverse proxy / infra SSL in front.

---

## 2. Environment changes for prod (`.env`)

All app configuration lives in **one file: `.env` at the repo root** (copied
from `.env.example`). The api and worker containers load it via `env_file:`;
the compose file then overrides a few values (`DATABASE_URL`, `ECHO_PG_HOST`,
`STORAGE_ROOT`) to point at the in-network Postgres and the Docker volume —
you do not set those for the containers.

Change these from the `.env.example` defaults:

| Variable | Local default | Prod value |
|---|---|---|
| `ENV` | `local` | `prod` (compose defaults it to `prod` if unset) |
| `SELF_URL` | `http://localhost:8000` | `https://<your-api-domain>` |
| `EXECUTION_MODE` | `inprocess` | keep `inprocess` for a single clinic; `worker` for high concurrency (see §5) |
| `UVICORN_WORKERS` | `1` | keep `1` for inprocess; raise only in worker mode |
| `DEV_B_ID` / `DEV_OID` / `DEV_UUID` | onprem placeholders | set to the workspace/doctor identity you want records attributed to |
| `DISCOVERY_SUPPORT_EMAIL` | `admin@example.com` | real support address |
| `DATABASE_URL` | `...@127.0.0.1:5432/scribe` | leave as-is with host `127.0.0.1` — this is what **native** `setup.py` runs use; containers get their own value from compose |
| `ECHO_PG_HOST` | `127.0.0.1` | leave as-is (same reason) |

> The web bundle uses relative URLs (same origin as the API), so **nothing is
> baked in at build time** — changing the domain only means updating `SELF_URL`
> and restarting; no rebuild.

---

## 3. Secrets — full checklist

Everything secret lives in `.env` **except the Postgres password** (see the
last row). Change every one of these before go-live:

| Secret | Where | What to do |
|---|---|---|
| `UPLOAD_URL_SIGNING_SECRET` | `.env` | Replace `change-me`. `scripts/setup.py` auto-generates one when it creates `.env`; otherwise `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `DEV_AUTH_TOKEN` | `.env` | **Required in prod.** With `AUTH_MODE=dev`, this token is the only thing gating the API — if unset, all requests authenticate as the dev identity. `setup.py` generates one; hand it to the client apps as their bearer token |
| `SARVAM_API_KEY` (or `DEEPGRAM_API_KEY`) | `.env` | STT key for the provider in `ECHO_DEFAULT_TRANSCRIBER_PROVIDER` |
| `ANTHROPIC_API_KEY` (or `ECHO_LLM_API_KEY`) | `.env` | LLM key for the provider in `ECHO_DEFAULT_LLM_PROVIDER` |
| `ECHO_PG_PASSWORD` | `.env` | Must match the Postgres password (below) |
| Postgres password (`scribe`) | **hardcoded in `deploy/docker-compose-prod.yml`** | Appears in three places: `POSTGRES_PASSWORD` on the postgres service and inside the `DATABASE_URL` of both api and worker services. Postgres only listens on the VM's loopback (`127.0.0.1:5432`), so it is not reachable from outside — but on a third-party server you should still change it: edit all three occurrences (plus `DATABASE_URL`/`ECHO_PG_PASSWORD` in `.env` for native setup runs) **before the first `up`**, since Postgres sets the password only on first volume init |

So: **no, it is not currently all in one place** — `.env` holds everything
except the DB password, which lives in the compose file. Treat both files as
sensitive; neither `.env` nor a modified compose file should be committed.

---

## 4. Deployment steps

```bash
git clone <this-repo> && cd ekascribe

# 1. Create and fill .env
cp .env.example .env          # or let setup.py generate it with fresh secrets
$EDITOR .env                  # §2 changes + §3 secrets

# 2. Clear any previous stack (first deploy on a reused VM only — DESTROYS old data)
docker compose -f deploy/docker-compose-prod.yml down -v --remove-orphans

# 3. Build (needs outbound network; the web UI is built into the api image)
docker compose -f deploy/docker-compose-prod.yml build

# 4. Start Postgres alone
docker compose -f deploy/docker-compose-prod.yml up -d postgres

# 5. Initialize: schema, queue schema, 3 seed templates, workspace config
#    Option A (no Python needed on host) — run inside the api image:
docker compose -f deploy/docker-compose-prod.yml run --rm \
  api uv run python scripts/setup.py --non-interactive --skip-model-check --no-serve-check
#    Option B (host has uv + Python 3.11) — DATABASE_URL in .env must point at 127.0.0.1:
uv run python scripts/setup.py

# 6. Start everything
docker compose -f deploy/docker-compose-prod.yml up -d
```

`setup.py` is idempotent — safe to re-run. It also probes DB, storage, queue,
prompts, and (without `--skip-model-check`) pings the STT and LLM providers.

---

## 5. Worker mode (optional)

Default `inprocess` mode runs the pipeline inside the api container — no worker.
For high concurrency:

1. In `.env`: `EXECUTION_MODE=worker`, `UVICORN_WORKERS=4`
2. `docker compose -f deploy/docker-compose-prod.yml --profile worker up -d --build`

---

## 6. Post-deploy verification

```bash
docker compose -f deploy/docker-compose-prod.yml ps            # all healthy/running
curl -s http://127.0.0.1:8000/healthz                          # api health
curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" http://127.0.0.1:8000/voice/ping
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/   # web UI up (200)
docker compose -f deploy/docker-compose-prod.yml logs -f api   # watch logs
```

Then from a browser via your real domains: load the web UI, record a short test
session, and confirm a structured note comes back (exercises STT + LLM keys
end-to-end). Or run `uv run python scripts/setup.py --smoke` against the
running stack.

Data lives in three named Docker volumes — `pgdata` (database), `storage`
(audio + artifacts), `logs`. Back up `pgdata` and `storage`; `down -v` deletes
them.
