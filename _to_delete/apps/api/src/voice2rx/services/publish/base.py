"""Core abstractions for the publish pipeline.

Each integration (EMR webhook, WhatsApp, Google Doc, Notion, ...) implements
`BaseIntegration.publish()` and is wired into `factory.INTEGRATIONS`.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar, Dict, Literal, Optional


PublishStatus = Literal["success", "failed", "skipped", "not_implemented"]


@dataclass
class PublishContext:
    """Runtime context shared across integrations for a single publish call."""

    document: Dict[str, Any]
    transaction: Dict[str, Any]
    session_id: str
    encounter_id: str
    b_id: str
    uuid: str
    oid: str
    jwt_payload: Dict[str, Any]
    client_id: str


@dataclass
class PublishResult:
    """Per-integration outcome returned by `BaseIntegration.publish()`."""

    integration: str
    status: PublishStatus
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


class BaseIntegration(ABC):
    """Abstract base for publish integrations."""

    name: ClassVar[str]

    @abstractmethod
    def publish(self, ctx: PublishContext, cfg: Dict[str, Any]) -> PublishResult:
        """Execute the integration and return a PublishResult."""
