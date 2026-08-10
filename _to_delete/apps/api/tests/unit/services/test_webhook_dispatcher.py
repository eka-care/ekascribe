"""Unit tests for the pluggable async webhook dispatcher and emit bridge."""

import asyncio
import threading
from unittest.mock import AsyncMock, patch

import pytest

from voice2rx.services.webhooks import (
    EVENT_REGISTRY,
    ScribeEvent,
    WebhookDispatcher,
    build_envelope,
    emit,
    emit_raw,
    set_dispatcher,
)
from voice2rx.services.webhooks.backends.base import DeliveryResult, WebhookBackend

TXN_ID = "txn-123"
B_ID = "EC_test"
C_ID = "C_test"


class RecordingBackend(WebhookBackend):
    name = "recording"

    def __init__(self, results=None):
        self.calls = []
        self._results = list(results or [])

    async def send(self, envelope, url_override=None):
        self.calls.append((envelope, url_override))
        if self._results:
            return self._results.pop(0)
        return DeliveryResult(success=True, status_code=200)


def _dispatch(dispatcher, **kwargs):
    kwargs.setdefault("b_id", B_ID)
    kwargs.setdefault("c_id", C_ID)
    kwargs.setdefault("txn_id", TXN_ID)
    return asyncio.run(dispatcher.dispatch(ScribeEvent.SESSION_INIT, **kwargs))


class TestDispatcherGate:
    @pytest.mark.parametrize("c_id", [None, ""])
    def test_skips_when_not_connect_client(self, c_id):
        backend = RecordingBackend()
        result = _dispatch(WebhookDispatcher(backend=backend), c_id=c_id)

        assert result.success is False
        assert result.error == "not_connect_client"
        assert backend.calls == []

    def test_dispatch_raw_gates_on_client_id(self):
        backend = RecordingBackend()
        dispatcher = WebhookDispatcher(backend=backend)
        envelope = build_envelope(
            "scribe.document.publish", b_id=B_ID, c_id="", txn_id=TXN_ID, data={}
        )

        result = asyncio.run(dispatcher.dispatch_raw(envelope))

        assert result.error == "not_connect_client"
        assert backend.calls == []


class TestDispatcherEnvelope:
    def test_envelope_matches_messenger_contract(self):
        backend = RecordingBackend()
        result = _dispatch(
            WebhookDispatcher(backend=backend), data={"session_id": TXN_ID}
        )

        assert result.success is True
        envelope, url_override = backend.calls[0]
        assert url_override is None
        assert envelope["business_id"] == B_ID
        assert envelope["client_id"] == C_ID
        assert envelope["service_id"] == "v2rx"
        assert envelope["event_id"] == ScribeEvent.SESSION_INIT.value
        payload = envelope["payload"]
        assert payload["service"] == "v2rx"
        assert payload["event"] == ScribeEvent.SESSION_INIT.value
        assert payload["transaction_id"] == TXN_ID
        assert isinstance(payload["event_time"], int)
        assert payload["data"] == {"session_id": TXN_ID}

    def test_dispatch_raw_passes_envelope_through_untouched(self):
        backend = RecordingBackend()
        dispatcher = WebhookDispatcher(backend=backend)
        envelope = {
            "business_id": B_ID,
            "client_id": C_ID,
            "service_id": "v2rx",
            "event_id": "scribe.document.publish",
            "payload": {"custom": "shape"},
        }

        result = asyncio.run(
            dispatcher.dispatch_raw(envelope, url_override="http://custom")
        )

        assert result.success is True
        assert backend.calls == [(envelope, "http://custom")]

    def test_all_scribe_events_are_registered(self):
        assert {e.value for e in ScribeEvent} == set(EVENT_REGISTRY.keys())


