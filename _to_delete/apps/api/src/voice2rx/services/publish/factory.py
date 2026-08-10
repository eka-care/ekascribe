"""Integration registry + factory.

Adds an integration: import it, append to INTEGRATIONS. The orchestrator calls
`create_enabled(config)` which walks the config map and yields
`(integration_instance, subcfg)` tuples for every entry whose `enabled` is truthy.
"""

from typing import Any, Dict, Iterable, Tuple, Type

from voice2rx.services.publish.base import BaseIntegration
from voice2rx.services.publish.integrations.emr_webhook import EMRWebhookIntegration
from voice2rx.services.publish.integrations.google_doc import GoogleDocIntegration
from voice2rx.services.publish.integrations.notion import NotionIntegration
from voice2rx.services.publish.integrations.whatsapp import WhatsAppIntegration


INTEGRATIONS: Dict[str, Type[BaseIntegration]] = {
    EMRWebhookIntegration.name: EMRWebhookIntegration,
    WhatsAppIntegration.name: WhatsAppIntegration,
    GoogleDocIntegration.name: GoogleDocIntegration,
    NotionIntegration.name: NotionIntegration,
}


def create_enabled(
    integrations_cfg: Dict[str, Dict[str, Any]],
) -> Iterable[Tuple[BaseIntegration, Dict[str, Any]]]:
    """Yield (integration, subcfg) pairs for every enabled entry in `integrations_cfg`."""
    for name, subcfg in (integrations_cfg or {}).items():
        if not isinstance(subcfg, dict) or not subcfg.get("enabled"):
            continue
        cls = INTEGRATIONS.get(name)
        if cls is None:
            continue
        yield cls(), subcfg
