"""Unit tests for the messenger webhook backend."""

import asyncio
from unittest.mock import patch

import httpx
import pytest

from voice2rx.services.webhooks.backends.messenger import (
    DEV_MESSENGER_URL,
    PROD_MESSENGER_URL,
    MessengerBackend,
    get_messenger_url,
)

ENVELOPE = {"event_id": "scribe_session_init", "payload": {"data": {}}}


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data
        self.text = text

    def json(self):
        if self._json is None:
            raise ValueError("no json body")
        return self._json


class _FakeClient:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.posts = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, json=None):
        self.posts.append((url, json))
        if self._exc:
            raise self._exc
        return self._response


def _send(backend, fake_client, **kwargs):
    with patch(
        "voice2rx.services.webhooks.backends.messenger.httpx.AsyncClient",
        return_value=fake_client,
    ):
        return asyncio.run(backend.send(ENVELOPE, **kwargs))


class TestMessengerBackendSend:
    def test_2xx_is_success(self):
        fake = _FakeClient(response=_FakeResponse(200, json_data={"ok": True}))
        result = _send(MessengerBackend(url="http://messenger.test"), fake)

        assert result.success is True
        assert result.status_code == 200
        assert result.response_body == {"ok": True}
        assert fake.posts == [("http://messenger.test", ENVELOPE)]

    def test_non_2xx_is_failure_with_status_code(self):
        fake = _FakeClient(response=_FakeResponse(500, text="server error"))
        result = _send(MessengerBackend(url="http://messenger.test"), fake)

        assert result.success is False
        assert result.status_code == 500
        assert result.response_body == {"raw_text": "server error"}

    def test_connect_error_is_failure_with_error_string(self):
        fake = _FakeClient(exc=httpx.ConnectError("connection refused"))
        result = _send(MessengerBackend(url="http://messenger.test"), fake)

        assert result.success is False
        assert result.status_code is None
        assert "connection refused" in result.error

    def test_url_override_wins(self):
        fake = _FakeClient(response=_FakeResponse(200, json_data={}))
        _send(
            MessengerBackend(url="http://messenger.test"),
            fake,
            url_override="http://client-endpoint.test",
        )

        assert fake.posts[0][0] == "http://client-endpoint.test"


class TestMessengerUrlSelection:
    def test_prod_env_uses_prod_url(self, monkeypatch):
        monkeypatch.delenv("MESSENGER_WEBHOOK_URL", raising=False)
        monkeypatch.setenv("ENV", "prod")
        assert get_messenger_url() == PROD_MESSENGER_URL

    @pytest.mark.parametrize("env", ["", "dev", "stage"])
    def test_non_prod_env_uses_dev_url(self, monkeypatch, env):
        monkeypatch.delenv("MESSENGER_WEBHOOK_URL", raising=False)
        monkeypatch.setenv("ENV", env)
        assert get_messenger_url() == DEV_MESSENGER_URL

    def test_env_var_override_wins(self, monkeypatch):
        monkeypatch.setenv("MESSENGER_WEBHOOK_URL", "http://override.test")
        monkeypatch.setenv("ENV", "prod")
        assert get_messenger_url() == "http://override.test"
