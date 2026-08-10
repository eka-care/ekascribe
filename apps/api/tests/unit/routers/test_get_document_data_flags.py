"""
Tests for the tip_tap_data / ag_ui_data / markdown_data fields on
GET /voice/api/v1/documents/{document_id}.

Field rules (driven by the ekascribe_document_tiptap record):
  - tip_tap_data:  the record's tiptap_json, or None when absent
  - ag_ui_data:    the record's agui_state, or None when absent
  - markdown_data: the presigned download URL when tip_tap_data is present,
                   otherwise None
"""

import json
from unittest.mock import patch

import pytest


DOC_ID = "doc-flags-1"
B_ID = "test-business-id"
UUID = "test-uuid"

ROUTER = "scribe.routers.document_router"
ENDPOINT = f"/voice/api/v1/documents/{DOC_ID}"
PRESIGNED_URL = "https://s3/url"


def _jwt_header() -> dict:
    return {
        "jwt-payload": json.dumps({"b-id": B_ID, "uuid": UUID}),
        "authorization": "Bearer test-token",
        "content-type": "application/json",
    }


def _doc(document_path: str = "sessions/txn/doc.md") -> dict:
    return {
        "document_id": DOC_ID,
        "session_id": "txn_1",
        "template_id": "tpl_1",
        "document_name": "Doc",
        "type": "custom",
        "status": "success",
        "uuid": UUID,
        "document_path": document_path,
        "created_at": "2026-01-01T00:00:00Z",
    }


def _get(client, doc: dict, tiptap_record: dict | None, query: str = ""):
    with patch(f"{ROUTER}.document_service") as mock_doc_service, patch(
        f"{ROUTER}.get_document_record", return_value=tiptap_record
    ):
        mock_doc_service.get_document.return_value = doc
        mock_doc_service.generate_presigned_download_url.return_value = PRESIGNED_URL
        return client.get(ENDPOINT + query, headers=_jwt_header())


class TestGetDocumentDataFlags:
    def test_no_tiptap_record_all_data_fields_none(self, client):
        response = _get(client, _doc(), tiptap_record=None)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["tip_tap_data"] is None
        assert data["ag_ui_data"] is None
        assert data["markdown_data"] is None

    def test_tiptap_json_present_returns_data_and_markdown_url(self, client):
        record = {"document_id": DOC_ID, "tiptap_json": {"type": "doc"}}
        response = _get(client, _doc(), tiptap_record=record)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["tip_tap_data"] == {"type": "doc"}
        assert data["ag_ui_data"] is None
        # markdown_data carries the presigned URL when tiptap data exists
        assert data["markdown_data"] == PRESIGNED_URL

    def test_agui_state_present_returns_agui_data(self, client):
        record = {"document_id": DOC_ID, "agui_state": {"sections": []}}
        response = _get(client, _doc(), tiptap_record=record)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["tip_tap_data"] is None
        assert data["ag_ui_data"] == {"sections": []}
        assert data["markdown_data"] is None

    def test_both_tiptap_and_agui_present(self, client):
        record = {
            "document_id": DOC_ID,
            "tiptap_json": {"type": "doc"},
            "agui_state": {"sections": []},
        }
        response = _get(client, _doc(), tiptap_record=record)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["tip_tap_data"] == {"type": "doc"}
        assert data["ag_ui_data"] == {"sections": []}
        assert data["markdown_data"] == PRESIGNED_URL

    def test_tiptap_query_param_returns_json_from_same_record(self, client):
        record = {"document_id": DOC_ID, "tiptap_json": {"type": "doc"}}
        response = _get(client, _doc(), tiptap_record=record, query="?tiptap_json=true")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["tiptap_json"] == {"type": "doc"}

    def test_tiptap_query_param_omitted_when_no_tiptap_json(self, client):
        record = {"document_id": DOC_ID, "agui_state": {"sections": []}}
        response = _get(client, _doc(), tiptap_record=record, query="?tiptap_json=true")
        assert response.status_code == 200
        assert "tiptap_json" not in response.json()["data"]

    def test_record_fetch_failure_degrades_gracefully(self, client):
        with patch(f"{ROUTER}.document_service") as mock_doc_service, patch(
            f"{ROUTER}.get_document_record", side_effect=RuntimeError("dynamo down")
        ):
            mock_doc_service.get_document.return_value = _doc()
            mock_doc_service.generate_presigned_download_url.return_value = PRESIGNED_URL
            response = client.get(ENDPOINT, headers=_jwt_header())
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["tip_tap_data"] is None
        assert data["ag_ui_data"] is None
        assert data["markdown_data"] is None
