"""Google Doc integration — scaffolding only (TODO).

Expected config shape (finalize when implementing):
    {
        "enabled": true,
        "folder_id": "...",
        "share_with": ["email@example.com"]
    }
"""

from typing import Any, Dict

from voice2rx.services.publish.base import (
    BaseIntegration,
    PublishContext,
    PublishResult,
)


class GoogleDocIntegration(BaseIntegration):
    name = "google_doc"

    def publish(self, ctx: PublishContext, cfg: Dict[str, Any]) -> PublishResult:
        # TODO: authenticate via service account, create Doc in folder_id from markdown.
        return PublishResult(
            integration=self.name,
            status="not_implemented",
            error="Google Doc integration is not implemented yet",
        )
