"""
Unit tests for PopulateDocumentsService
(voice2rx/services/documents/populate_documents_service.py).

All collaborators are mocked. The service's async methods are tested via
pytest-asyncio (asyncio_mode is picked up from the package config).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scribe.services.populate_documents_service import (
    PopulateDocumentsService,
    _FAILED_STATUSES,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_document_service():
    svc = MagicMock()
    svc.write_document_content.return_value = "folder/documents/doc.txt"
    svc.create_document.return_value = {"document_id": "doc-1"}
    svc.get_document_id_by_session_and_template.return_value = None
    return svc


@pytest.fixture
def mock_template_file_service():
    return MagicMock()


@pytest.fixture
def mock_template_service():
    svc = MagicMock()
    # async method - return empty dict so _resolve_document_name returns the template_id
    svc.get_template_by_id = AsyncMock(return_value={"title": "Friendly Name"})
    return svc


@pytest.fixture
def mock_template_results_repo():
    repo = MagicMock()
    repo.get_template_result.return_value = {
        "created_at": "ca",
        "commit_at": "ma",
        "processed_at": "pa",
    }
    return repo


@pytest.fixture
def service(
    mock_document_service,
    mock_template_file_service,
    mock_template_service,
    mock_template_results_repo,
):
    return PopulateDocumentsService(
        document_service=mock_document_service,
        template_file_service=mock_template_file_service,
        template_service=mock_template_service,
        template_results_repo=mock_template_results_repo,
    )


# ---------------------------------------------------------------------------
# populate_documents
# ---------------------------------------------------------------------------


class TestPopulateDocuments:
    @pytest.mark.asyncio
    async def test_returns_empty_when_processing_status_failed(
        self, service, mock_document_service, mock_template_file_service
    ):
        transaction_data = {
            "request_templates": {
                "visual": [{"template_id": "tmpl-1", "document_id": "existing-doc"}],
                "integration": [],
            }
        }

        failed_status = next(iter(_FAILED_STATUSES))
        result = await service.populate_documents(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
            output_template_result={"tmpl-1": {"status": "failure"}},
            processing_status=failed_status,
            transaction_data=transaction_data,
        )

        assert result == []
        mock_template_file_service.read_all_template_files.assert_not_called()
        mock_template_file_service._read_legacy_output_json.assert_not_called()
        # existing doc should be marked as failure
        mock_document_service.update_document.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_empty_when_output_json_missing(
        self, service, mock_template_file_service
    ):
        mock_template_file_service.read_all_template_files.return_value = None

        result = await service.populate_documents(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
            patch_api_call=False,
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_patch_api_call_reads_only_output_json(
        self, service, mock_template_file_service, mock_document_service
    ):
        mock_template_file_service._read_legacy_output_json.return_value = {
            "structured_outputs": {"tmpl-1": "content"}
        }
        mock_document_service.get_documents_by_ids.return_value = [
            {"template_id": "tmpl-1", "document_id": "existing-doc"}
        ]
        mock_document_service.update_document.return_value = {"document_id": "existing-doc"}

        transaction_data = {
            "request_templates": {
                "visual": [{"template_id": "tmpl-1", "document_id": "existing-doc"}],
                "integration": [],
            }
        }

        created = await service.populate_documents(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
            output_template_result={
                "tmpl-1": {"status": "success", "errors": [], "warnings": []}
            },
            patch_api_call=True,
            transaction_data=transaction_data,
        )

        mock_template_file_service._read_legacy_output_json.assert_called_once()
        mock_template_file_service.read_all_template_files.assert_not_called()
        # only one structured output -> one document updated (patch API updates existing docs)
        assert len(created) == 1
        mock_document_service.update_document.assert_called_once()

    @pytest.mark.asyncio
    async def test_result_router_path_reads_template_files_and_migrates_transcripts(
        self, service, mock_template_file_service, mock_document_service
    ):
        mock_template_file_service.read_all_template_files.return_value = {
            "structured_outputs": {"tmpl-1": "content"}
        }
        mock_template_file_service.read_all_transcripts.return_value = [
            {"text": "hello", "lang": "en"}
        ]

        created = await service.populate_documents(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
            patch_api_call=False,
        )

        mock_template_file_service.read_all_template_files.assert_called_once()
        mock_template_file_service.read_all_transcripts.assert_called_once()
        # 1 template document is created; transcript migration currently
        # swallows per-transcript errors internally (see
        # _migrate_transcripts) so the returned list only contains the
        # template doc. The test pins this behaviour so any fix to the
        # transcript migration path shows up as a test change.
        assert len(created) == 1

    @pytest.mark.asyncio
    async def test_continues_on_single_template_error(
        self, service, mock_template_file_service, mock_document_service
    ):
        mock_template_file_service._read_legacy_output_json.return_value = {
            "structured_outputs": {"tmpl-bad": "x", "tmpl-good": "y"}
        }
        mock_document_service.get_documents_by_ids.return_value = [
            {"template_id": "tmpl-bad", "document_id": "doc-bad"},
            {"template_id": "tmpl-good", "document_id": "doc-good"},
        ]

        transaction_data = {
            "request_templates": {
                "visual": [
                    {"template_id": "tmpl-bad", "document_id": "doc-bad"},
                    {"template_id": "tmpl-good", "document_id": "doc-good"},
                ],
                "integration": [],
            }
        }

        # patch API path calls _update_existing_document which calls
        # write_document_content then update_document.
        # Make the first update call fail, second succeed.
        mock_document_service.update_document.side_effect = [
            RuntimeError("boom"),
            {"document_id": "doc-good"},
        ]

        created = await service.populate_documents(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
            output_template_result={
                "tmpl-bad": {"status": "success", "errors": [], "warnings": []},
                "tmpl-good": {"status": "success", "errors": [], "warnings": []},
            },
            patch_api_call=True,
            transaction_data=transaction_data,
        )

        assert mock_document_service.update_document.call_count == 2
        # one document successfully updated
        assert len(created) == 1


# ---------------------------------------------------------------------------
# populate_transcript
# ---------------------------------------------------------------------------


class TestPopulateTranscript:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_transcript(
        self, service, mock_template_file_service
    ):
        mock_template_file_service.read_transcript_file.return_value = None
        result = await service.populate_transcript(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_updates_existing_transcript_document(
        self, service, mock_template_file_service, mock_document_service
    ):
        mock_template_file_service.read_transcript_file.return_value = {
            "text": "hello",
            "lang": "en",
        }
        mock_document_service.get_document_id_by_session_and_template.return_value = (
            "existing-doc"
        )

        await service.populate_transcript(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
        )

        mock_document_service.write_document_content.assert_called_once()
        mock_document_service.update_document.assert_called_once()
        update_args = mock_document_service.update_document.call_args
        assert update_args.kwargs["document_id"] == "existing-doc"
        assert update_args.kwargs["update_data"]["status"] == "success"
        mock_document_service.create_document.assert_not_called()

    @pytest.mark.asyncio
    async def test_creates_new_transcript_document_when_none_exists(
        self, service, mock_template_file_service, mock_document_service
    ):
        mock_template_file_service.read_transcript_file.return_value = {
            "text": "hello",
            "lang": "en",
        }
        mock_document_service.get_document_id_by_session_and_template.return_value = None

        await service.populate_transcript(
            session_id="sess-1",
            b_id="b-1",
            uuid_val="u-1",
            s3_url="s3://bucket/folder/",
        )

        mock_document_service.create_document.assert_called_once()
        kwargs = mock_document_service.create_document.call_args.kwargs
        assert kwargs["doc_type"] == "transcript"
        assert kwargs["template_id"] == "transcript_en"


# ---------------------------------------------------------------------------
# private helpers
# ---------------------------------------------------------------------------


class TestPrivateHelpers:
    @pytest.mark.asyncio
    async def test_resolve_document_name_returns_template_title(
        self, service, mock_template_service
    ):
        mock_template_service.get_template_by_id.return_value = {"title": "Nice Name"}
        assert await service._resolve_document_name("tmpl-1") == "Nice Name"

    @pytest.mark.asyncio
    async def test_resolve_document_name_returns_none_when_no_details(
        self, service, mock_template_service
    ):
        mock_template_service.get_template_by_id.return_value = None
        assert await service._resolve_document_name("tmpl-1") is None

    def test_get_timestamps_returns_empty_dict_when_no_result(
        self, service, mock_template_results_repo
    ):
        mock_template_results_repo.get_template_result.return_value = None
        assert service._get_timestamps("sess-1", "tmpl-1") == {}

    def test_get_timestamps_returns_values_from_repo(
        self, service, mock_template_results_repo
    ):
        mock_template_results_repo.get_template_result.return_value = {
            "created_at": "ca",
            "commit_at": "ma",
            "processed_at": "pa",
        }
        assert service._get_timestamps("sess-1", "tmpl-1") == {
            "created_at": "ca",
            "commit_at": "ma",
            "processed_at": "pa",
        }

    def test_mark_documents_failed_updates_existing_doc(
        self, service, mock_document_service
    ):
        transaction_data = {
            "request_templates": {
                "visual": [{"template_id": "tmpl-1", "document_id": "existing-doc"}],
                "integration": [],
            }
        }
        service._mark_documents_failed(
            session_id="sess-1",
            b_id="b-1",
            output_template_result={"tmpl-1": {"status": "failure"}},
            transaction_data=transaction_data,
        )
        mock_document_service.update_document.assert_called_once()
        kwargs = mock_document_service.update_document.call_args.kwargs
        assert kwargs["document_id"] == "existing-doc"
        assert kwargs["update_data"]["status"] == "failure"

    def test_mark_documents_failed_noop_when_no_existing(
        self, service, mock_document_service
    ):
        service._mark_documents_failed(
            session_id="sess-1",
            b_id="b-1",
            output_template_result={"tmpl-1": {"status": "failure"}},
        )
        mock_document_service.update_document.assert_not_called()

    def test_write_and_create_document_writes_content_and_creates_doc(
        self, service, mock_document_service
    ):
        mock_document_service.write_document_content.return_value = (
            "folder/documents/new-doc.txt"
        )

        result = service._write_and_create_document(
            session_id="sess-1",
            template_id="tmpl-1",
            uuid_val="u-1",
            b_id="b-1",
            s3_url="s3://bucket/folder/",
            content="text",
        )

        mock_document_service.write_document_content.assert_called_once()
        mock_document_service.create_document.assert_called_once()
        # write path is passed through as document_path
        create_kwargs = mock_document_service.create_document.call_args.kwargs
        assert create_kwargs["document_path"] == "folder/documents/new-doc.txt"
        assert create_kwargs["status"] == "success"
        assert result == {"document_id": "doc-1"}
