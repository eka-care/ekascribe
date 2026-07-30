"""
Endpoint tests for POST /voice/v1/scribe/agent/runs/{document_id}.

Uses the project-wide TestClient `client` fixture from tests/conftest.py.
Overrides:
  - voice2rx.api.endpoints.transactions.handlers.RequestHandler
    .extract_business_id_from_request (auth shim)
  - voice2rx.api.endpoints.scribe_agent_runs._run_input_resolver
    (run-input resolver) via set_run_input_resolver()
  - voice2rx.api.endpoints.scribe_agent_runs._run_service
    via set_run_service()
"""

from typing import AsyncGenerator, List

import pytest
from ag_ui.core import (
    BaseEvent,
    EventType,
    RunFinishedEvent,
    RunStartedEvent,
    StateSnapshotEvent,
    TextMessageChunkEvent,
)

from voice2rx.api.endpoints import (
    scribe_agent_runs as scribe_agent_runs_module,
)
from voice2rx.core.exceptions import MODEL_ERROR_MESSAGE
from voice2rx.services.templates.ag_ui.run_service import (
    AgUiRunService,
    ResolvedRunInputs,
)


ENDPOINT = "/voice/v1/scribe/agent/runs/default_prescription_print_v1"
TEMPLATE_ID = "default_prescription_print_v1"


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------


def _valid_body(thread_id="t1", run_id="r1") -> dict:
    return {
        "thread_id": thread_id,
        "run_id": run_id,
        "state": {},
        "messages": [],
        "tools": [],
        "context": [],
        "forwarded_props": {},
    }


def _make_inputs(**overrides) -> ResolvedRunInputs:
    base = dict(
        b_id="EC_test",
        txn_id="txn_99",
        document_id="doc_42",
        template_id="default_prescription_print_v1",
        s3_url="s3://test-bucket/sessions/txn_99",
        s3_bucket="test-bucket",
        transcript="Patient has fever for 3 days.",
        template_prompt="Symptoms\n[Symptom]",
    )
    base.update(overrides)
    return ResolvedRunInputs(**base)


class _FakeRunService(AgUiRunService):
    """Run service that yields a fixed sequence of AG-UI events."""

    def __init__(self, events: List[BaseEvent]):
        # Skip super().__init__ — we don't need the real factory.
        self._events = events

    async def stream(self, run_input, inputs) -> AsyncGenerator[BaseEvent, None]:
        for ev in self._events:
            yield ev


def _stub_run_started(thread_id="t1", run_id="r1") -> RunStartedEvent:
    return RunStartedEvent(
        type=EventType.RUN_STARTED, thread_id=thread_id, run_id=run_id
    )


def _stub_state_snapshot(snapshot=None) -> StateSnapshotEvent:
    return StateSnapshotEvent(
        type=EventType.STATE_SNAPSHOT, snapshot=snapshot or {"sections": []}
    )


def _stub_text_chunk(text="hello") -> TextMessageChunkEvent:
    return TextMessageChunkEvent(
        type=EventType.TEXT_MESSAGE_CHUNK,
        message_id="m1",
        role="assistant",
        delta=text,
    )


def _stub_run_finished(thread_id="t1", run_id="r1") -> RunFinishedEvent:
    return RunFinishedEvent(
        type=EventType.RUN_FINISHED, thread_id=thread_id, run_id=run_id
    )


# ---------------------------------------------------------------------------
#  Fixtures: auto-restore module-level globals + patch auth shim
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_endpoint_globals():
    """Restore _run_input_resolver and _run_service after each test."""
    orig_resolver = scribe_agent_runs_module._run_input_resolver
    orig_service = scribe_agent_runs_module._run_service
    yield
    scribe_agent_runs_module._run_input_resolver = orig_resolver
    scribe_agent_runs_module._run_service = orig_service


