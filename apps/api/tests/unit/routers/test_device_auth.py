"""Unit tests for the device authorization flow (RFC 8628).

Calls the endpoint functions directly with an in-memory table store — no
Postgres, no middleware. The middleware exemption list is asserted separately.
"""

import json
import time
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from scribe.routers import device_auth_routes as dar
from scribe.routers.device_auth_routes import (
    ApproveRequest,
    TokenRequest,
    approve_device_code,
    create_device_code,
    poll_device_token,
)


# --- In-memory stand-in for scribe_core.db tables ---------------------------
class FakeTable:
    def __init__(self, pk):
        self.pk = pk
        self.rows = {}

    def _key(self, item_or_keys):
        return tuple(item_or_keys[k] for k in self.pk)

    def put_item(self, item, if_not_exists=False):
        from scribe_core.db import ConditionalCheckFailed

        key = self._key(item)
        if if_not_exists and key in self.rows:
            raise ConditionalCheckFailed(str(key))
        self.rows[key] = dict(item)

    def get_item(self, keys):
        row = self.rows.get(self._key(keys))
        return dict(row) if row else None

    def update_item(self, keys, updates, require_exists=True):
        key = self._key(keys)
        if key in self.rows:
            self.rows[key].update(updates)

    def find(self, where=None, **kwargs):
        # Mirror pg_engine's API: a list of (field, op, value) tuples.
        # Dict-style filters are a bug (pg_engine crashes on them) — fail loudly.
        assert where is None or isinstance(where, list), "find() takes a list of conditions"
        conds = where or []
        assert all(len(c) == 3 and c[1] == "eq" for c in conds)
        return [
            dict(r)
            for r in self.rows.values()
            if all(r.get(f) == v for f, _, v in conds)
        ]


class FakeDB:
    SPECS = {
        "device_auth": ("device_code_hash",),
        "users": ("username",),
        "refresh_tokens": ("token_hash",),
    }

    def __init__(self):
        self.tables = {n: FakeTable(pk) for n, pk in self.SPECS.items()}

    def get_table(self, name):
        return self.tables[name]


JWT_SETTINGS = SimpleNamespace(
    auth_mode="jwt",
    self_url="http://localhost:8000",
    auth_jwt_secret="test-secret",
    auth_access_ttl_seconds=900,
    auth_refresh_ttl_seconds=2592000,
    auth_issuer="scribe.local",
    dev_b_id="onprem-workspace",
    dev_client_id=None,
)

DEV_SETTINGS = SimpleNamespace(auth_mode="dev")

USER = {
    "username": "doc1",
    "display_name": "Dr. One",
    "uuid": "u-1",
    "oid": "o-1",
    "b_id": "onprem-workspace",
    "is_active": True,
}


def body_of(resp):
    return json.loads(resp.body)


def request_as(username):
    return SimpleNamespace(headers={"jwt-payload": json.dumps({"sub": username})})


@pytest.fixture
def db():
    fake = FakeDB()
    fake.tables["users"].put_item(dict(USER))
    with patch.object(dar, "get_table", fake.get_table), \
         patch.object(dar, "get_settings", lambda: JWT_SETTINGS), \
         patch("scribe_core.auth.get_settings", lambda: JWT_SETTINGS), \
         patch("scribe_core.db.get_table", fake.get_table):
        yield fake


def age_poll(db, device_code, seconds=10):
    """Push last_polled_at into the past so the next poll isn't throttled."""
    key = (dar._hash_device_code(device_code),)
    db.tables["device_auth"].rows[key]["last_polled_at"] = int(time.time()) - seconds


