"""
Context DTOs consumed by the agent layer.

The resolver produces a `ResolvedContext` from a transaction's `context` dict.
DTO to build the multimodal `ConversationContext` (text / image / pdf blocks).
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


class ContextItemKind(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    PDF = "pdf"


@dataclass
class PastSessionItem:
    session_date: str
    transcript: str


@dataclass
class ContextDocumentItem:
    kind: ContextItemKind
    document_name: str
    text: Optional[str] = None
    data_base64: Optional[str] = None


@dataclass
class ContextAttachmentItem:
    kind: ContextItemKind
    filename: str
    text: Optional[str] = None
    media_type: Optional[str] = None
    data_base64: Optional[str] = None
    url: Optional[str] = None


@dataclass
class ResolvedContext:
    past_sessions: List[PastSessionItem] = field(default_factory=list)
    documents: List[ContextDocumentItem] = field(default_factory=list)
    attachments: List[ContextAttachmentItem] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (self.past_sessions or self.documents or self.attachments)
