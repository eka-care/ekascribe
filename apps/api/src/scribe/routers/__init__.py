"""HTTP surface — one router module per domain."""

from fastapi import APIRouter

from .audio import audio_router
from .discovery import discovery_router
from .language_config import language_config_router
from .session_details_router import session_details_router
from .sessions import sessions_router
from .template_api import template_router
from .templates import templates_router
from .transaction_actions import transaction_actions_router
from .transcript_upload import transcript_upload_router

# v2 surface kept: the PATCH callback the pipeline drives.
transaction_router = APIRouter()
transaction_router.include_router(transaction_actions_router)

__all__ = [
    "audio_router",
    "discovery_router",
    "language_config_router",
    "session_details_router",
    "sessions_router",
    "template_router",
    "templates_router",
    "transaction_router",
    "transcript_upload_router",
]