class TestDeviceCode:
    def test_dev_mode_rejected(self):
        with patch.object(dar, "get_settings", lambda: DEV_SETTINGS):
            for resp in (
                create_device_code(),
                approve_device_code(ApproveRequest(user_code="AAAA-BBBB"), request_as("x")),
                poll_device_token(TokenRequest(device_code="zzz")),
            ):
                assert resp.status_code == 400
                assert b"unsupported_auth_mode" in resp.body

    def test_create_returns_rfc_fields(self, db):
        data = body_of(create_device_code())
        assert set(data) >= {
            "device_code", "user_code", "verification_uri",
            "verification_uri_complete", "expires_in", "interval",
        }
        assert data["verification_uri"].endswith("/auth/activate")
        assert data["user_code"] in data["verification_uri_complete"]
        # stored hashed, never raw
        stored = list(db.tables["device_auth"].rows.values())[0]
        assert data["device_code"] not in json.dumps(stored)
        assert stored["status"] == "pending"

    def test_full_happy_path(self, db):
        start = body_of(create_device_code())
        dc, uc = start["device_code"], start["user_code"]

        pending = poll_device_token(TokenRequest(device_code=dc))
        assert b"authorization_pending" in pending.body

        ok = approve_device_code(ApproveRequest(user_code=uc), request_as("doc1"))
        assert body_of(ok)["result"] == "approved"

        age_poll(db, dc)
        tokens = body_of(poll_device_token(TokenRequest(device_code=dc)))
        assert tokens["status"] == "success"
        assert tokens["access_token"] and tokens["refresh_token"]
        assert tokens["user"]["username"] == "doc1"

        # access token carries the app's identity claims
        import jwt

        claims = jwt.decode(tokens["access_token"], "test-secret", algorithms=["HS256"])
        assert claims["sub"] == "doc1"
        assert claims["uuid"] == "u-1"

        # single use: a second poll cannot mint again
        age_poll(db, dc)
        again = poll_device_token(TokenRequest(device_code=dc))
        assert b"expired_token" in again.body

    def test_deny(self, db):
        start = body_of(create_device_code())
        dc, uc = start["device_code"], start["user_code"]
        approve_device_code(ApproveRequest(user_code=uc, action="deny"), request_as("doc1"))
        age_poll(db, dc)
        resp = poll_device_token(TokenRequest(device_code=dc))
        assert b"access_denied" in resp.body

    def test_approve_normalizes_user_code(self, db):
        start = body_of(create_device_code())
        raw = start["user_code"].replace("-", "").lower()  # 'abcd2345'
        ok = approve_device_code(ApproveRequest(user_code=raw), request_as("doc1"))
        assert body_of(ok)["result"] == "approved"

    def test_approve_unknown_or_bad_code(self, db):
        assert approve_device_code(
            ApproveRequest(user_code="ZZZZ-ZZZZ"), request_as("doc1")
        ).status_code == 404
        assert approve_device_code(
            ApproveRequest(user_code="nope"), request_as("doc1")
        ).status_code == 400

    def test_approve_requires_session_claims(self, db):
        resp = approve_device_code(
            ApproveRequest(user_code="AAAA-BBBB"), SimpleNamespace(headers={})
        )
        assert resp.status_code == 401

    def test_expired_code(self, db):
        start = body_of(create_device_code())
        dc, uc = start["device_code"], start["user_code"]
        key = (dar._hash_device_code(dc),)
        db.tables["device_auth"].rows[key]["expires_at"] = int(time.time()) - 1

        assert approve_device_code(
            ApproveRequest(user_code=uc), request_as("doc1")
        ).status_code == 404
        assert b"expired_token" in poll_device_token(TokenRequest(device_code=dc)).body

    def test_slow_down_throttle(self, db):
        start = body_of(create_device_code())
        dc = start["device_code"]
        poll_device_token(TokenRequest(device_code=dc))  # sets last_polled_at
        resp = poll_device_token(TokenRequest(device_code=dc))
        assert b"slow_down" in resp.body

    def test_unknown_device_code(self, db):
        resp = poll_device_token(TokenRequest(device_code="not-a-real-code"))
        assert resp.status_code == 400
        assert b"invalid_device_code" in resp.body

    def test_inactive_user_gets_denied(self, db):
        db.tables["users"].rows[("doc1",)]["is_active"] = False
        start = body_of(create_device_code())
        dc, uc = start["device_code"], start["user_code"]
        approve_device_code(ApproveRequest(user_code=uc), request_as("doc1"))
        age_poll(db, dc)
        resp = poll_device_token(TokenRequest(device_code=dc))
        assert b"access_denied" in resp.body


class TestMiddlewareExemptions:
    def test_code_and_token_exempt_but_not_approve(self):
        from scribe_core.auth import CookieAuthMiddleware

        exempt = CookieAuthMiddleware.EXEMPT_PREFIXES
        assert "/connect-auth/v1/device/code" in exempt
        assert "/connect-auth/v1/device/token" in exempt
        assert not any(
            "/connect-auth/v1/device/approve".startswith(p) for p in exempt
        ), "approve must require the session cookie"
