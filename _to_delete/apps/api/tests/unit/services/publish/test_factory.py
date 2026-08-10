"""Unit tests for publish.factory: only enabled entries yield integrations."""

from voice2rx.services.publish import factory
from voice2rx.services.publish.integrations.emr_webhook import EMRWebhookIntegration


class TestCreateEnabled:
    def test_skips_disabled_and_unknown_entries(self):
        cfg = {
            "emr_webhook": {"enabled": True},
            "whatsapp": {"enabled": False},
            "unknown_integration": {"enabled": True},
            "not_a_dict": "value",
        }

        created = list(factory.create_enabled(cfg))

        assert len(created) == 1
        integration, subcfg = created[0]
        assert isinstance(integration, EMRWebhookIntegration)
        assert subcfg == {"enabled": True}

    def test_empty_or_none_config(self):
        assert list(factory.create_enabled({})) == []
        assert list(factory.create_enabled(None)) == []