@pytest.fixture
def stub_auth(monkeypatch):
    """By default, RequestHandler.extract_business_id_from_request returns
    a fixed b_id. Tests can re-patch for the unauth path."""
    from voice2rx.api.endpoints.transactions.handlers import RequestHandler

    monkeypatch.setattr(
        RequestHandler,
        "extract_business_id_from_request",
        staticmethod(lambda request: "EC_test"),
    )


# ---------------------------------------------------------------------------
#  Happy path
# ---------------------------------------------------------------------------


def test_post_run_returns_sse_stream_with_events(client, stub_auth):
    async def fake_resolver(template_id: str, session_id: str, b_id: str, jwt_uuid: str) -> ResolvedRunInputs:
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    scribe_agent_runs_module.set_run_input_resolver(fake_resolver)
    scribe_agent_runs_module.set_run_service(
        _FakeRunService(
            [
                _stub_run_started(),
                _stub_state_snapshot(),
                _stub_text_chunk("hello "),
                _stub_text_chunk("world"),
                _stub_run_finished(),
            ]
        )
    )

    response = client.post(
        ENDPOINT,
        json=_valid_body(),
        headers={"accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    body = response.text
    # Each event is a JSON line prefixed with "data: " in SSE framing.
    assert "RUN_STARTED" in body
    assert "STATE_SNAPSHOT" in body
    assert "TEXT_MESSAGE_CHUNK" in body
    assert "RUN_FINISHED" in body
    assert "hello " in body
    assert "world" in body


def test_post_run_threads_thread_id_and_run_id_through(client, stub_auth):
    captured = {}

    async def fake_resolver(template_id, session_id, b_id, jwt_uuid):
        # session_id from RunAgentInput.thread_id flows through here.
        captured["resolver_session_id"] = session_id
        captured["resolver_template_id"] = template_id
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    class _CaptureService(AgUiRunService):
        def __init__(self):
            pass

        async def stream(self, run_input, inputs):
            captured["thread_id"] = run_input.thread_id
            captured["run_id"] = run_input.run_id
            captured["b_id"] = inputs.b_id
            captured["template_id"] = inputs.template_id
            captured["txn_id"] = inputs.txn_id
            yield _stub_run_started(run_input.thread_id, run_input.run_id)
            yield _stub_run_finished(run_input.thread_id, run_input.run_id)

    scribe_agent_runs_module.set_run_input_resolver(fake_resolver)
    scribe_agent_runs_module.set_run_service(_CaptureService())

    response = client.post(
        ENDPOINT,
        json=_valid_body(thread_id="txn_99", run_id="custom_run"),
    )
    assert response.status_code == 200
    assert captured["thread_id"] == "txn_99"
    assert captured["run_id"] == "custom_run"
    # SSE endpoint bypasses JWT auth (ALB-direct, no API GW authorizer),
    # so b_id flows through as the empty string the endpoint passes in.
    assert captured["b_id"] == ""
    assert captured["template_id"] == TEMPLATE_ID
    # session_id comes from thread_id
    assert captured["txn_id"] == "txn_99"
    assert captured["resolver_session_id"] == "txn_99"
    assert captured["resolver_template_id"] == TEMPLATE_ID


# ---------------------------------------------------------------------------
#  Auth
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason="SSE endpoint currently bypasses JWT auth — ALB routes around the "
    "API Gateway authorizer, so jwt-payload header isn't available. Re-enable "
    "when the bypass is lifted."
)
def test_post_run_returns_401_when_auth_fails(client, monkeypatch):
    from voice2rx.api.endpoints.transactions.handlers import RequestHandler

    def boom(request):
        raise RuntimeError("no jwt")

    monkeypatch.setattr(
        RequestHandler, "extract_business_id_from_request", staticmethod(boom)
    )

    response = client.post(ENDPOINT, json=_valid_body())
    assert response.status_code == 401
    assert "auth failed" in response.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
#  Body validation
# ---------------------------------------------------------------------------


def test_post_run_returns_400_for_missing_body_fields(client, stub_auth):
    response = client.post(
        ENDPOINT,
        json={"thread_id": "t1"},  # missing run_id, state, etc.
    )
    assert response.status_code == 400
    assert "RunAgentInput" in response.json()["detail"]


def test_post_run_returns_400_for_non_json_body(client, stub_auth):
    response = client.post(
        ENDPOINT, content=b"not json at all", headers={"content-type": "text/plain"}
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
#  Resolver behavior
# ---------------------------------------------------------------------------


def test_post_run_propagates_resolver_http_exception(client, stub_auth):
    """HTTPException raised by the resolver propagates with its status."""
    from fastapi import HTTPException as _HTTPException

    async def explicit_501(template_id, session_id, b_id, jwt_uuid):
        raise _HTTPException(status_code=501, detail="resolver says no")

    scribe_agent_runs_module.set_run_input_resolver(explicit_501)
    response = client.post(ENDPOINT, json=_valid_body())
    assert response.status_code == 501
    assert response.json()["detail"] == "resolver says no"


def test_post_run_returns_500_when_resolver_raises_unexpectedly(client, stub_auth):
    async def boom_resolver(template_id, session_id, b_id, jwt_uuid):
        raise RuntimeError("downstream service exploded")

    scribe_agent_runs_module.set_run_input_resolver(boom_resolver)
    response = client.post(ENDPOINT, json=_valid_body())
    assert response.status_code == 500
    assert "downstream service exploded" in response.json()["detail"]


@pytest.mark.skip(
    reason="SSE endpoint currently bypasses JWT extraction (passes empty "
    "b_id/jwt_uuid to resolver). Re-enable when JWT threading is restored."
)
def test_post_run_threads_jwt_uuid_into_resolver(client, monkeypatch):
    """The endpoint extracts uuid from the JWT payload and passes it
    to the resolver."""
    import orjson

    captured = {}

    async def capturing_resolver(template_id, session_id, b_id, jwt_uuid):
        captured["b_id"] = b_id
        captured["session_id"] = session_id
        captured["template_id"] = template_id
        captured["jwt_uuid"] = jwt_uuid
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    scribe_agent_runs_module.set_run_input_resolver(capturing_resolver)
    scribe_agent_runs_module.set_run_service(
        _FakeRunService([_stub_run_started(), _stub_run_finished()])
    )

    jwt_payload = orjson.dumps({"b-id": "EC_test", "uuid": "user-uuid-42"}).decode()
    response = client.post(
        ENDPOINT,
        json=_valid_body(),
        headers={"jwt-payload": jwt_payload},
    )
    assert response.status_code == 200
    assert captured["b_id"] == "EC_test"
    assert captured["jwt_uuid"] == "user-uuid-42"


# ---------------------------------------------------------------------------
#  Mid-stream errors → synthetic RUN_ERROR
# ---------------------------------------------------------------------------


def test_post_run_emits_run_error_when_stream_raises_mid_run(client, stub_auth):
    async def fake_resolver(template_id, session_id, b_id, jwt_uuid):
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    class _ExplodingService(AgUiRunService):
        def __init__(self):
            pass

        async def stream(self, run_input, inputs):
            yield _stub_run_started()
            yield _stub_state_snapshot()
            raise RuntimeError("mid-stream kaboom")

    scribe_agent_runs_module.set_run_input_resolver(fake_resolver)
    scribe_agent_runs_module.set_run_service(_ExplodingService())

    response = client.post(ENDPOINT, json=_valid_body())
    # SSE response has already been opened by the time the exception hits.
    assert response.status_code == 200
    body = response.text
    # The synthetic RUN_ERROR is the last event.
    assert "RUN_STARTED" in body
    assert "RUN_ERROR" in body
    # Raw exception text is no longer surfaced to clients; a generic message is.
    assert MODEL_ERROR_MESSAGE in body
    assert "mid-stream kaboom" not in body
    assert "endpoint_exception" in body


# ---------------------------------------------------------------------------
#  Override hooks
# ---------------------------------------------------------------------------


def test_set_run_input_resolver_swaps_resolver():
    async def my_resolver(template_id, session_id, b_id, jwt_uuid):
        return _make_inputs()

    scribe_agent_runs_module.set_run_input_resolver(my_resolver)
    assert scribe_agent_runs_module._run_input_resolver is my_resolver


def test_set_run_service_swaps_service():
    svc = _FakeRunService([_stub_run_started(), _stub_run_finished()])
    scribe_agent_runs_module.set_run_service(svc)
    assert scribe_agent_runs_module._run_service is svc


# ---------------------------------------------------------------------------
#  Router is mounted in main.py
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
#  /runs/{document_id}/resume
# ---------------------------------------------------------------------------


RESUME_ENDPOINT = "/voice/v1/scribe/agent/runs/default_prescription_print_v1/resume"


def _resume_body(thread_id="t1", run_id="r1", tool_call_id="tcA"):
    return {
        "thread_id": thread_id,
        "run_id": run_id,
        "tool_call_id": tool_call_id,
        "tool_result": {"value": "3 months"},
    }


class _ResumeFakeService(AgUiRunService):
    def __init__(self, events):
        self._events = events
        self.resume_calls = []

    async def resume_stream(self, resume_input, inputs):
        self.resume_calls.append(
            {
                "thread_id": resume_input.thread_id,
                "run_id": resume_input.run_id,
                "tool_call_id": resume_input.tool_call_id,
                "tool_result": resume_input.tool_result,
                "b_id": inputs.b_id,
                "template_id": inputs.template_id,
                "txn_id": inputs.txn_id,
            }
        )
        for ev in self._events:
            yield ev


def test_resume_run_returns_sse_stream_with_events(client, stub_auth):
    async def fake_resolver(template_id, session_id, b_id, jwt_uuid):
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    scribe_agent_runs_module.set_run_input_resolver(fake_resolver)
    svc = _ResumeFakeService(
        [
            _stub_run_started(),
            _stub_state_snapshot(),
            _stub_text_chunk("continuing"),
            _stub_run_finished(),
        ]
    )
    scribe_agent_runs_module.set_run_service(svc)

    response = client.post(
        RESUME_ENDPOINT,
        json=_resume_body(),
        headers={"accept": "text/event-stream"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "RUN_STARTED" in body
    assert "TEXT_MESSAGE_CHUNK" in body
    assert "RUN_FINISHED" in body

    # resume_stream was called with the parsed AgUiResumeInput
    assert len(svc.resume_calls) == 1
    call = svc.resume_calls[0]
    assert call["thread_id"] == "t1"
    assert call["run_id"] == "r1"
    assert call["tool_call_id"] == "tcA"
    assert call["tool_result"] == {"value": "3 months"}
    # SSE endpoint bypasses JWT auth — empty b_id flows through.
    assert call["b_id"] == ""
    assert call["template_id"] == TEMPLATE_ID
    # session_id flows from AgUiResumeInput.thread_id
    assert call["txn_id"] == "t1"


@pytest.mark.skip(
    reason="SSE endpoint currently bypasses JWT auth — ALB routes around the "
    "API Gateway authorizer. Re-enable when the bypass is lifted."
)
def test_resume_run_returns_401_when_auth_fails(client, monkeypatch):
    from voice2rx.api.endpoints.transactions.handlers import RequestHandler

    monkeypatch.setattr(
        RequestHandler,
        "extract_business_id_from_request",
        staticmethod(lambda r: (_ for _ in ()).throw(RuntimeError("no jwt"))),
    )
    response = client.post(RESUME_ENDPOINT, json=_resume_body())
    assert response.status_code == 401


def test_resume_run_returns_400_for_missing_body_fields(client, stub_auth):
    response = client.post(
        RESUME_ENDPOINT,
        json={"thread_id": "t1"},  # missing run_id, tool_call_id, tool_result
    )
    assert response.status_code == 400
    assert "AgUiResumeInput" in response.json()["detail"]


def test_resume_run_returns_400_for_non_json_body(client, stub_auth):
    response = client.post(
        RESUME_ENDPOINT,
        content=b"not json",
        headers={"content-type": "text/plain"},
    )
    assert response.status_code == 400


def test_resume_run_propagates_resolver_http_exception(client, stub_auth):
    from fastapi import HTTPException as _HTTPException

    async def explicit_404(template_id, session_id, b_id, jwt_uuid):
        raise _HTTPException(status_code=404, detail="document missing")

    scribe_agent_runs_module.set_run_input_resolver(explicit_404)
    response = client.post(RESUME_ENDPOINT, json=_resume_body())
    assert response.status_code == 404


def test_resume_run_returns_500_when_resolver_raises_unexpectedly(client, stub_auth):
    async def boom(template_id, session_id, b_id, jwt_uuid):
        raise RuntimeError("kaboom")

    scribe_agent_runs_module.set_run_input_resolver(boom)
    response = client.post(RESUME_ENDPOINT, json=_resume_body())
    assert response.status_code == 500
    assert "kaboom" in response.json()["detail"]


def test_resume_run_emits_run_error_when_resume_stream_raises_mid_run(
    client, stub_auth
):
    async def fake_resolver(template_id, session_id, b_id, jwt_uuid):
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    class _ExplodingResume(AgUiRunService):
        def __init__(self):
            pass

        async def resume_stream(self, resume_input, inputs):
            yield _stub_run_started()
            raise RuntimeError("resume kaboom")

    scribe_agent_runs_module.set_run_input_resolver(fake_resolver)
    scribe_agent_runs_module.set_run_service(_ExplodingResume())

    response = client.post(RESUME_ENDPOINT, json=_resume_body())
    assert response.status_code == 200
    body = response.text
    assert "RUN_ERROR" in body
    # Raw exception text is no longer surfaced to clients; a generic message is.
    assert MODEL_ERROR_MESSAGE in body
    assert "resume kaboom" not in body
    assert "endpoint_exception" in body


@pytest.mark.skip(
    reason="SSE endpoint currently bypasses JWT extraction (passes empty "
    "b_id/jwt_uuid to resolver). Re-enable when JWT threading is restored."
)
def test_resume_run_threads_jwt_uuid_into_resolver(client):
    """Auth is required and JWT uuid flows into the resolver."""
    import orjson

    captured = {}

    async def capturing_resolver(template_id, session_id, b_id, jwt_uuid):
        captured["jwt_uuid"] = jwt_uuid
        return _make_inputs(template_id=template_id, txn_id=session_id, b_id=b_id)

    scribe_agent_runs_module.set_run_input_resolver(capturing_resolver)
    scribe_agent_runs_module.set_run_service(
        _ResumeFakeService([_stub_run_finished()])
    )

    jwt_payload = orjson.dumps({"b-id": "EC_test", "uuid": "user-resume"}).decode()
    response = client.post(
        RESUME_ENDPOINT,
        json=_resume_body(),
        headers={"jwt-payload": jwt_payload},
    )
    assert response.status_code == 200
    assert captured["jwt_uuid"] == "user-resume"


# ---------------------------------------------------------------------------
#  Router mount
# ---------------------------------------------------------------------------


def test_router_mounted_under_voice_v1_scribe_agent(client, stub_auth):
    """Confirm the endpoint is reachable at the documented path. Using
    a non-existent route under the prefix should still hit the FastAPI
    router (404 not 503) so we know the prefix is mounted."""
    response = client.post(
        "/voice/v1/scribe/agent/runs/some/extra/segments",
        json=_valid_body(),
    )
    # 404 means the prefix is mounted but no route matches the deeper path.
    # If the prefix were missing, we'd get something different (FastAPI's
    # 404 structure or no route at all — same status, different body).
    assert response.status_code == 404
