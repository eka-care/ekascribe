import os
from typing import Any, Dict, Optional

import httpx

from logs.custom_logger import get_logger
from voice2rx.services.webhooks.backends.base import DeliveryResult, WebhookBackend

logger = get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS = 10.0
PROD_MESSENGER_URL = "http://messenger.orbi.orbi/internal/v1/webhook"
DEV_MESSENGER_URL = "http://messenger.orbi.dev/internal/v1/webhook"


def get_messenger_url() -> str:
    # resolved lazily on every send — env_loader may populate os.environ after
    # this module is imported
    override = os.getenv("MESSENGER_WEBHOOK_URL", "")
    if override:
        return override
    if os.getenv("ENV", "").lower() == "prod":
        return PROD_MESSENGER_URL
    return DEV_MESSENGER_URL


class MessengerBackend(WebhookBackend):
    """POSTs envelopes to the internal messenger fan-out service."""

    name = "messenger"

    def __init__(
        self,
        url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        self._url = url
        self.timeout = timeout

    async def send(
        self, envelope: Dict[str, Any], url_override: Optional[str] = None
    ) -> DeliveryResult:
        url = url_override or self._url or get_messenger_url()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=envelope)
        except httpx.HTTPError as exc:
            return DeliveryResult(success=False, error=str(exc))
        except Exception as exc:
            return DeliveryResult(success=False, error=str(exc))

        try:
            response_body = response.json()
        except ValueError:
            response_body = {"raw_text": response.text} if response.text else {}

        return DeliveryResult(
            success=200 <= response.status_code < 300,
            status_code=response.status_code,
            response_body=response_body,
        )
