"""
Protocol Routes

FastAPI routers for MedScribeAlliance protocol endpoints.
"""

from .sessions import sessions_router
from .templates import templates_router
from .discovery import discovery_router
from .audio import audio_router
from .patient_summary import patient_summary_router
from .suggested_medications import suggested_medications_router

__all__ = [
    "sessions_router",
    "templates_router",
    "discovery_router",
    "audio_router",
    "patient_summary_router",
    "suggested_medications_router",
]
