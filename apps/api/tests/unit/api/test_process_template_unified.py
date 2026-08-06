"""
Tests for the unified process-template endpoint (LIFE-2402):

POST /voice/v1/sessions/{session_id}/process/template[/{template_id}]?document_id=

- x-protocol dispatch: "ag-ui" (default, SSE stream)
- x-format validated (html/markdown/json) but unused
- document_id query param: derives template_id from the document, validates
  session ownership / template consistency, and processes into that document
  (without it, a fresh document is created per request)
"""

import json
from typing import AsyncGenerator, List
from unittest.mock import MagicMock

import pytest
from ag_ui.core import (
    BaseEvent,
    EventType,
    RunFinishedEvent,
    RunStartedEvent,
)

from voice2rx.api.endpoints import scribe_agent_runs as scribe_agent_runs_module
from voice2rx.protocol.services import process_template_service
from voice2rx.services.templates import template_result_common
from voice2rx.services.templates.ag_ui.run_service import (
    AgUiRunService,
    ResolvedRunInputs,
)


SESSION_ID = "txn_unified_1"
TEMPLATE_ID = "tpl_visual"
B_ID = "EC_test"
ENDPOINT = f"/voice/v1/sessions/{SESSION_ID}/process/template/{TEMPLATE_ID}"
ENDPOINT_NO_TID = f"/voice/v1/sessions/{SESSION_ID}/process/template"

AUTH_HEADERS = {"jwt-payload": json.dumps({"b-id": B_ID, "uuid": "user-uuid"})}


def _transaction():
    return {
        "uuid": "user-uuid",
        "b_id": B_ID,
        "flavour": "ekascribe-web",
        "user_status": "commit",
        "request_templates": {
            "visual": [{"template_id": TEMPLATE_ID}],
            "integration": [],
        },
        "s3_url": f"s3://test-bucket/{SESSION_ID}",
    }


def _make_inputs(**overrides) -> ResolvedRunInputs:
    base = dict(
        b_id=B_ID,
        txn_id=SESSION_ID,
        document_id="doc_run",
        template_id=TEMPLATE_ID,
        s3_url=f"s3://test-bucket/{SESSION_ID}",
        s3_bucket="test-bucket",
        transcript="Patient has fever.",
        template_prompt="Symptoms\n[Symptom]",
    )
    base.update(overrides)
    return ResolvedRunInputs(**base)


class _FakeRunService(AgUiRunService):
    def __init__(self, events: List[BaseEvent]):
        self._events = events
        self.stream_calls = []

    async def stream(self, run_input, inputs) -> AsyncGenerator[BaseEvent, None]:
        self.stream_calls.append({"run_input": run_input, "inputs": inputs})
        for ev in self._events:
            yield ev


def _stub_events():
    return [
        RunStartedEvent(type=EventType.RUN_STARTED, thread_id=SESSION_ID, run_id="r1"),
        RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=SESSION_ID, run_id="r1"),
    ]


# ---------------------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_agent_runs_globals():
    orig_resolver = scribe_agent_runs_module._run_input_resolver
    orig_service = scribe_agent_runs_module._run_service
    yield
    scribe_agent_runs_module._run_input_resolver = orig_resolver
    scribe_agent_runs_module._run_service = orig_service


@pytest.fixture
def mock_docs(monkeypatch):
    """Replace the shared document_service / template_service used by the
    process-template service and check_and_initialize_documents. Without an
    explicit document_id, a fresh document is always created."""
    doc_service = MagicMock()
    doc_service.create_document.return_value = {"document_id": "doc_created"}
    monkeypatch.setattr(template_result_common, "document_service", doc_service)
    monkeypatch.setattr(
        template_result_common,
        "template_service",
        MagicMock(get_template=lambda template_id: {"title": "Visual"}),
    )
    return doc_service


@pytest.fixture
def mock_session(monkeypatch, mock_docs):
    monkeypatch.setattr(
        process_template_service.transaction_service,
        "get_transaction",
        lambda session_id, b_id: _transaction(),
    )
    background_calls = []
    monkeypatch.setattr(
        process_template_service.document_tiptap_service,
        "get_document_record",
        lambda document_id: None,
    )
    return background_calls


# ---------------------------------------------------------------------------
#  x-protocol / x-format validation
# ---------------------------------------------------------------------------


def test_unknown_protocol_returns_400(client, mock_session):
    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-protocol": "grpc"}
    )
    assert response.status_code == 400
    assert "x-protocol" in response.text


def test_agent_protocol_is_removed_returns_400(client, mock_session):
    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-protocol": "agent"}
    )
    assert response.status_code == 400


def test_stream_protocol_returns_400(client, mock_session):
    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-protocol": "stream"}
    )
    assert response.status_code == 400
    assert "x-protocol" in response.text


def test_unknown_format_returns_400(client, mock_session):
    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-format": "pdf"}
    )
    assert response.status_code == 400
    assert "x-format" in response.text


def test_supported_format_is_accepted_but_unused(client, mock_session):
    _install_agui_fakes()
    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-format": "markdown"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")


# ---------------------------------------------------------------------------
#  document_id query param
# ---------------------------------------------------------------------------


def test_document_id_not_found_returns_404(client, mock_session, mock_docs):
    mock_docs.get_document.return_value = None
    response = client.post(
        f"{ENDPOINT}?document_id=doc_missing", headers=AUTH_HEADERS
    )
    assert response.status_code == 404


def test_archived_document_returns_404(client, mock_session, mock_docs):
    mock_docs.get_document.return_value = {
        "document_id": "doc_a",
        "session_id": SESSION_ID,
        "template_id": TEMPLATE_ID,
        "archived": True,
    }
    response = client.post(f"{ENDPOINT}?document_id=doc_a", headers=AUTH_HEADERS)
    assert response.status_code == 404


