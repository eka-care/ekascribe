"""Unit tests for EMRWebhookIntegration end-to-end with mocked HTTP + S3."""

from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from voice2rx.services.publish.base import PublishContext
from voice2rx.services.publish.integrations.emr_webhook import (
    EMRWebhookIntegration,
)


@pytest.fixture
def ctx():
    return PublishContext(
        document={
            "document_id": "doc-1",
            "document_path": "folder/doc-1.txt",
        },
        transaction={"encounter_id": "enc-42"},
        session_id="sess-1",
        encounter_id="enc-42",
        b_id="biz-1",
        uuid="user-1",
        oid="oid-1",
        jwt_payload={"b-id": "biz-1", "uuid": "user-1", "oid": "oid-1"},
        client_id="client-1",
    )


@pytest.fixture
def markdown_bytes():
    return b"# Hello\n\nThis is a **test** document."


def _s3_stream(content: bytes):
    stream = BytesIO(content)

    def get_object(Bucket, Key):
        return {"Body": stream}

    return get_object


class TestEMRWebhookIntegration:
    def test_create_path_publishes_successfully(self, ctx, markdown_bytes):
        ctx.document.pop("vault_doc_id", None)

        layout = {
            "header_img": "https://cdn.eka/header.png",
            "footer_img": "",
            "header_height": "5cm",
            "footer_height": "3cm",
            "margin_left": "1cm",
            "margin_right": "1cm",
            "page_size": "A4",
        }

        with patch(
            "voice2rx.services.publish.integrations.emr_webhook.s3_client"
        ) as s3, patch(
            "voice2rx.services.publish.integrations.emr_webhook.fetch_print_layout",
            return_value=layout,
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.build_pdf",
            return_value=b"%PDF-FAKE",
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.create_doc",
            return_value=("doc-1", {"url": "https://s3/upload", "fields": {}}),
        ) as create_doc, patch(
            "voice2rx.services.publish.integrations.emr_webhook.upload_pdf_via_form"
        ) as upload_form, patch(
            "voice2rx.services.publish.integrations.emr_webhook.replace_content"
        ) as replace_mock, patch(
            "voice2rx.services.publish.integrations.emr_webhook.emit_raw"
        ) as emit_raw:
            s3.get_object.side_effect = _s3_stream(markdown_bytes)

            result = EMRWebhookIntegration().publish(ctx, {"enabled": True})

        assert result.status == "success"
        assert result.data["vault_doc_id"] == "doc-1"
        create_doc.assert_called_once()
        upload_form.assert_called_once()
        replace_mock.assert_not_called()
        emit_raw.assert_called_once()
        payload = emit_raw.call_args.args[0]
        assert payload["event_id"] == "scribe.document.publish"
        assert payload["client_id"] == "client-1"

    def test_replace_path_when_vault_doc_id_present(self, ctx, markdown_bytes):
        ctx.document["vault_doc_id"] = "doc-1"

        layout = {
            "header_img": "",
            "footer_img": "",
            "header_height": "2cm",
            "footer_height": "1cm",
            "margin_left": "1cm",
            "margin_right": "1cm",
            "page_size": "A4",
        }

        with patch(
            "voice2rx.services.publish.integrations.emr_webhook.s3_client"
        ) as s3, patch(
            "voice2rx.services.publish.integrations.emr_webhook.fetch_print_layout",
            return_value=layout,
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.build_pdf",
            return_value=b"%PDF-FAKE",
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.create_doc"
        ) as create_mock, patch(
            "voice2rx.services.publish.integrations.emr_webhook.replace_content",
            return_value=("doc-1", {"url": "https://s3/upload", "fields": {}}),
        ) as replace_mock, patch(
            "voice2rx.services.publish.integrations.emr_webhook.upload_pdf_via_form"
        ) as upload_form, patch(
            "voice2rx.services.publish.integrations.emr_webhook.emit_raw"
        ):
            s3.get_object.side_effect = _s3_stream(markdown_bytes)

            result = EMRWebhookIntegration().publish(ctx, {"enabled": True})

        assert result.status == "success"
        assert result.data["vault_doc_id"] == "doc-1"
        create_mock.assert_not_called()
        replace_mock.assert_called_once_with(
            vault_doc_id="doc-1", jwt_payload=ctx.jwt_payload, oid=ctx.oid
        )
        upload_form.assert_called_once_with(
            {"url": "https://s3/upload", "fields": {}}, b"%PDF-FAKE"
        )

    def test_returns_failed_when_vault_raises(self, ctx, markdown_bytes):
        from voice2rx.services.publish.vault.vault_client import VaultClientError

        with patch(
            "voice2rx.services.publish.integrations.emr_webhook.s3_client"
        ) as s3, patch(
            "voice2rx.services.publish.integrations.emr_webhook.fetch_print_layout",
            return_value={
                "header_img": "",
                "footer_img": "",
                "header_height": "1cm",
                "footer_height": "1cm",
                "margin_left": "1cm",
                "margin_right": "1cm",
                "page_size": "A4",
            },
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.build_pdf",
            return_value=b"%PDF-FAKE",
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.create_doc",
            side_effect=VaultClientError("boom"),
        ):
            s3.get_object.side_effect = _s3_stream(markdown_bytes)

            result = EMRWebhookIntegration().publish(ctx, {"enabled": True})

        assert result.status == "failed"
        assert "boom" in result.error

    def test_webhook_endpoint_override_is_used(self, ctx, markdown_bytes):
        layout = {
            "header_img": "",
            "footer_img": "",
            "header_height": "1cm",
            "footer_height": "1cm",
            "margin_left": "1cm",
            "margin_right": "1cm",
            "page_size": "A4",
        }

        with patch(
            "voice2rx.services.publish.integrations.emr_webhook.s3_client"
        ) as s3, patch(
            "voice2rx.services.publish.integrations.emr_webhook.fetch_print_layout",
            return_value=layout,
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.build_pdf",
            return_value=b"%PDF-FAKE",
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.create_doc",
            return_value=("doc-1", {"url": "https://s3/upload", "fields": {}}),
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.upload_pdf_via_form"
        ), patch(
            "voice2rx.services.publish.integrations.emr_webhook.emit_raw"
        ) as emit_raw:
            s3.get_object.side_effect = _s3_stream(markdown_bytes)

            result = EMRWebhookIntegration().publish(
                ctx, {"enabled": True, "webhook_endpoint": "https://custom.example/hook"}
            )

        assert result.status == "success"
        assert (
            emit_raw.call_args.kwargs["url_override"]
            == "https://custom.example/hook"
        )
