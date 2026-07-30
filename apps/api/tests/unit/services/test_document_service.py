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
    def test_creates_document_with_generated_id_when_not_supplied(
        self, service, mock_repo
    ):
        result = service.create_document(
            session_id="sess-1",
            template_id="tmpl-1",
            uuid_val="u-1",
            wid="b-1",
        )

        assert result["document_id"]  # generated uuid
        assert result["session_id"] == "sess-1"
        assert result["template_id"] == "tmpl-1"
        assert result["type"] == "document"
        assert result["status"] == "in-progress"
        assert result["document_name"] == "tmpl-1"  # defaults to template_id
        mock_repo.create_document.assert_called_once()

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


class TestWriteDocumentContent:
    def test_writes_to_explicit_document_path_when_provided(self, service):
        with patch(
            "voice2rx.services.documents.document_service.s3_client"
        ) as mock_s3:
            file_key = service.write_document_content(
                s3_url=S3_URL,
                document_id="doc-1",
                content="hello",
                document_path="custom/path/file.txt",
            )

        assert file_key == "custom/path/file.txt"
        mock_s3.put_object.assert_called_once()
        kwargs = mock_s3.put_object.call_args.kwargs
        assert kwargs["Bucket"] == BUCKET
        assert kwargs["Key"] == "custom/path/file.txt"
        assert kwargs["Body"] == b"hello"

    def test_fallback_path_uses_s3_url_base_folder(self, service):
        with patch(
            "voice2rx.services.documents.document_service.s3_client"
        ) as mock_s3:
            file_key = service.write_document_content(
                s3_url=S3_URL,
                document_id="doc-1",
                content="hello",
            )

        assert file_key == f"{BASE_FOLDER}documents/doc-1.txt"
        mock_s3.put_object.assert_called_once()

    def test_decodes_base64_when_flag_set(self, service):
        import base64

        content = base64.b64encode(b"decoded").decode("utf-8")
        with patch(
            "voice2rx.services.documents.document_service.s3_client"
        ) as mock_s3:
            service.write_document_content(
                s3_url=S3_URL,
                document_id="doc-1",
                content=content,
                is_base64=True,
            )
        kwargs = mock_s3.put_object.call_args.kwargs
        assert kwargs["Body"] == b"decoded"

    def test_writes_as_is_when_base64_decode_fails(self, service):
        with patch(
            "voice2rx.services.documents.document_service.s3_client"
        ) as mock_s3:
            service.write_document_content(
                s3_url=S3_URL,
                document_id="doc-1",
                content="not-base64!!",
                is_base64=True,
            )
        kwargs = mock_s3.put_object.call_args.kwargs
        assert kwargs["Body"] == b"not-base64!!"

    def test_raises_on_s3_put_failure(self, service):
        with patch(
            "voice2rx.services.documents.document_service.s3_client"
        ) as mock_s3:
            mock_s3.put_object.side_effect = RuntimeError("s3 boom")
            with pytest.raises(RuntimeError):
                service.write_document_content(
                    s3_url=S3_URL,
                    document_id="doc-1",
                    content="hello",
                )


# ---------------------------------------------------------------------------
# Presigned URLs
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


class TestParseDocumentPath:
    def test_empty_path_returns_empty_parts(self, service):
        assert service.parse_document_path("") == {
            "bucket": "",
            "folder": "",
            "filename": "",
        }

    def test_parses_nested_path(self, service):
        result = service.parse_document_path("240101/txn-1/documents/doc-1.txt")
        assert result == {
            "bucket": BUCKET,
            "folder": "240101/txn-1/documents",
            "filename": "doc-1.txt",
        }

    def test_parses_flat_filename(self, service):
        result = service.parse_document_path("doc-1.txt")
        assert result == {
            "bucket": BUCKET,
            "folder": "",
            "filename": "doc-1.txt",
        }
