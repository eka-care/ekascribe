from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class DeliveryResult:
    success: bool
    status_code: Optional[int] = None
    response_body: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    attempts: int = 0


class WebhookBackend(ABC):
    """Delivery transport for webhook envelopes.

    Implementations must never raise from `send` — network/HTTP failures are
    reported through DeliveryResult so the dispatcher can retry.
    """

    name: str = "base"

    @abstractmethod
    async def send(
        self, envelope: Dict[str, Any], url_override: Optional[str] = None
    ) -> DeliveryResult:
        ...
