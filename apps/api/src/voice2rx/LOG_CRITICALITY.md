# Log Criticality Map (New Relic monitoring guide)

This doc explains the `severity="critical"` / `severity="medium"` / `severity="low"` field
added to logger calls across `voice2rx/`. They tell you **which logs deserve New Relic alerts vs.
dashboards vs. noise**, so you can wire alert conditions to the right severity.

## How to read the field

Each notable logger call now carries a `severity=` keyword argument, e.g.:

```python
logger.error("eka_usage_sdk error", error=str(exc), ctx=ctx, severity="critical")  # usage metering failure, revenue leak
logger.warning("Skipping non-numeric file", filename=filename, severity="medium")   # skipping non-numeric file
logger.error("swagger spec missing", severity="low")                                # swagger spec missing
```

Because `severity` is a real structured field, it flows into New Relic as an attribute you can
filter and alert on directly (`WHERE severity = 'critical'`), rather than something you have to grep for.

Grep the source any time:

```bash
grep -rnE 'severity="(critical|medium|low)"' voice2rx --include=*.py
grep -rn  'severity="critical"' voice2rx --include=*.py   # just the alert-worthy ones
```

## What was marked (and what wasn't)

Only **notable** loggers carry a `severity=` field: **every** `logger.error` / `logger.exception` /
`logger.critical`, **every** `logger.warning`, and the `logger.info` calls that mark a
real business milestone (transaction lifecycle, audio uploaded, result/document persisted,
external publish outcome, usage metered). Routine `info`/`debug` tracing ("received
request", "building prompt", per-loop chatter, startup/registration) was intentionally
**left unmarked** to keep the signal clean.

| Level | Count | Meaning for New Relic |
|-------|-------|-----------------------|
| **critical** | 145 | Page/alert. Failure or loss on a core clinical or money surface. |
| **medium**   | 292 | Dashboard / trend / warning threshold. Recoverable or degraded. |
| **low**      | 10  | Ignore or low-priority. Notable but no real impact. |
| **Total**    | 447 | Across 92 files. |

## The rubric used

**critical** — something on a core clinical-data or revenue path failed or was lost, and it
needs a human:
- **Billing / usage metering** failures (revenue leak).
- **Transaction lifecycle** failures — init / commit / stop, and their persistence.
- **Audio loss** — capture, upload, chunking, or combine failures (audio = the raw clinical input).
- **Clinical output loss** — result/document/template generation or persistence failures.
- **External delivery loss** — publishing the patient record to EMR / FHIR / vault fails.
- **Unhandled 5xx** exceptions in a core request path; auth/data-integrity failures.

**medium** — recoverable or degraded, worth watching as a trend but not paging:
- All `warning`s (fallbacks, retries, validation, not-found, missing-optional-data).
- Non-core external calls failing (hub, suggested-meds, patient-summary enrichment).
- Best-effort reads, parse fallbacks, business milestones that *succeeded*.

**low** — notable but low impact (e.g. Swagger/docs rendering errors, cosmetic paths).

## Where the CRITICAL logs live (the 145 alert-worthy ones)

Grouped by domain, with the hottest files. These are the surfaces to build alert
conditions around.

### 1. Billing / usage metering — revenue leak
- `voice2rx/utils/eka_usage_client.py` — metering call failure, pending usage events lost,
  usage-record failure. **Directly loses billable events.**

### 2. Transaction lifecycle — core money + clinical entry point
- `voice2rx/api/endpoints/transactions/` — `init_router.py`, `commit_router.py`,
  `stop_router.py`, `transaction_actions.py` (unhandled exceptions on init/commit/stop,
  SQS dispatch failure), `handlers/request_handler.py` (paid-user claim parse failure).
- `voice2rx/services/transactions/transaction_service.py` — documents missing on commit,
  SQS/SNS dispatch failures, background S3 processing failure, template-results persistence failure.

### 3. Audio — data loss (the raw clinical input)
- `voice2rx/services/transactions/combine_audios.py` — upload failures, "no audio files
  found", combined-audio upload / credential / AWS failures.
- `voice2rx/services/transactions/audio_service.py` — audio metadata persistence failures.
- `voice2rx/model_orms/audio_details_orm.py` — audio write/update failures.
- `voice2rx/streaming/api/stream_ws_router.py` — WS rejected (audio lost), live stream
  error, final chunk lost, session commit lost.
- `voice2rx/protocol/routes/audio.py`, `protocol/adaptors/audio_adaptor.py`,
  `protocol/services/s3_async_service.py` — chunk upload / async S3 write failures.
- `voice2rx/telephony/api/webhook_router.py` — inbound call dropped, call audio dropped.

### 4. Clinical output generation & persistence
- `voice2rx/services/templates/agent_orchestration_service.py` — agent processing /
  translation / run crash that drops the template output.
- `voice2rx/services/templates/conversion_pipeline.py` — pipeline crash, failure-status write failure.
- `voice2rx/services/templates/template_result_file_service.py` — transcript/template
  read & write failures.
- `voice2rx/services/templates/template_service.py` — duplicate-templates integrity,
  template fetch failure blocking generation.
- `voice2rx/services/templates/ag_ui/run_service.py`, `ag_ui/tools/save_scribe_state.py` —
  scribe result-state write failures.
- `voice2rx/services/documents/populate_documents_service.py`,
  `services/documents/document_service.py` — document populate / S3 write / status-update failures.
- `voice2rx/api/endpoints/template_result.py`, `result_router.py`, `document_router.py`,
  `consent_api.py`, `s3_token.py`, `scribe_agent_runs.py`, `scribe_agent_chat.py` —
  generation / retrieval / write / token-issuance failures on clinical endpoints.

### 5. External delivery of the patient record
- `voice2rx/services/publish/publish_service.py` — config load failure blocks all publishing;
  integration delivery raised.
- `voice2rx/services/publish/integrations/emr_webhook.py` — EMR/vault delivery + webhook failures.
- `voice2rx/services/messaging/webhook.py` — webhook delivery failures.
- `voice2rx/services/messaging/process_fhir_data.py` — FHIR ingest HTTP/network/timeout
  failures, source download failure, processing failure.

### 6. Persistence layer (DynamoDB ORMs)
- `voice2rx/model_orms/base_orm.py` — write / update / delete failures.
- `voice2rx/model_orms/transaction_orm.py`, `document_orm.py`, `document_tiptap_orm.py`,
  `template_result_orm.py`, `transaction_template_orm.py` — write/update/delete failures on
  transaction, document, and template-result items. (Read failures were graded **medium**.)

### 7. Other core paths
- `voice2rx/utils/error_handler.py` — unhandled **5xx** server errors (validation 4xx = medium).
- `voice2rx/services/config_service.py` — config init/read/write failures that block runs.
- `voice2rx/services/context/context_resolution_service.py` — **patient-id mismatch** (potential
  data leak across patients).
- `voice2rx/services/patient_summary_service.py` — summary generation failure.
- `voice2rx/protocol/routes/sessions.py`, `protocol/adaptors/session_adaptor.py` — session
  create/end/update failures; transcript decode corrupting clinical data.
- `voice2rx/agents/medication_agent.py` — medication output dropped.

## Notable MEDIUM patterns (dashboards, not pages)

- **All warnings** — fallbacks (prompt fallback in `services/prompts/*`), validation,
  not-found, missing-optional-data, degraded downloads.
- **Parse fallbacks** — `commit_at`/`created_at`/`additional_data` parsing in
  `services/transactions/result_service*.py`.
- **Non-core external enrichment** — `services/hub_client.py`,
  `services/suggested_medication_service.py`, `services/patient_summary_service.py`
  (Lucid/Alchemist calls) — these fall back gracefully.
- **DynamoDB read failures** — graded medium (a retry/refresh usually recovers), vs.
  write/update/delete which are critical.
- **Business milestones that succeeded** — "committed", "session created", "document
  persisted", "published to EMR" — useful as throughput/success counters.

## LOW (10 total)

Almost entirely `voice2rx/api/endpoints/swagger_docs.py` (spec-missing / render errors) plus
one best-effort debug PDF write and a debug-dump write failure in `ag_ui/run_service.py`.
Safe to ignore for alerting.

## Suggested New Relic wiring

1. **Alert (page)** on any log with `severity = 'critical'` in domains 1–5 above — especially
   `eka_usage_client`, `combine_audios`, `stream_ws_router`, `emr_webhook`,
   `process_fhir_data`, and unhandled 5xx from `error_handler`.
2. **Warning threshold** on rate spikes of `severity = 'medium'` (e.g. prompt-fallback rate, parse-fallback
   rate, DynamoDB read-failure rate) — a rising trend is an early warning.
3. **Dashboards/counters** from milestone `info` logs (commits, sessions, publishes) to track
   throughput and success ratio.
4. **Drop / low-sample** the `severity = 'low'` logs.

> `severity` reflects impact, not log level: a `logger.error` can be `severity="medium"` (e.g. a
> recoverable read that retries) and a `logger.info` can be `severity="critical"`-adjacent context.
> Trust the `severity` field, not just the Python log method.
