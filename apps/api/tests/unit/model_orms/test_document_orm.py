"""
Unit tests for EkascribeDocumentORM
(voice2rx/model_orms/document_orm.py).

The DynamoDB resource is already mocked globally in tests/conftest.py
(`mock_aws_globally`), so the ORM can be instantiated normally. Each test
replaces `orm.table` and/or the inherited BaseORM methods with MagicMocks
to assert interactions without hitting DynamoDB.
"""

from unittest.mock import MagicMock, patch

import pytest

from voice2rx.core.exceptions import DuplicateEntryException
from voice2rx.model_orms.document_orm import (
    EkascribeDocumentORM,
    GSI_SESSION_TEMPLATE_INDEX,
)


@pytest.fixture
def orm():
    instance = EkascribeDocumentORM()
    instance.table = MagicMock()
    return instance


# ---------------------------------------------------------------------------
# create_document
# ---------------------------------------------------------------------------


class TestCreateDocument:
    def test_inserts_document_and_sets_defaults(self, orm):
        with patch.object(
            orm, "insert_if_not_exists", return_value={"success": True}
        ) as mock_insert:
            data = {"document_id": "doc-1", "template_id": "tmpl-1"}
            result = orm.create_document(data)

        assert result["document_id"] == "doc-1"
        assert result["archived"] is False
        assert result["errors"] == []
        assert result["warnings"] == []
        assert result["usage_information"] == {}
        assert "created_at" in result
        assert "updated_at" in result

        mock_insert.assert_called_once()
        _, kwargs = mock_insert.call_args
        assert kwargs["partition_key"] == "document_id"
        assert kwargs["partition_value"] == "doc-1"

    def test_defaults_template_id_when_missing(self, orm):
        with patch.object(
            orm, "insert_if_not_exists", return_value={"success": True}
        ):
            result = orm.create_document({"document_id": "doc-1"})
        assert result["template_id"] == "__non_tmp_doc"

    def test_raises_duplicate_when_insert_reports_duplicate(self, orm):
        with patch.object(
            orm,
            "insert_if_not_exists",
            return_value={"success": False, "code": "duplicate_entry"},
        ):
            with pytest.raises(DuplicateEntryException):
                orm.create_document({"document_id": "doc-1", "template_id": "t"})

    def test_raises_generic_exception_on_insert_failure(self, orm):
        with patch.object(
            orm,
            "insert_if_not_exists",
            return_value={"success": False, "error": "boom"},
        ):
            with pytest.raises(Exception):
                orm.create_document({"document_id": "doc-1", "template_id": "t"})


# ---------------------------------------------------------------------------
# get_document
# ---------------------------------------------------------------------------


class TestGetDocument:
    def test_returns_item_when_found(self, orm):
        with patch.object(orm, "get", return_value={"document_id": "doc-1"}):
            assert orm.get_document("doc-1") == {"document_id": "doc-1"}

    def test_returns_none_when_missing(self, orm):
        with patch.object(orm, "get", return_value=None):
            assert orm.get_document("doc-1") is None

    def test_reraises_on_error(self, orm):
        with patch.object(orm, "get", side_effect=RuntimeError("boom")):
            with pytest.raises(RuntimeError):
                orm.get_document("doc-1")


# ---------------------------------------------------------------------------
# get_documents_by_session / get_documents_by_session_and_template
# ---------------------------------------------------------------------------


class TestGetDocumentsBySession:
    def test_queries_gsi_with_session_id(self, orm):
        orm.table.query.return_value = {"Items": [{"document_id": "d1"}]}

        items = orm.get_documents_by_session("sess-1")

        assert items == [{"document_id": "d1"}]
        orm.table.query.assert_called_once()
        kwargs = orm.table.query.call_args.kwargs
        assert kwargs["IndexName"] == GSI_SESSION_TEMPLATE_INDEX
        assert "session_id = :sid" in kwargs["KeyConditionExpression"]
        assert kwargs["ExpressionAttributeValues"][":sid"] == "sess-1"

    def test_returns_empty_on_error(self, orm):
        orm.table.query.side_effect = RuntimeError("boom")
        assert orm.get_documents_by_session("sess-1") == []

    def test_returns_empty_when_no_items(self, orm):
        orm.table.query.return_value = {}
        assert orm.get_documents_by_session("sess-1") == []


class TestGetDocumentsBySessionAndTemplate:
    def test_queries_with_both_keys(self, orm):
        orm.table.query.return_value = {
            "Items": [{"document_id": "d1", "template_id": "t1"}]
        }

        items = orm.get_documents_by_session_and_template("sess-1", "t1")

        assert items == [{"document_id": "d1", "template_id": "t1"}]
        kwargs = orm.table.query.call_args.kwargs
        assert kwargs["IndexName"] == GSI_SESSION_TEMPLATE_INDEX
        assert "template_id = :tid" in kwargs["KeyConditionExpression"]
        assert kwargs["ExpressionAttributeValues"][":sid"] == "sess-1"
        assert kwargs["ExpressionAttributeValues"][":tid"] == "t1"

    def test_returns_empty_on_error(self, orm):
        orm.table.query.side_effect = RuntimeError("boom")
        assert orm.get_documents_by_session_and_template("sess-1", "t1") == []


# ---------------------------------------------------------------------------
# update_document / archive_document
# ---------------------------------------------------------------------------


class TestUpdateDocument:
    def test_delegates_to_base_update(self, orm):
        with patch.object(
            orm, "update", return_value={"document_id": "doc-1", "status": "success"}
        ) as mock_update:
            result = orm.update_document("doc-1", {"status": "success"})

        assert result["status"] == "success"
        mock_update.assert_called_once_with(
            key={"document_id": "doc-1"}, update_data={"status": "success"}
        )

    def test_reraises_on_error(self, orm):
        with patch.object(orm, "update", side_effect=RuntimeError("boom")):
            with pytest.raises(RuntimeError):
                orm.update_document("doc-1", {"status": "success"})


class TestArchiveDocument:
    def test_sets_archived_flag_and_timestamp(self, orm):
        with patch.object(
            orm, "update_document", return_value={"archived": True}
        ) as mock_update:
            result = orm.archive_document("doc-1")

        assert result == {"archived": True}
        mock_update.assert_called_once()
        args, _ = mock_update.call_args
        assert args[0] == "doc-1"
        update_data = args[1]
        assert update_data["archived"] is True
        assert "archived_at" in update_data

    def test_reraises_on_error(self, orm):
        with patch.object(
            orm, "update_document", side_effect=RuntimeError("boom")
        ):
            with pytest.raises(RuntimeError):
                orm.archive_document("doc-1")