def test_document_from_other_session_returns_404(client, mock_session, mock_docs):
    mock_docs.get_document.return_value = {
        "document_id": "doc_b",
        "session_id": "some_other_session",
        "template_id": TEMPLATE_ID,
    }
    response = client.post(f"{ENDPOINT}?document_id=doc_b", headers=AUTH_HEADERS)
    assert response.status_code == 404


def test_document_template_mismatch_returns_400(client, mock_session, mock_docs):
    mock_docs.get_document.return_value = {
        "document_id": "doc_c",
        "session_id": SESSION_ID,
        "template_id": "tpl_other",
    }
    response = client.post(f"{ENDPOINT}?document_id=doc_c", headers=AUTH_HEADERS)
    assert response.status_code == 400


def test_document_id_derives_template_id(client, mock_session, mock_docs):
    """document_id alone (no path template_id) resolves template from the doc."""
    mock_docs.get_document.return_value = {
        "document_id": "doc_d",
        "session_id": SESSION_ID,
        "template_id": "tpl_from_doc",
    }
    captured, _ = _install_agui_fakes()

    response = client.post(
        f"{ENDPOINT_NO_TID}?document_id=doc_d", headers=AUTH_HEADERS
    )
    assert response.status_code == 200
    assert captured["resolver"]["template_id"] == "tpl_from_doc"
    assert captured["resolver"]["document_id"] == "doc_d"


# ---------------------------------------------------------------------------
#  ag-ui protocol
# ---------------------------------------------------------------------------


def _install_agui_fakes(events=None):
    captured = {}

    async def fake_resolver(template_id, session_id, b_id, jwt_uuid, document_id=None):
        captured["resolver"] = {
            "template_id": template_id,
            "session_id": session_id,
            "b_id": b_id,
            "document_id": document_id,
        }
        return _make_inputs(template_id=template_id, txn_id=session_id)

    svc = _FakeRunService(events or _stub_events())
    scribe_agent_runs_module.set_run_input_resolver(fake_resolver)
    scribe_agent_runs_module.set_run_service(svc)
    return captured, svc


def test_agui_protocol_returns_sse_stream(client, mock_session):
    captured, svc = _install_agui_fakes()

    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-protocol": "ag-ui"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "RUN_STARTED" in response.text
    assert "RUN_FINISHED" in response.text
    # no document_id passed → resolver creates the run document itself
    assert captured["resolver"]["template_id"] == TEMPLATE_ID
    assert captured["resolver"]["session_id"] == SESSION_ID
    assert captured["resolver"]["document_id"] is None
    assert len(svc.stream_calls) == 1


def test_agui_without_body_synthesizes_run_input(client, mock_session):
    _, svc = _install_agui_fakes()

    response = client.post(
        ENDPOINT, headers={**AUTH_HEADERS, "x-protocol": "ag-ui"}
    )
    assert response.status_code == 200
    run_input = svc.stream_calls[0]["run_input"]
    assert run_input.thread_id == SESSION_ID
    assert run_input.run_id  # server-generated
    assert run_input.messages == []


def test_agui_forces_thread_id_to_session_id(client, mock_session):
    _, svc = _install_agui_fakes()

    response = client.post(
        ENDPOINT,
        headers={**AUTH_HEADERS, "x-protocol": "ag-ui"},
        json={
            "thread_id": "some_other_thread",
            "run_id": "client_run_1",
            "state": {},
            "messages": [],
            "tools": [],
            "context": [],
            "forwarded_props": {},
        },
    )
    assert response.status_code == 200
    run_input = svc.stream_calls[0]["run_input"]
    assert run_input.thread_id == SESSION_ID
    assert run_input.run_id == "client_run_1"


def _valid_existing_doc():
    return {
        "document_id": "doc_existing",
        "session_id": SESSION_ID,
        "template_id": TEMPLATE_ID,
    }


def test_agui_replays_saved_state_without_running(
    client, mock_session, mock_docs, monkeypatch
):
    captured, svc = _install_agui_fakes()
    mock_docs.get_document.return_value = _valid_existing_doc()
    monkeypatch.setattr(
        process_template_service.document_tiptap_service,
        "get_document_record",
        lambda document_id: {"agui_state": {"sections": ["saved"]}},
    )

    response = client.post(
        f"{ENDPOINT}?document_id=doc_existing",
        headers={**AUTH_HEADERS, "x-protocol": "ag-ui"},
    )
    assert response.status_code == 200
    assert "STATE_SNAPSHOT" in response.text
    assert "saved" in response.text
    # neither resolver nor run service was invoked
    assert "resolver" not in captured
    assert svc.stream_calls == []


def test_agui_without_saved_state_reruns_on_document(
    client, mock_session, mock_docs, monkeypatch
):
    """A record without agui_state (e.g. only tiptap_json) does not replay —
    the run goes through the resolver against the given document."""
    captured, svc = _install_agui_fakes()
    mock_docs.get_document.return_value = _valid_existing_doc()
    monkeypatch.setattr(
        process_template_service.document_tiptap_service,
        "get_document_record",
        lambda document_id: {"tiptap_json": {"type": "doc"}},
    )

    response = client.post(
        f"{ENDPOINT}?document_id=doc_existing",
        headers={**AUTH_HEADERS, "x-protocol": "ag-ui"},
    )
    assert response.status_code == 200
    assert captured["resolver"]["document_id"] == "doc_existing"
    assert len(svc.stream_calls) == 1