class TestDispatcherRetry:
    def test_retries_until_success(self):
        backend = RecordingBackend(
            results=[
                DeliveryResult(success=False, status_code=500),
                DeliveryResult(success=False, error="boom"),
                DeliveryResult(success=True, status_code=200),
            ]
        )
        dispatcher = WebhookDispatcher(backend=backend)

        with patch(
            "voice2rx.services.webhooks.dispatcher.asyncio.sleep", new=AsyncMock()
        ) as mock_sleep:
            result = _dispatch(dispatcher)

        assert result.success is True
        assert result.attempts == 3
        assert len(backend.calls) == 3
        # exponential backoff: 1s then 2s
        assert [c.args[0] for c in mock_sleep.await_args_list] == [1.0, 2.0]

    def test_exhaustion_returns_failure_without_raising(self):
        backend = RecordingBackend(
            results=[DeliveryResult(success=False, status_code=503)] * 3
        )
        dispatcher = WebhookDispatcher(backend=backend)

        with patch(
            "voice2rx.services.webhooks.dispatcher.asyncio.sleep", new=AsyncMock()
        ):
            result = _dispatch(dispatcher)

        assert result.success is False
        assert result.attempts == 3
        assert len(backend.calls) == 3

    def test_backend_exception_is_swallowed(self):
        backend = RecordingBackend()
        backend.send = AsyncMock(side_effect=RuntimeError("backend blew up"))
        dispatcher = WebhookDispatcher(backend=backend)

        result = _dispatch(dispatcher)

        assert result.success is False
        assert "backend blew up" in result.error


class _FakeDispatcher:
    """Records dispatch calls and signals completion across threads."""

    def __init__(self):
        self.done = threading.Event()
        self.calls = []

    async def dispatch(self, event_id, **kwargs):
        self.calls.append((event_id, kwargs))
        self.done.set()
        return DeliveryResult(success=True)

    async def dispatch_raw(self, envelope, url_override=None):
        self.calls.append((envelope, url_override))
        self.done.set()
        return DeliveryResult(success=True)


class TestEmitBridge:
    def teardown_method(self):
        set_dispatcher(None)

    def test_emit_from_sync_context_uses_background_loop(self):
        fake = _FakeDispatcher()
        set_dispatcher(fake)

        emit(ScribeEvent.SESSION_INIT, b_id=B_ID, c_id=C_ID, txn_id=TXN_ID)

        assert fake.done.wait(timeout=2), "dispatch never ran on background loop"
        event_id, kwargs = fake.calls[0]
        assert event_id == ScribeEvent.SESSION_INIT
        assert kwargs["txn_id"] == TXN_ID

    def test_emit_from_running_loop_schedules_task(self):
        fake = _FakeDispatcher()
        set_dispatcher(fake)

        async def scenario():
            emit(ScribeEvent.SESSION_END, b_id=B_ID, c_id=C_ID, txn_id=TXN_ID)
            await asyncio.sleep(0.05)

        asyncio.run(scenario())

        assert fake.done.is_set()
        assert fake.calls[0][0] == ScribeEvent.SESSION_END

    def test_in_flight_task_is_strongly_referenced(self):
        import voice2rx.services.webhooks as webhooks_pkg

        fake = _FakeDispatcher()
        release = asyncio.Event()

        async def slow_dispatch(event_id, **kwargs):
            await release.wait()
            fake.done.set()
            return DeliveryResult(success=True)

        fake.dispatch = slow_dispatch
        set_dispatcher(fake)

        async def scenario():
            emit(ScribeEvent.SESSION_INIT, b_id=B_ID, c_id=C_ID, txn_id=TXN_ID)
            await asyncio.sleep(0)
            # the loop only weak-refs tasks; the package must hold a strong ref
            # while dispatch is in flight, and drop it once done
            assert len(webhooks_pkg._pending_tasks) == 1
            release.set()
            await asyncio.sleep(0.05)
            assert len(webhooks_pkg._pending_tasks) == 0

        asyncio.run(scenario())
        assert fake.done.is_set()

    def test_emit_raw_from_sync_context(self):
        fake = _FakeDispatcher()
        set_dispatcher(fake)
        envelope = {"event_id": "scribe.document.publish", "client_id": C_ID}

        emit_raw(envelope, url_override="http://custom")

        assert fake.done.wait(timeout=2)
        assert fake.calls[0] == (envelope, "http://custom")

    def test_emit_never_raises(self):
        broken = _FakeDispatcher()

        def boom(*args, **kwargs):
            raise RuntimeError("cannot even build the coroutine")

        broken.dispatch = boom
        set_dispatcher(broken)

        emit(ScribeEvent.SESSION_INIT, b_id=B_ID, c_id=C_ID, txn_id=TXN_ID)
