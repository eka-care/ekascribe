"""Unit tests for the Eka Care vault client."""

from unittest.mock import MagicMock, patch

import pytest

from voice2rx.services.publish.vault.vault_client import (
    VaultClientError,
    create_doc,
    replace_content,
    upload_pdf_via_form,
)


class TestCreateDoc:
    def test_returns_vault_doc_id_and_form(self):
        response_body = {
            "error": False,
            "batch_response": [
                {
                    "document_id": "doc-1",
                    "forms": [{"url": "https://s3/upload", "fields": {"k": "v"}}],
                }
            ],
        }
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(
                status_code=200, json=lambda: response_body, text="ok"
            )
            vault_doc_id, form = create_doc(
                document_id="doc-1",
                pdf_size=1234,
                jwt_payload={"uuid": "u"},
                oid="oid-1",
            )
        assert vault_doc_id == "doc-1"
        assert form == {"url": "https://s3/upload", "fields": {"k": "v"}}

    def test_raises_on_error_flag(self):
        body = {"error": True, "message": "bad", "batch_response": []}
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(
                status_code=200, json=lambda: body, text="..."
            )
            with pytest.raises(VaultClientError):
                create_doc("doc-1", 100, {}, "oid-1")

    def test_raises_on_http_error(self):
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(status_code=500, text="boom")
            with pytest.raises(VaultClientError):
                create_doc("doc-1", 100, {}, "oid-1")


class TestReplaceContent:
    def test_returns_vault_doc_id_and_form(self):
        body = {
            "error": False,
            "document_id": "doc-1",
            "forms": [{"url": "https://s3/upload", "fields": {"k": "v"}}],
            "batch_response": None,
        }
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(
                status_code=200, json=lambda: body, text="ok"
            )
            vault_doc_id, form = replace_content("doc-1", {}, "oid-1")
        assert vault_doc_id == "doc-1"
        assert form == {"url": "https://s3/upload", "fields": {"k": "v"}}

    def test_falls_back_to_passed_in_doc_id(self):
        body = {
            "error": False,
            "forms": [{"url": "https://s3/upload", "fields": {}}],
        }
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(
                status_code=200, json=lambda: body, text="ok"
            )
            vault_doc_id, _ = replace_content("doc-9", {}, "oid-1")
        assert vault_doc_id == "doc-9"

    def test_raises_on_error_flag(self):
        body = {"error": True, "forms": []}
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(
                status_code=200, json=lambda: body, text="..."
            )
            with pytest.raises(VaultClientError):
                replace_content("doc-1", {}, "oid-1")

    def test_raises_when_forms_missing(self):
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(
                status_code=200, json=lambda: {}, text="ok"
            )
            with pytest.raises(VaultClientError):
                replace_content("doc-1", {}, "oid-1")


class TestUploaders:
    def test_form_upload_ok(self):
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(status_code=204, text="")
            upload_pdf_via_form(
                {"url": "https://s3/post", "fields": {"k": "v"}}, b"pdf"
            )
        req.post.assert_called_once()

    def test_form_upload_raises_on_error(self):
        with patch(
            "voice2rx.services.publish.vault.vault_client.requests"
        ) as req:
            req.post.return_value = MagicMock(status_code=500, text="boom")
            with pytest.raises(VaultClientError):
                upload_pdf_via_form(
                    {"url": "https://s3/post", "fields": {}}, b"pdf"
                )
