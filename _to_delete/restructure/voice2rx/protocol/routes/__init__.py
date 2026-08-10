"""Protocol route routers."""

from .sessions import sessions_router
from .templates import templates_router
from .discovery import discovery_router
from .audio import audio_router

__all__ = [
    "sessions_router",
    "templates_router",
    "discovery_router",
    "audio_router",
]
