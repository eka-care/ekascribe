"""scribe API entrypoint.

Differences from upstream:
- settings come from scribe_core (no JSON-blob env loader, no Secrets Manager)
- CookieAuthMiddleware reproduces the API-Gateway `jwt-payload` header contract
- removed: telephony, s3-token, usage metering, New Relic, streaming, FHIR,
  publish/webhooks/consent/metrics/testimonials/integrations, agents
"""

from __future__ import annotations

import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from scribe_core.auth import CookieAuthMiddleware
from scribe_core.settings import get_settings

from scribe.core.custom_logger import get_logger
from scribe.core.log_config import LOGGING_CONFIG

logging.config.dictConfig(LOGGING_CONFIG)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # In-process background job runner (EXECUTION_MODE=inprocess): runs the
    # scribe pipeline in this process instead of a separate procrastinate worker.
    s = get_settings()
    if s.execution_mode == "inprocess":
        import asyncio

        from scribe.pipeline.runner import get_background_runner

        get_background_runner().start(asyncio.get_running_loop())
        logger.info("in-process background job runner enabled")

    # Uploads that bypass the API can't trigger per-chunk STT while the session
    # is live (the hook lives in the blob-upload route), so say so loudly once
    # rather than leaving it to be rediscovered from timings.
    if s.storage_backend == "s3" and not s.blob_via_api:
        logger.warning(
            "live per-chunk transcription is DISABLED: STORAGE_BACKEND=s3 with "
            "BLOB_VIA_API unset means the browser uploads straight to the "
            "bucket, so the API never sees a chunk land. Sessions still work — "
            "all transcription happens at commit. Set BLOB_VIA_API=true to "
            "route uploads through the API and transcribe chunks as they arrive.",
            severity="medium",
        )
    yield
    if get_settings().execution_mode == "inprocess":
        from scribe.pipeline.runner import get_background_runner

        get_background_runner().shutdown()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="scribe api", version="0.1.0", lifespan=lifespan)

    from scribe.core.error_handler import (
        pydantic_validation_exception_handler,
        validation_exception_handler,
    )

    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ValidationError, pydantic_validation_exception_handler)

    # One auth path everywhere — no AUTH_MODE switch, no fake identities.
    app.add_middleware(CookieAuthMiddleware)
    # app://ekascribe = the Electron desktop app's custom-protocol origin
    allowed_regex = (
        r"^(https?://.*|app://ekascribe)$"
        if s.env != "prod"
        else r"^(https://.*|app://ekascribe)$"
    )

    # app://ekascribe
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
    from scribe.routers import (
        language_config_router,
        template_router,
        transaction_router,
        transcript_upload_router,
    )
    from scribe.routers.document_router import document_router
    from scribe.routers import session_details_router

    app.include_router(transaction_router, prefix="/voice/api/v2/transaction")
    app.include_router(transcript_upload_router, prefix="/voice/api/v1/transaction")
    app.include_router(language_config_router, prefix="/voice/api/v2/config")
    app.include_router(template_router, prefix="/voice/api/v1/template")
    app.include_router(document_router, prefix="/voice/api/v1")
    app.include_router(session_details_router, prefix="/voice/api/v1")

    # --- MedScribeAlliance protocol v0.1 ------------------------------------
    from scribe.routers import (
        audio_router,
        discovery_router,
        sessions_router,
    )
    from scribe.routers import templates_router as protocol_templates_router

    app.include_router(discovery_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(sessions_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(audio_router, prefix="/voice/v1", tags=["protocol"])
    app.include_router(protocol_templates_router, prefix="/voice/v1", tags=["protocol"])

    # --- On-prem additions ---------------------------------------------------
    from scribe.routers.account_router import account_router
    from scribe.routers.auth_routes import auth_router
    from scribe.routers.oidc_routes import oidc_router
    from scribe.routers.blob_router import blob_router

    app.include_router(account_router, tags=["account"])
    app.include_router(auth_router, prefix="/connect-auth/v1", tags=["auth"])
    # SSO routes live at the app root — /{oidc|oauth}/{provider}/… — so the
    # callback URLs registered at each IdP stay short and conventional.
    # Registered before the web-static catch-all, so they take precedence.
    app.include_router(oidc_router, tags=["auth"])

    from scribe.routers.device_auth_routes import device_auth_router

    app.include_router(
        device_auth_router, prefix="/connect-auth/v1/device", tags=["auth"]
    )
    app.include_router(blob_router, prefix="/voice/v1", tags=["blob"])

    # --- AG-UI (in scope for v1) --------------------------------------------
    from scribe.routers.scribe_agent_chat import scribe_agent_chat_router
    from scribe.routers.scribe_agent_runs import scribe_agent_router

    app.include_router(
        scribe_agent_router, prefix="/voice/v1/scribe/agent", tags=["scribe-agent"]
    )
    app.include_router(
        scribe_agent_chat_router, prefix="/voice/v1/scribe/agent", tags=["scribe-agent"]
    )

    @app.get("/voice/ping")
    def greet():
        return {"ping": "pong"}

    @app.get("/healthz")
    def healthz():
        return {"status": "ok", "env": s.env}

    # --- Web UI (static Next.js export) — must be registered LAST so the
    # catch-all never shadows API routes.
    if s.web_dist_dir:
        from scribe.web_static import mount_web_static

        mount_web_static(app, s.web_dist_dir)

    logger.info(
        "api configured",
        env=s.env,
        storage=s.storage_backend,
        execution_mode=s.execution_mode,
    )
    return app


app = create_app()
