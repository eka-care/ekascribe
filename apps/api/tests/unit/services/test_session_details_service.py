"""
Unit tests for SessionDetailsService
(voice2rx/services/sessions/session_details_service.py).

All collaborators (TransactionORM, EkascribeDocumentORM, StorageClient)
are mocked. No database or S3 access.
"""

from http import HTTPStatus
from unittest.mock import MagicMock, patch

import pytest

from scribe.core.exceptions import ResourceNotFoundException
from scribe.services.session_details_service import (
    SCHEMA_VERSION,
    SessionDetailsService,
)


SESSION_ID = "sess-1"
B_ID = "b-1"
UUID = "u-1"
OTHER_UUID = "u-2"


@pytest.fixture
def mock_txn_repo():
    return MagicMock()


@pytest.fixture
def mock_doc_repo():
    return MagicMock()


@pytest.fixture
def mock_storage():
    return MagicMock()


@pytest.fixture
def service(mock_txn_repo, mock_doc_repo, mock_storage):
    return SessionDetailsService(
        transaction_repo=mock_txn_repo,
        document_repo=mock_doc_repo,
        storage_client=mock_storage,
    )


def _txn(**overrides):
    base = {
        "txn_id": SESSION_ID,
        "b_id": B_ID,
        "uuid": UUID,
        "created_at": "2024-01-01T00:00:00Z",
        "commit_at": "2024-01-01T00:00:05Z",
        "processed_at": "2024-01-01T00:00:30Z",
        "user_status": "commit",
        "processing_status": "completed",
        "transfer": "vaded",
        "flavour": "ekascribe-web",
        "patient_details": {"name": "Alice"},
        "additional_data": {"k": "v"},
    }
    base.update(overrides)
    return base


