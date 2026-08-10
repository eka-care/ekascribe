import asyncio
from typing import Any, Dict, Optional, Union

from logs.custom_logger import get_logger
from voice2rx.services.webhooks.backends import (
    DeliveryResult,
    MessengerBackend,
    WebhookBackend,
)
from voice2rx.services.webhooks.events import ScribeEvent, build_envelope

logger = get_logger(__name__)


class WebhookDispatcher:
    """Builds the messenger envelope, gates on connect clients, delivers with retry.

    Never raises to callers — failures are logged and reported via DeliveryResult.
    """

    def __init__(
        self,
        backend: Optional[WebhookBackend] = None,
        max_attempts: int = 3,
        backoff_base_seconds: float = 1.0,
    ):
        self.backend = backend or MessengerBackend()
        self.max_attempts = max_attempts
        self.backoff_base_seconds = backoff_base_seconds

    async def dispatch(
        self,
        event_id: Union[str, ScribeEvent],
        *,
        b_id: str,
        c_id: Optional[str],
        txn_id: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> DeliveryResult:
        event_id = getattr(event_id, "value", event_id)
        if not c_id:
            logger.info(
                "WEBHOOK: skipped - not a connect client",
                event_id=event_id,
                txn_id=txn_id,
                b_id=b_id,
            )
            return DeliveryResult(success=False, error="not_connect_client")

        envelope = build_envelope(
            event_id, b_id=b_id, c_id=c_id, txn_id=txn_id, data=data or {}
        )
        return await self._deliver(envelope)

    async def dispatch_raw(
        self, envelope: Dict[str, Any], url_override: Optional[str] = None
    ) -> DeliveryResult:
        """Deliver a pre-built envelope untouched (legacy payload shapes)."""
        if not envelope.get("client_id"):
            logger.info(
                "WEBHOOK: skipped - not a connect client",
                event_id=envelope.get("event_id", ""),
                b_id=envelope.get("business_id", ""),
            )
            return DeliveryResult(success=False, error="not_connect_client")
        return await self._deliver(envelope, url_override=url_override)

    async def _deliver(
        self, envelope: Dict[str, Any], url_override: Optional[str] = None
    ) -> DeliveryResult:
        event_id = envelope.get("event_id", "")
        txn_id = envelope.get("payload", {}).get("transaction_id", "")
        b_id = envelope.get("business_id", "")
        result = DeliveryResult(success=False, error="not_attempted")
        try:
            for attempt in range(1, self.max_attempts + 1):
                result = await self.backend.send(envelope, url_override=url_override)
                result.attempts = attempt
                if result.success:
                    logger.info(
                        "WEBHOOK: delivered",
                        event_id=event_id,
                        txn_id=txn_id,
                        b_id=b_id,
                        status_code=result.status_code,
                        attempts=attempt,
                        severity="medium",
                    )
                    return result
                if attempt < self.max_attempts:
                    await asyncio.sleep(
                        self.backoff_base_seconds * (2 ** (attempt - 1))
                    )
        except Exception as exc:
            result = DeliveryResult(
                success=False, error=str(exc), attempts=result.attempts
            )

        logger.error(
            "WEBHOOK: delivery failed",
            event_id=event_id,
            txn_id=txn_id,
            b_id=b_id,
            status_code=result.status_code,
            error=result.error,
            attempts=result.attempts,
            severity="critical",
        )
        return result
