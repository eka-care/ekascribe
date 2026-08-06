"""
Unit tests for DocumentService (voice2rx/services/documents/document_service.py).

External collaborators (EkascribeDocumentORM and the S3 client) are mocked,
so these tests run without DynamoDB or AWS access.
"""

from unittest.mock import MagicMock, patch

import pytest

from voice2rx.services.documents.document_service import DocumentService


BUCKET = "test-bucket"
S3_URL = f"s3://{BUCKET}/240101/txn-1/"
BASE_FOLDER = "240101/txn-1/"


@pytest.fixture
def mock_repo():
    return MagicMock()


@pytest.fixture
def service(mock_repo):
    return DocumentService(document_repo=mock_repo, bucket_name=BUCKET)


# ---------------------------------------------------------------------------
# create_document
# ---------------------------------------------------------------------------


class TestCreateDocument:

    def test_uses_provided_document_id_and_fields(self, service, mock_repo):
        result = service.create_document(
            session_id="sess-1",
            template_id="tmpl-1",
            uuid_val="u-1",
            wid="b-1",
            document_id="fixed-doc-id",
            document_name="Friendly Name",
            doc_type="transcript",
            status="success",
            errors=["err"],
            warnings=["w"],
            usage_info={"tokens": 10},
            document_path="path/to/file.txt",
            prompt_path="path/to/prompt.txt",
            commit_at=1704067200,
            processed_at=1704067201,
        )

        assert result["document_id"] == "fixed-doc-id"
        assert result["document_name"] == "Friendly Name"
        assert result["type"] == "transcript"
        assert result["status"] == "success"
        assert result["errors"] == ["err"]
        assert result["warnings"] == ["w"]
        assert result["usage_information"] == {"tokens": 10}
        assert result["document_path"] == "path/to/file.txt"
        assert result["prompt_path"] == "path/to/prompt.txt"
        assert result["commit_at"] == 1704067200
        assert result["processed_at"] == 1704067201


# ---------------------------------------------------------------------------
# update_document / update_document_status / archive / get
# ---------------------------------------------------------------------------


class TestUpdateAndQuery:
    def test_update_document_delegates_to_repo(self, service, mock_repo):
        mock_repo.update_document.return_value = {"document_id": "doc-1"}
        assert service.update_document("doc-1", {"status": "success"}) == {
            "document_id": "doc-1"
        }
        mock_repo.update_document.assert_called_once_with(
            "doc-1", {"status": "success"}
        )

    def test_update_document_status_builds_update_dict(self, service, mock_repo):
        service.update_document_status(
            "doc-1",
            status="success",
            errors=["e"],
            warnings=["w"],
            usage_info={"tokens": 5},
            document_path="p/f.txt",
            prompt_path="p/pr.txt",
        )

        mock_repo.update_document.assert_called_once()
        args, _ = mock_repo.update_document.call_args
        assert args[0] == "doc-1"
        update_data = args[1]
        assert update_data["status"] == "success"
        assert update_data["errors"] == ["e"]
        assert update_data["warnings"] == ["w"]
        assert update_data["usage_information"] == {"tokens": 5}
        assert update_data["document_path"] == "p/f.txt"
        assert update_data["prompt_path"] == "p/pr.txt"

    def test_update_document_status_only_status(self, service, mock_repo):
        service.update_document_status("doc-1", status="failure")
        args, _ = mock_repo.update_document.call_args
        assert args[1] == {"status": "failure"}

    def test_get_document_delegates_to_repo(self, service, mock_repo):
        mock_repo.get_document.return_value = {"document_id": "doc-1"}
        assert service.get_document("doc-1") == {"document_id": "doc-1"}

    def test_get_documents_for_session_delegates(self, service, mock_repo):
        mock_repo.get_documents_by_session.return_value = [{"document_id": "d1"}]
        assert service.get_documents_for_session("sess-1") == [
            {"document_id": "d1"}
        ]

    def test_archive_document_delegates(self, service, mock_repo):
        mock_repo.archive_document.return_value = {"archived": True}
        assert service.archive_document("doc-1") == {"archived": True}

    def test_get_document_id_by_session_and_template_returns_last_match(
        self, service, mock_repo
    ):
        # The implementation iterates all documents and the last matching
        # template_id wins (without init_doc the second if-branch overwrites).
        mock_repo.get_documents_by_session_and_template.return_value = [
            {"document_id": "d1", "template_id": "tmpl-1"},
            {"document_id": "d2", "template_id": "tmpl-1"},
        ]
        assert (
            service.get_document_id_by_session_and_template("sess-1", "tmpl-1")
            == "d2"
        )

    def test_get_document_id_by_session_and_template_returns_none_when_empty(
        self, service, mock_repo
    ):
        mock_repo.get_documents_by_session_and_template.return_value = []
        assert (
            service.get_document_id_by_session_and_template("sess-1", "tmpl-1")
            is None
        )


# ---------------------------------------------------------------------------
# write_document_content
# ---------------------------------------------------------------------------



class TestPresignedUrls:
    def test_generate_presigned_download_url_returns_none_without_path(self, service):
        assert service.generate_presigned_download_url("") is None

    def test_generate_presigned_download_url_delegates_to_storage_client(
        self, service
    ):
        service.storage_client = MagicMock()
        service.storage_client.generate_presigned_get_url.return_value = (
            "https://signed"
        )

        assert (
            service.generate_presigned_download_url("path/f.txt", 60)
            == "https://signed"
        )
        service.storage_client.generate_presigned_get_url.assert_called_once_with(
            "path/f.txt", expires_in=60
        )

    def test_generate_presigned_upload_url_builds_expected_key(self, service):
        service.storage_client = MagicMock()
        service.storage_client.generate_presigned_put_url.return_value = (
            "https://upload"
        )

        url = service.generate_presigned_upload_url("doc-1", S3_URL, 120)

        assert url == "https://upload"
        service.storage_client.generate_presigned_put_url.assert_called_once_with(
            f"{BASE_FOLDER}documents/doc-1.txt",
            expires_in=120,
            content_type="text/plain",
        )

    def test_generate_presigned_upload_url_returns_none_on_error(self, service):
        service.storage_client = MagicMock()
        service.storage_client.generate_presigned_put_url.return_value = None

        assert service.generate_presigned_upload_url("doc-1", S3_URL) is None


# ---------------------------------------------------------------------------
# parse_document_path
# ---------------------------------------------------------------------------