def _doc(document_id="d1", status="success", **overrides):
    base = {
        "document_id": document_id,
        "session_id": SESSION_ID,
        "template_id": "tmpl-1",
        "document_name": "Doc 1",
        "type": "document",
        "status": status,
        "errors": [],
        "warnings": [],
        "usage_information": {},
        "publish_status": {"published": False},
        "document_path": f"240101/{SESSION_ID}/documents/{document_id}.txt",
        "created_at": 1700000000,
        "commit_at": 1700000005,
        "processed_at": 1700000030,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# auth / not-found
# ---------------------------------------------------------------------------


class TestAuthAndNotFound:
    @pytest.mark.asyncio
    async def test_missing_transaction_returns_404(self, service, mock_txn_repo):
        mock_txn_repo.get_transaction.return_value = None

        with pytest.raises(ResourceNotFoundException):
            await service.get_session_details(SESSION_ID, UUID, B_ID)

    @pytest.mark.asyncio
    async def test_uuid_mismatch_returns_404(self, service, mock_txn_repo):
        mock_txn_repo.get_transaction.return_value = _txn(uuid=OTHER_UUID)

        with pytest.raises(ResourceNotFoundException):
            await service.get_session_details(SESSION_ID, UUID, B_ID)

    @pytest.mark.asyncio
    async def test_b_id_mismatch_yields_none_from_repo_and_404(
        self, service, mock_txn_repo
    ):
        # repo native scope already filters by b_id. None == not found.
        mock_txn_repo.get_transaction.return_value = None

        with pytest.raises(ResourceNotFoundException):
            await service.get_session_details(SESSION_ID, UUID, "wrong-b-id")

        mock_txn_repo.get_transaction.assert_called_once_with(
            SESSION_ID, "wrong-b-id"
        )


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_returns_200_when_all_documents_settled(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1", status="success"),
            _doc("d2", status="failure"),
        ]

        body, code = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert code == HTTPStatus.OK
        assert body["data"]["schema_version"] == SCHEMA_VERSION
        assert body["data"]["session_id"] == SESSION_ID
        assert body["data"]["uuid"] == UUID
        assert body["data"]["wid"] == B_ID
        assert len(body["data"]["documents"]) == 2

    @pytest.mark.asyncio
    async def test_returns_202_when_any_document_in_progress(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1", status="success"),
            _doc("d2", status="in-progress"),
        ]

        _, code = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert code == HTTPStatus.ACCEPTED

    @pytest.mark.asyncio
    async def test_empty_documents_returns_200_with_empty_list(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = []

        body, code = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert code == HTTPStatus.OK
        assert body["data"]["documents"] == []

    @pytest.mark.asyncio
    async def test_passes_through_transaction_header_fields(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = []

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        data = body["data"]
        assert data["user_status"] == "commit"
        assert "processing_status" not in data
        assert data["status"] == "processed"
        assert data["transfer"] == "vaded"
        assert data["flavour"] == "ekascribe-web"
        assert data["patient_details"] == {"name": "Alice"}
        assert data["additional_data"] == {"k": "v"}


# ---------------------------------------------------------------------------
# document entries
# ---------------------------------------------------------------------------


class TestDocumentEntries:
    @pytest.mark.asyncio
    async def test_document_entry_has_expected_keys(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [_doc("d1")]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)
        entry = body["data"]["documents"][0]

        for k in [
            "document_id", "session_id", "template_id", "document_name",
            "type", "document_type", "status", "errors", "warnings",
            "publish", "created_at", "presigned_url",
            "presigned_url_expires_at", "vault_doc_id",
        ]:
            assert k in entry
        # internal-only fields never leak into the response
        for k in ["document_path", "usage_information"]:
            assert k not in entry

    @pytest.mark.asyncio
    async def test_publish_field_comes_from_publish_status(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1", publish_status={"published": True, "vault": "x"})
        ]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)
        assert body["data"]["documents"][0]["publish"] == {
            "published": True, "vault": "x"
        }

    @pytest.mark.asyncio
    async def test_document_path_stays_internal(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1", document_path="240101/sess-1/documents/d1.txt")
        ]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)
        assert "document_path" not in body["data"]["documents"][0]

    @pytest.mark.asyncio
    async def test_internal_raw_path_does_not_leak_to_response(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [_doc("d1")]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)
        entry = body["data"]["documents"][0]

        assert "_raw_document_path" not in entry


# ---------------------------------------------------------------------------
# presigned URLs
# ---------------------------------------------------------------------------


class TestPresignedUrls:
    @pytest.mark.asyncio
    async def test_default_no_presigned_urls(
        self, service, mock_txn_repo, mock_doc_repo, mock_storage
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [_doc("d1")]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        entry = body["data"]["documents"][0]
        assert entry["presigned_url"] is None
        assert entry["presigned_url_expires_at"] is None
        mock_storage.generate_presigned_get_url.assert_not_called()

    @pytest.mark.asyncio
    async def test_presigned_true_attaches_urls(
        self, service, mock_txn_repo, mock_doc_repo, mock_storage
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1"),
            _doc("d2"),
        ]
        mock_storage.generate_presigned_get_url.side_effect = [
            "https://s3/d1",
            "https://s3/d2",
        ]

        body, _ = await service.get_session_details(
            SESSION_ID, UUID, B_ID, presigned=True
        )

        entries = body["data"]["documents"]
        assert entries[0]["presigned_url"] == "https://s3/d1"
        assert entries[1]["presigned_url"] == "https://s3/d2"
        assert entries[0]["presigned_url_expires_at"] is not None
        assert entries[1]["presigned_url_expires_at"] is not None

    @pytest.mark.asyncio
    async def test_presigned_passes_default_expiry(
        self, service, mock_txn_repo, mock_doc_repo, mock_storage
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [_doc("d1")]
        mock_storage.generate_presigned_get_url.return_value = "https://s3/x"

        await service.get_session_details(SESSION_ID, UUID, B_ID, presigned=True)

        _, kwargs = mock_storage.generate_presigned_get_url.call_args
        assert kwargs["expires_in"] == 3600

    @pytest.mark.asyncio
    async def test_presigned_passes_custom_expiry(
        self, service, mock_txn_repo, mock_doc_repo, mock_storage
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [_doc("d1")]
        mock_storage.generate_presigned_get_url.return_value = "https://s3/x"

        await service.get_session_details(
            SESSION_ID, UUID, B_ID, presigned=True, presigned_expires_in=600
        )

        _, kwargs = mock_storage.generate_presigned_get_url.call_args
        assert kwargs["expires_in"] == 600

    @pytest.mark.asyncio
    async def test_empty_document_path_gets_no_url(
        self, service, mock_txn_repo, mock_doc_repo, mock_storage
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1", document_path=""),
        ]

        body, _ = await service.get_session_details(
            SESSION_ID, UUID, B_ID, presigned=True
        )

        entry = body["data"]["documents"][0]
        assert entry["presigned_url"] is None
        assert entry["presigned_url_expires_at"] is None
        mock_storage.generate_presigned_get_url.assert_not_called()

    @pytest.mark.asyncio
    async def test_storage_failure_for_one_doc_does_not_cascade(
        self, service, mock_txn_repo, mock_doc_repo, mock_storage
    ):
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1"),
            _doc("d2"),
        ]
        mock_storage.generate_presigned_get_url.side_effect = [
            RuntimeError("first failed"),
            "https://s3/d2",
        ]

        body, _ = await service.get_session_details(
            SESSION_ID, UUID, B_ID, presigned=True
        )

        entries = body["data"]["documents"]
        assert entries[0]["presigned_url"] is None
        assert entries[0]["presigned_url_expires_at"] is None
        assert entries[1]["presigned_url"] == "https://s3/d2"


# ---------------------------------------------------------------------------
# audio_matrix integration
# ---------------------------------------------------------------------------


class TestAudioMatrix:
    @pytest.mark.asyncio
    async def test_audio_matrix_is_static_empty(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        # The audio quality stack was removed; the field stays as {} for
        # wire compatibility until the frontend drops it.
        mock_txn_repo.get_transaction.return_value = _txn()
        mock_doc_repo.get_documents_by_session.return_value = []

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert body["data"]["audio_matrix"] == {}


# ---------------------------------------------------------------------------
# session status field
# ---------------------------------------------------------------------------


class TestSessionStatus:
    @pytest.mark.parametrize(
        "user_status,expected",
        [
            ("init", "in-progress"),
            ("recording_started", "in-progress"),
            ("commit", "processed"),
            ("stopped", "processed"),
            ("cancelled", "processed"),
            (None, "processed"),
        ],
    )
    @pytest.mark.asyncio
    async def test_status_derived_from_user_status(
        self, service, mock_txn_repo, mock_doc_repo, user_status, expected
    ):
        mock_txn_repo.get_transaction.return_value = _txn(user_status=user_status)
        mock_doc_repo.get_documents_by_session.return_value = []

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert body["data"]["status"] == expected


# ---------------------------------------------------------------------------
# transcript error overlay
# ---------------------------------------------------------------------------


def _transcript_doc(errors=None, **overrides):
    return _doc(
        document_id="t1",
        type="transcript",
        template_id="transcript",
        document_name="Transcript",
        status="success",
        errors=errors if errors is not None else [],
        **overrides,
    )


class TestTranscriptErrorOverlay:
    @pytest.mark.asyncio
    async def test_no_overlay_when_user_status_not_commit(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="init",
            transcript_status="failure",
        )
        mock_doc_repo.get_documents_by_session.return_value = [_transcript_doc()]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert body["data"]["documents"][0]["errors"] == []

    @pytest.mark.asyncio
    async def test_no_overlay_when_transcript_and_processing_both_success(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status="success",
            processing_status="success",
        )
        mock_doc_repo.get_documents_by_session.return_value = [_transcript_doc()]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert body["data"]["documents"][0]["errors"] == []

    @pytest.mark.asyncio
    async def test_empty_transcript_warning_appended_on_processing_failure(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status="success",
            processing_status="system_failure",
            processing_error={
                "error": {
                    "type": "warning",
                    "code": "empty_transcript_warning",
                    "msg": "Joined transcript was empty; structuring was skipped",
                }
            },
        )
        mock_doc_repo.get_documents_by_session.return_value = [_transcript_doc()]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        errors = body["data"]["documents"][0]["errors"]
        assert len(errors) == 1
        assert errors[0]["code"] == "empty_transcript_warning"
        assert "No speech detected" in errors[0]["msg"]

    @pytest.mark.asyncio
    async def test_processing_failure_other_codes_overlay_with_code(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status="success",
            processing_status="request_failure",
            processing_error={
                "error": {
                    "type": "error",
                    "code": "some_other_code",
                    "msg": "something else went wrong",
                }
            },
        )
        mock_doc_repo.get_documents_by_session.return_value = [_transcript_doc()]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        errors = body["data"]["documents"][0]["errors"]
        assert errors == [
            {"code": "some_other_code", "msg": "something else went wrong"}
        ]

    @pytest.mark.asyncio
    async def test_transcript_failure_alone_no_overlay(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        # transcript_status=failure with no processing failure: the overlay
        # only synthesizes errors from processing_error payloads.
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status="failure",
        )
        mock_doc_repo.get_documents_by_session.return_value = [_transcript_doc()]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert body["data"]["documents"][0]["errors"] == []

    @pytest.mark.asyncio
    async def test_transcript_status_missing_no_overlay(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status=None,
        )
        mock_doc_repo.get_documents_by_session.return_value = [_transcript_doc()]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        assert body["data"]["documents"][0]["errors"] == []

    @pytest.mark.asyncio
    async def test_existing_errors_preserved_and_appended_to(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        existing = [{"code": "prior", "msg": "prior error"}]
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status="success",
            processing_status="request_failure",
            processing_error={"error": {"code": "boom", "msg": "bad run"}},
        )
        mock_doc_repo.get_documents_by_session.return_value = [
            _transcript_doc(errors=existing)
        ]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        errors = body["data"]["documents"][0]["errors"]
        assert len(errors) == 2
        assert errors[0] == {"code": "prior", "msg": "prior error"}
        assert errors[1]["code"] == "boom"

    @pytest.mark.asyncio
    async def test_overlay_targets_only_transcript_document(
        self, service, mock_txn_repo, mock_doc_repo
    ):
        mock_txn_repo.get_transaction.return_value = _txn(
            user_status="commit",
            transcript_status="success",
            processing_status="request_failure",
            processing_error={"error": {"code": "boom", "msg": "bad run"}},
        )
        mock_doc_repo.get_documents_by_session.return_value = [
            _doc("d1", type="document"),
            _transcript_doc(),
        ]

        body, _ = await service.get_session_details(SESSION_ID, UUID, B_ID)

        docs = body["data"]["documents"]
        assert docs[0]["errors"] == []
        assert len(docs[1]["errors"]) == 1
        assert docs[1]["errors"][0]["code"] == "boom"
