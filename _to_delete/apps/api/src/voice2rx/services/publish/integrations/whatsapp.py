"""WhatsApp integration — scaffolding only (TODO).

Expected config shape (finalize when implementing):
    {
        "enabled": true,
        "content_format": "pdf" | "text",
        "template_id": "...",
        "recipient_field": "patient.phone"
    }
"""

from typing import Any, Dict

from voice2rx.services.publish.base import (
    BaseIntegration,
    PublishContext,
    PublishResult,
)


class WhatsAppIntegration(BaseIntegration):
    name = "whatsapp"

    def publish(self, ctx: PublishContext, cfg: Dict[str, Any]) -> PublishResult:
        # TODO: render PDF / text, resolve recipient phone from transaction context,
        # call WhatsApp provider API with template + media link.
        return PublishResult(
            integration=self.name,
            status="not_implemented",
            error="WhatsApp integration is not implemented yet",
        )
