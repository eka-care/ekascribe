"""ekascribe API entrypoint — adapted from voice2rx-be main.py.

Differences from upstream:
- settings come from scribe_core (no JSON-blob env loader, no Secrets Manager)
- DevAuthMiddleware reproduces the API-Gateway `jwt-payload` header contract
- removed: telephony, s3-token, eka-usage metering, New Relic
- feature-flagged (off by default): streaming, FHIR/medical-record
"""

from __future__ import annotations

import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from scribe_core.auth import DevAuthMiddleware
from scribe_core.settings import get_settings

from logs.custom_logger import get_logger
from logs.log_config import LOGGING_CONFIG

logging.config.dictConfig(LOGGING_CONFIG)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="ekascribe api", version="0.1.0", lifespan=lifespan)

    from voice2rx.utils.error_handler import (
        pydantic_validation_exception_handler,
        validation_exception_handler,
    )

    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ValidationError, pydantic_validation_exception_handler)

    app.add_middleware(DevAuthMiddleware)
    allowed_regex = r"^https?://.*" if s.env != "prod" else r"^https://.*"
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=allowed_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "OPTIONS", "PATCH", "DELETE"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count", "X-Page-Count"],
        max_age=86400,
    )

    # --- Legacy API routes (v1/v2/v3) --------------------------------------
    from voice2rx.api.endpoints import (
        consent_router,
        integrations_router,
        language_config_router,
        status_api_router_v3,
        swagger_router,
        template_result_router,
        template_router,
        testimonials_router,
        transaction_router,
    )
    from voice2rx.api.endpoints.document_router import document_router
    from voice2rx.api.endpoints.metrics import metrics_router
    from voice2rx.api.endpoints.sessions import session_details_router

    app.include_router(transaction_router, prefix="/voice/api/v2/transaction")
    app.include_router(status_api_router_v3, prefix="/voice/api/v3")
    app.include_router(language_config_router, prefix="/voice/api/v2/config")
    app.include_router(consent_router, prefix="/voice/api/v2/consent")
    app.include_router(metrics_router, prefix="/voice/api/v2/txn-metrics")
    app.include_router(template_router, prefix="/voice/api/v1/template")
    app.include_router(template_result_router, prefix="/voice/api/v1/transaction")
    app.include_router(document_router, prefix="/voice/api/v1")
    app.include_router(session_details_router, prefix="/voice/api/v1")
    app.include_router(integrations_router, prefix="/voice/api/v1/integrations")
    app.include_router(testimonials_router, prefix="/voice/api/v1/testimonials")
    app.include_router(swagger_router, prefix="/voice/api")

    # --- MedScribeAlliance protocol v0.1 ------------------------------------
    from voice2rx.protocol.routes import (
        audio_router,
        discovery_router,
        patient_summary_router,
        sessions_router,
        suggested_medications_router,
    )
    from voice2rx.protocol.routes import templates_router as protocol_templates_router

    app.include_router(discovery_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(sessions_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(audio_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(protocol_templates_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(patient_summary_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(suggested_medications_router, prefix="/voice/v1", tags=["protocol"])

    # --- On-prem additions ---------------------------------------------------
    from scribe_api.account_router import account_router
    from scribe_api.blob_router import blob_router

    app.include_router(account_router, tags=["account"])
    app.include_router(blob_router, prefix="/voice/v1", tags=["blob"])

    # --- AG-UI (in scope for v1) --------------------------------------------
    from voice2rx.api.endpoints.scribe_agent_chat import scribe_agent_chat_router
    from voice2rx.api.endpoints.scribe_agent_runs import scribe_agent_router

    app.include_router(scribe_agent_router, prefix="/voice/v1/scribe/agent", tags=["scribe-agent"])
    app.include_router(scribe_agent_chat_router, prefix="/voice/v1/scribe/agent", tags=["scribe-agent"])

    # --- Feature-flagged routers (off by default) ---------------------------
    if s.feature_fhir:
        from medical_record.apis.fhir_api import medical_record_router

        app.include_router(medical_record_router, prefix="/voice/medical-record/api")

    if s.feature_streaming:
        from voice2rx.streaming.api.stream_session_router import stream_session_router
        from voice2rx.streaming.api.stream_ws_router import stream_ws_router

        app.include_router(stream_session_router, prefix="/voice/v1/stream", tags=["streaming"])
        app.include_router(stream_ws_router, prefix="/voice/v1/stream", tags=["streaming"])

    @app.get("/voice/ping")
    def greet():
        return {"ping": "pong"}

    @app.get("/healthz")
    def healthz():
        return {"status": "ok", "env": s.env}

    logger.info(
        "api configured",
        env=s.env,
        storage=s.storage_backend,
        db=s.db_backend,
        queue=s.queue_backend,
    )
    return app


app = create_app()
