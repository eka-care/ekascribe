# ekascribe on Kubernetes

Flat manifests for the api + web services in namespace `eka-care`. Plain
`kubectl` — no kustomize, no Helm.

**What this does not deploy:** Postgres (bring your own managed database), the
pipeline worker, and any ingress. Access is via `kubectl port-forward`.

| File | What |
|---|---|
| `00-namespace.yaml` | Namespace `eka-care` |
| `01-configmap.yaml` | Non-secret config (mirrors `.env.example`) |
| `02-secret.yaml.example` | `DATABASE_URL`, API keys — template, not applied |
| `03-regcred.yaml.example` | Docker Hub pull credential — template, not applied |
| `04-migrate-job.yaml` | Schema + seed data, run once before the workloads |
| `10-` / `11-` | api Deployment + ClusterIP Service |
| `20-` / `21-` | web Deployment + ClusterIP Service |

Numeric prefixes exist so `kubectl apply -f .` applies in dependency order.

## Deploy

Push images first (see `deploy/push.sh`), then:

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
```

Create the two credentials directly against the cluster so nothing real lands
in the repo. Use a Docker Hub **access token**, not your password:

```bash
kubectl create secret docker-registry ekascribe-regcred -n eka-care --docker-server=https://index.docker.io/v1/ --docker-username=YOUR_USER --docker-password=YOUR_ACCESS_TOKEN
```

```bash
kubectl create secret generic ekascribe-secrets -n eka-care --from-literal=DATABASE_URL='postgresql://user:pass@host:5432/scribe' --from-literal=ECHO_PG_PASSWORD='pass' --from-literal=ANTHROPIC_API_KEY='...' --from-literal=SARVAM_API_KEY='...' --from-literal=UPLOAD_URL_SIGNING_SECRET="$(openssl rand -hex 32)"
```

Edit `ECHO_PG_HOST` in `01-configmap.yaml` to match your database, then apply
everything else:

```bash
kubectl apply -f deploy/k8s/
```

The two secret templates end in `.yaml.example`, not `.yaml`, specifically so
this directory apply skips them — otherwise it would overwrite the credentials
you just created with `REPLACE_ME` placeholders. If you would rather fill in
the files than use `kubectl create secret`, copy one to a `.yaml` name, edit it,
apply it explicitly, and keep it out of commits.

Wait for the migration to finish before trusting the api:

```bash
kubectl -n eka-care wait --for=condition=complete job/ekascribe-migrate --timeout=300s
```

## Access

No ingress — everything is ClusterIP:

```bash
kubectl -n eka-care port-forward svc/ekascribe-api 8000:8000
```

```bash
kubectl -n eka-care port-forward svc/ekascribe-web 3000:3000
```

`curl localhost:8000/healthz` should return `{"status":"ok","env":"prod"}`.

## Pinning image tags

Manifests default to `api-latest` / `web-latest` with `imagePullPolicy: Always`
so a fresh `apply` picks up whatever was pushed last. For anything you care
about, pin the immutable sha tag — `deploy/push.sh` prints these commands:

```bash
kubectl -n eka-care set image deploy/ekascribe-api api=ekacare/ekascribe:api-1a2b3c4
```

## S3 permissions the migrate Job needs

Verified against the real bucket, not assumed. `setup.py`'s storage probe does
a put → get → exists → **delete** round trip, and it exits 1 if any step fails.
`s3:DeleteObject` is therefore required, not optional — a role with only
read/write passes three steps and then fails the Job:

```
[ok]   postgres reachable
[FAIL] storage: An error occurred (AccessDenied) when calling the DeleteObject operation
[ok]   app schema (tables + indexes)
[ok]   procrastinate schema applied
[ok]   seeded 0 sections, 5 templates
Completed with issues: storage
```

Note what that output means: the schema and seeds **succeeded**. The app would
run fine. But the Job still exits 1, retries to `backoffLimit`, ends up
`Failed`, and `kubectl wait --for=condition=complete` times out — so a working
deployment looks broken.

The pod identity (IRSA, instance role, or static keys) needs at least:

```
s3:PutObject, s3:GetObject, s3:DeleteObject   on   arn:aws:s3:::voice-records/*
s3:ListBucket                                 on   arn:aws:s3:::voice-records
```

The probe writes to `_setup/probe.txt` in a **hardcoded** bucket named
`voice-records` — it ignores `S3_BUCKET`. If your bucket is named something
else, grant the probe permissions on `voice-records` too, or run the Job once
with `STORAGE_BACKEND=local` (schema and seeds do not touch S3) and rely on the
api pod to surface real storage problems.

## Two things that will bite you

**1. `SELF_URL` is in-cluster, `API_BASE_URL` is browser-facing.**
`SELF_URL` points at `ekascribe-api.eka-care.svc.cluster.local:8000` because the
pipeline PATCHes its own API over it
(`apps/api/src/voice2rx/background/pipeline.py`). Repointing it at a public
hostname sends in-cluster traffic out and back in, and breaks entirely while
access is port-forward only. When the API gets a real hostname, change
`API_BASE_URL` instead — the discovery doc and session helpers check it first
and only fall back to `SELF_URL`.

**2. The api runs a single replica on purpose.**
`EXECUTION_MODE=inprocess` runs the scribe pipeline as background jobs inside
the API process (`background/runner.py`). Jobs live in that process's memory:
they are not durable across restarts, and `UVICORN_WORKERS` must stay at 1 so a
job stays visible to the process that scheduled it. Scaling `replicas` up does
not distribute work — it creates several independent job runners. To scale or
get durable retries, switch to `EXECUTION_MODE=worker` and add a worker
Deployment running `deploy/Dockerfile.worker`.

Job *status* reads are unaffected — those go through Postgres, not memory.

## Re-running the migration

Job specs are mostly immutable, so re-applying after an image change fails:

```bash
kubectl -n eka-care delete job ekascribe-migrate --ignore-not-found && kubectl apply -f deploy/k8s/04-migrate-job.yaml
```

## Troubleshooting

`ImagePullBackOff` / `pull access denied` — the pull secret is missing, wrong,
or in the wrong namespace (secrets are namespaced; one in `default` won't be
found). Verify it independently:

```bash
kubectl -n eka-care run pullcheck --rm -i --restart=Never --image=ekacare/ekascribe:api-latest --overrides='{"spec":{"imagePullSecrets":[{"name":"ekascribe-regcred"}]}}' --command -- /app/.venv/bin/python -c "print('pull ok')"
```

The migrate Job does more than migrate — `setup.py` also probes the database,
does a real write/read/delete against S3, applies the schemas, seeds templates,
and round-trips a job through the queue. Any one failing exits 1, so the Job is
a genuine end-to-end config check. It names the failing step:

```bash
kubectl -n eka-care logs job/ekascribe-migrate
```

- `[FAIL] postgres` / `Database unreachable` → `DATABASE_URL` in the Secret.
- `[FAIL] storage` → S3 credentials or bucket. Note that the storage probe in
  `scripts/setup.py` writes to a **hardcoded** bucket named `voice-records`,
  not to whatever `S3_BUCKET` says. If you point `S3_BUCKET` somewhere else,
  the probe still expects `voice-records` to exist and be writable.
- `[FAIL] queue` → the procrastinate schema didn't apply; usually a database
  permissions problem.

Confirm the api came up in the expected mode:

```bash
kubectl -n eka-care logs deploy/ekascribe-api | grep -i "background job runner\|api configured"
```
