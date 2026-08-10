"""Notion integration — scaffolding only (TODO).

Expected config shape (finalize when implementing):
    {
        "enabled": true,
        "database_id": "...",
        "token_ref": "secret://notion/<user>"
    }
"""

from typing import Any, Dict

from voice2rx.services.publish.base import (
    BaseIntegration,
    PublishContext,
    PublishResult,
)


class NotionIntegration(BaseIntegration):
    name = "notion"

    def publish(self, ctx: PublishContext, cfg: Dict[str, Any]) -> PublishResult:
        # TODO: resolve Notion token, create page in database_id from markdown.
        return PublishResult(
            integration=self.name,
            status="not_implemented",
            error="Notion integration is not implemented yet",
        )
