"""Tests for GET /voice/api/v2/transaction/history (session list).

Regression guard: /history is a literal path on the same router as the
/{txn_id} catch-all — it must be registered first, or "history" gets
treated as a transaction id (the exact bug that broke the FE sidebar).
"""

import orjson
from unittest.mock import patch

import pytest

ROUTER = "scribe.routers.transaction_actions"
URL = "/voice/api/v2/transaction/history"


def _jwt_header(uuid="user-1", b_id="biz-1"):
    return {
        "jwt-payload": orjson.dumps(
            {"uuid": uuid, "b-id": b_id, "iss": "test"}
        ).decode()
    }


class TestTransactionHistory:
    def test_returns_sessions_for_user(self, client):
        sessions = [
            {"txn_id": "sc-1", "created_at": "2026-08-10T10:00:00Z"},
            {"txn_id": "sc-2", "created_at": "2026-08-09T10:00:00Z"},
        ]
        with patch(f"{ROUTER}.transaction_service") as svc:
            svc.get_transactions.return_value = sessions
            response = client.get(f"{URL}?count=10", headers=_jwt_header())

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["retrieved_count"] == 2
        assert [t["txn_id"] for t in body["data"]] == ["sc-1", "sc-2"]
        svc.get_transactions.assert_called_once_with("user-1", limit=10)

    def test_oid_routes_to_patient_sessions(self, client):
        with patch(f"{ROUTER}.transaction_service") as svc:
            svc.get_patient_sessions.return_value = [{"txn_id": "sc-1"}]
            response = client.get(
                f"{URL}?count=5&oid=pat-9", headers=_jwt_header()
            )

        assert response.status_code == 200
        svc.get_patient_sessions.assert_called_once_with(
            b_id="biz-1", oid="pat-9", uuid="user-1", limit=5
        )

    def test_empty_returns_404(self, client):
        with patch(f"{ROUTER}.transaction_service") as svc:
            svc.get_transactions.return_value = []
            response = client.get(URL, headers=_jwt_header())

        assert response.status_code == 404
        assert response.json()["error"] == "No transactions found"

    def test_missing_uuid_returns_400(self, client):
        with patch(f"{ROUTER}.transaction_service"):
            response = client.get(URL, headers=_jwt_header(uuid=""))

        assert response.status_code == 400

    def test_history_is_not_swallowed_by_txn_id_route(self, client):
        """The literal /history path must win over /{txn_id}."""
        with patch(f"{ROUTER}.transaction_service") as svc:
            svc.get_transactions.return_value = [{"txn_id": "sc-1"}]
            response = client.get(URL, headers=_jwt_header())

        # the catch-all would have called get_transaction("history", ...)
        svc.get_transaction.assert_not_called()
        assert response.status_code == 200
