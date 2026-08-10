"""
Protocol Adaptors

Adaptors bridge between the MedScribeAlliance protocol models
and the existing Voice2Rx backend services.

These adaptors are designed to be extensible for future protocol
enhancements while maintaining backward compatibility with current
backend implementation.
"""

from .session_adaptor import SessionAdaptor
from .template_adaptor import TemplateAdaptor
from .audio_adaptor import AudioAdaptor

__all__ = [
    "SessionAdaptor",
    "TemplateAdaptor",
    "AudioAdaptor",
]
