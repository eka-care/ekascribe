"""
Tests for AG-UI state persistence + replay.

Covers:
  - POST /runs/{template_id}?document_id=... replay / re-run / 400 / 404
    branches in scribe.routers.scribe_agent_runs.start_run
  - AgUiRunService persisting agui_state on RUN_FINISHED (stream + resume)
  - document_tiptap_service save/get agui_state helpers
"""

import json
from typing import AsyncGenerator, List

import pytest
from ag_ui.core import (
    BaseEvent,
    EventType,
    RunFinishedEvent,
    RunStartedEvent,
)
from echo.ag_ui import InMemoryPausedRunStore, PausedRun, make_pause_key
from echo.models.user_conversation import ConversationContext

from scribe.routers import (
    scribe_agent_runs as scribe_agent_runs_module,
)
from scribe.services import document_tiptap_service
from scribe.structuring import run_service as run_service_module
from scribe.structuring.run_service import (
    AgUiRunService,
    ResolvedRunInputs,
    build_persistable_agui_state,
)
from scribe.structuring.state import ScribeState


ENDPOINT = "/voice/v1/scribe/agent/runs/default_prescription_print_v1"
TEMPLATE_ID = "default_prescription_print_v1"
DOC_ID = "doc-abc"
SESSION_ID = "txn_99"

SAVED_STATE = {
    "template_id": TEMPLATE_ID,
    "txn_id": SESSION_ID,
    "document_id": DOC_ID,
    "sections": [
        {
            "key": "symptoms",
            "display_name": "Symptoms",
            "kind": "NARRATIVE",
            "payload": {"text": "Fever for 3 days."},
            "order": 0,
            "status": {"state": "ready", "error": None},
            "edited_by_user": False,
        }
    ],
}


def _valid_body(thread_id=SESSION_ID, run_id="r1") -> dict:
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
        txn_id=SESSION_ID,
        document_id=DOC_ID,
        template_id=TEMPLATE_ID,
        s3_url="s3://test-bucket/sessions/txn_99",
        s3_bucket="test-bucket",
        transcript="Patient has fever for 3 days.",
        template_prompt="Symptoms\n[Symptom]",
    )
    base.update(overrides)
    return ResolvedRunInputs(**base)


@pytest.fixture(autouse=True)
def reset_endpoint_globals():
    orig_resolver = scribe_agent_runs_module._run_input_resolver
    orig_service = scribe_agent_runs_module._run_service
    yield
    scribe_agent_runs_module._run_input_resolver = orig_resolver
    scribe_agent_runs_module._run_service = orig_service


@pytest.fixture
def owned_document(monkeypatch):
    """_document_service.get_document returns a live doc owned by SESSION_ID."""
    monkeypatch.setattr(
        scribe_agent_runs_module._document_service,
        "get_document",
        lambda document_id: {
            "document_id": document_id,
            "session_id": SESSION_ID,
            "archived": False,
        },
    )


def _patch_record(monkeypatch, record):
    monkeypatch.setattr(
        scribe_agent_runs_module.document_tiptap_service,
        "get_document_record",
        lambda document_id: record,
    )


class _BoomResolver:
    """Resolver that must never be called (replay path skips resolution)."""

    def __init__(self):
        self.called = False

    async def __call__(self, *args, **kwargs):
        self.called = True
        raise AssertionError("resolver must not be called on replay")


# ---------------------------------------------------------------------------
#  Endpoint: replay branch
# ---------------------------------------------------------------------------


def test_replay_streams_saved_state_without_llm(client, monkeypatch, owned_document):
    _patch_record(monkeypatch, {"document_id": DOC_ID, "agui_state": SAVED_STATE})
    boom = _BoomResolver()
    scribe_agent_runs_module.set_run_input_resolver(boom)

    response = client.post(
        f"{ENDPOINT}?document_id={DOC_ID}",
        json=_valid_body(run_id="replay_run"),
        headers={"accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "RUN_STARTED" in body
    assert "STATE_SNAPSHOT" in body
    assert "RUN_FINISHED" in body
    assert "Fever for 3 days." in body
    # thread/run ids from the request are echoed back
    assert SESSION_ID in body
    assert "replay_run" in body
    assert not boom.called


def test_replay_returns_400_when_tiptap_json_exists(
    client, monkeypatch, owned_document
):
    _patch_record(
        monkeypatch,
        {
            "document_id": DOC_ID,
            "tiptap_json": {"type": "doc", "content": []},
            "agui_state": SAVED_STATE,
        },
    )
    boom = _BoomResolver()
    scribe_agent_runs_module.set_run_input_resolver(boom)

    response = client.post(f"{ENDPOINT}?document_id={DOC_ID}", json=_valid_body())
    assert response.status_code == 400
    assert "edited content" in response.json()["detail"]
    assert not boom.called


def test_replay_returns_404_for_unknown_document(client, monkeypatch):
    monkeypatch.setattr(
        scribe_agent_runs_module._document_service,
        "get_document",
        lambda document_id: None,
    )
    response = client.post(f"{ENDPOINT}?document_id={DOC_ID}", json=_valid_body())
    assert response.status_code == 404


def test_replay_returns_404_for_session_mismatch(client, monkeypatch):
    monkeypatch.setattr(
        scribe_agent_runs_module._document_service,
        "get_document",
        lambda document_id: {
            "document_id": document_id,
            "session_id": "someone_elses_session",
            "archived": False,
        },
    )
    response = client.post(f"{ENDPOINT}?document_id={DOC_ID}", json=_valid_body())
    assert response.status_code == 404


# ---------------------------------------------------------------------------
#  Endpoint: re-run branch (document_id given, no saved state)
# ---------------------------------------------------------------------------


class _FakeRunService(AgUiRunService):
    def __init__(self, events: List[BaseEvent]):
        self._events = events

    async def stream(self, run_input, inputs) -> AsyncGenerator[BaseEvent, None]:
        for ev in self._events:
            yield ev


def test_document_id_without_saved_state_reruns_llm_on_same_document(
    client, monkeypatch, owned_document
):
    _patch_record(monkeypatch, None)

    captured = {}

    async def capturing_resolver(
        template_id, session_id, b_id, jwt_uuid, document_id=None
    ):
        captured["document_id"] = document_id
        return _make_inputs(document_id=document_id)

    scribe_agent_runs_module.set_run_input_resolver(capturing_resolver)
    scribe_agent_runs_module.set_run_service(
        _FakeRunService(
            [
                RunStartedEvent(
                    type=EventType.RUN_STARTED, thread_id=SESSION_ID, run_id="r1"
                ),
                RunFinishedEvent(
                    type=EventType.RUN_FINISHED, thread_id=SESSION_ID, run_id="r1"
                ),
            ]
        )
    )

    response = client.post(f"{ENDPOINT}?document_id={DOC_ID}", json=_valid_body())
    assert response.status_code == 200
    assert "RUN_FINISHED" in response.text
    assert captured["document_id"] == DOC_ID


def test_no_document_id_keeps_existing_behaviour(client, monkeypatch):
    """Without the query param, neither the document nor the tiptap record
    is looked up and the resolver is called the old 4-arg way."""
    captured = {}

    async def four_arg_resolver(template_id, session_id, b_id, jwt_uuid):
        captured["called"] = True
        return _make_inputs()

    scribe_agent_runs_module.set_run_input_resolver(four_arg_resolver)
    scribe_agent_runs_module.set_run_service(
        _FakeRunService(
            [
                RunFinishedEvent(
                    type=EventType.RUN_FINISHED, thread_id=SESSION_ID, run_id="r1"
                )
            ]
        )
    )

    response = client.post(ENDPOINT, json=_valid_body())
    assert response.status_code == 200
    assert captured["called"] is True


# ---------------------------------------------------------------------------
#  Resolver: document_id reuse (no new document created)
# ---------------------------------------------------------------------------


def test_resolver_with_document_id_skips_document_creation(monkeypatch):
    created = []
    status_updates = []

    monkeypatch.setattr(
        scribe_agent_runs_module,
        "_ensure_run_document",
        lambda **kw: created.append(kw) or "new-doc",
    )
    monkeypatch.setattr(
        scribe_agent_runs_module._document_service,
        "get_document_id_by_session_and_template",
        lambda session_id, template_id: "transcript-doc",
    )
    monkeypatch.setattr(
        scribe_agent_runs_module._document_service,
        "get_document",
        lambda document_id: {
            "document_id": document_id,
            "session_id": SESSION_ID,
            "document_path": "path/transcript.txt",
            "uuid": "u1",
            "wid": "EC_test",
        },
    )
    monkeypatch.setattr(
        scribe_agent_runs_module._document_service,
        "update_document_status",
        lambda document_id, status: status_updates.append((document_id, status)),
    )
    monkeypatch.setattr(
        scribe_agent_runs_module._transaction_repo,
        "get_transaction",
        lambda session_id, b_id: {"s3_url": "s3://bucket/x", "context": None},
    )

    class _NoContext:
        async def resolve(self, **kwargs):
            return None

    monkeypatch.setattr(scribe_agent_runs_module, "_context_service", _NoContext())
    monkeypatch.setattr(
        scribe_agent_runs_module,
        "download_s3_file",
        lambda **kw: "transcript text",
    )
    monkeypatch.setattr(
        scribe_agent_runs_module._template_service,
        "get_template",
        lambda template_id: {"title": "Rx", "desc": "prompt"},
    )
    monkeypatch.setattr(
        scribe_agent_runs_module,
        "_get_default_llm_config",
        lambda: None,
    )

    import asyncio

    inputs = asyncio.get_event_loop().run_until_complete(
        scribe_agent_runs_module.run_input_resolver(
            TEMPLATE_ID, SESSION_ID, "", "", DOC_ID
        )
    )

    assert inputs.document_id == DOC_ID
    assert created == []  # no fresh document
    assert (DOC_ID, "in-progress") in status_updates


# ---------------------------------------------------------------------------
#  Run service: persistence on RUN_FINISHED
# ---------------------------------------------------------------------------


def _scribe_state() -> ScribeState:
    return ScribeState.model_validate(
        {**SAVED_STATE, "transcript": "a very long transcript"}
    )


class _FakeAgent:
    """Agent whose ag_ui_stream/ag_ui_resume_stream yield fixed events."""

    def __init__(self, events):
        self._events = events

    async def ag_ui_stream(self, **kwargs):
        for ev in self._events:
            yield ev

    async def ag_ui_resume_stream(self, **kwargs):
        for ev in self._events:
            yield ev


def _run_agent_input():
    from ag_ui.core import RunAgentInput

    return RunAgentInput.model_validate(_valid_body())


def _collect(async_gen):
    import asyncio

    async def _consume():
        return [ev async for ev in async_gen]

    return asyncio.get_event_loop().run_until_complete(_consume())


def test_stream_persists_agui_state_on_run_finished(monkeypatch):
    saved = {}
    monkeypatch.setattr(
        run_service_module.document_tiptap_service,
        "save_agui_state",
        lambda document_id, agui_state: saved.update(
            {"document_id": document_id, "agui_state": agui_state}
        ),
    )

    state = _scribe_state()
    events = [
        RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=SESSION_ID, run_id="r1")
    ]

    class _DocSvc:
        def update_document_status(self, document_id, status):
            saved["status"] = (document_id, status)

    svc = AgUiRunService(
        components_factory=lambda inputs: (_FakeAgent(events), ConversationContext(), state),
        document_service=_DocSvc(),
    )

    out = _collect(svc.stream(_run_agent_input(), _make_inputs()))

    assert saved["document_id"] == DOC_ID
    assert saved["status"] == (DOC_ID, "success")
    # transcript + pending_tool_call_id stripped from the persisted state
    assert "transcript" not in saved["agui_state"]
    assert "pending_tool_call_id" not in saved["agui_state"]
    assert saved["agui_state"]["sections"] == SAVED_STATE["sections"]
    # client still gets STATE_SNAPSHOT then RUN_FINISHED
    types = [ev.type for ev in out]
    assert types == [EventType.STATE_SNAPSHOT, EventType.RUN_FINISHED]


def test_stream_survives_persistence_failure(monkeypatch):
    def boom(document_id, agui_state):
        raise RuntimeError("dynamo down")

    monkeypatch.setattr(
        run_service_module.document_tiptap_service, "save_agui_state", boom
    )

    events = [
        RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=SESSION_ID, run_id="r1")
    ]

    class _DocSvc:
        def update_document_status(self, document_id, status):
            pass

    svc = AgUiRunService(
        components_factory=lambda inputs: (
            _FakeAgent(events),
            ConversationContext(),
            _scribe_state(),
        ),
        document_service=_DocSvc(),
    )

    out = _collect(svc.stream(_run_agent_input(), _make_inputs()))
    assert [ev.type for ev in out] == [
        EventType.STATE_SNAPSHOT,
        EventType.RUN_FINISHED,
    ]


def test_resume_stream_persists_agui_state_on_run_finished(monkeypatch):
    saved = {}
    monkeypatch.setattr(
        run_service_module.document_tiptap_service,
        "save_agui_state",
        lambda document_id, agui_state: saved.update(
            {"document_id": document_id, "agui_state": agui_state}
        ),
    )

    state = _scribe_state()
    store = InMemoryPausedRunStore()
    key = make_pause_key(SESSION_ID, "r1")

    import asyncio

    asyncio.get_event_loop().run_until_complete(
        store.save(
            key,
            PausedRun(
                thread_id=SESSION_ID,
                run_id="r1",
                tool_call_id="tc1",
                tool_call_name="ask_user",
                tool_args={},
                context_snapshot=ConversationContext().model_dump(),
                state_snapshot=state.snapshot(),
            ),
        )
    )

    events = [
        RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=SESSION_ID, run_id="r1")
    ]

    class _DocSvc:
        def update_document_status(self, document_id, status):
            saved["status"] = (document_id, status)

    svc = AgUiRunService(
        components_factory=lambda inputs: (
            _FakeAgent(events),
            ConversationContext(),
            _scribe_state(),
        ),
        paused_run_store=store,
        document_service=_DocSvc(),
    )

    from echo.ag_ui import AgUiResumeInput

    resume_input = AgUiResumeInput(
        thread_id=SESSION_ID,
        run_id="r1",
        tool_call_id="tc1",
        tool_result={"value": "yes"},
    )

    out = _collect(svc.resume_stream(resume_input, _make_inputs()))

    assert saved["document_id"] == DOC_ID
    assert saved["status"] == (DOC_ID, "success")
    assert "transcript" not in saved["agui_state"]
    types = [ev.type for ev in out]
    assert types == [EventType.STATE_SNAPSHOT, EventType.RUN_FINISHED]


# ---------------------------------------------------------------------------
#  build_persistable_agui_state
# ---------------------------------------------------------------------------


def test_build_persistable_agui_state_strips_transcript():
    snap = build_persistable_agui_state(_scribe_state())
    assert "transcript" not in snap
    assert "pending_tool_call_id" not in snap
    assert snap["document_id"] == DOC_ID
    assert snap["sections"] == SAVED_STATE["sections"]
    # result must be JSON-serializable as-is
    json.dumps(snap)


# ---------------------------------------------------------------------------
#  document_tiptap_service agui_state helpers
# ---------------------------------------------------------------------------


class _FakeOrm:
    def __init__(self, record=None):
        self.record = record
        self.upserts = []

    def upsert_agui_state(self, document_id, agui_state):
        self.upserts.append((document_id, agui_state))
        return {"agui_state": agui_state}

    def upsert_tiptap_json(self, document_id, tiptap_json):
        self.upserts.append((document_id, tiptap_json))
        return {"tiptap_json": tiptap_json}

    def get_tiptap_json(self, document_id):
        return self.record

    def get_record(self, document_id):
        return self.record


def test_save_agui_state_rejects_empty():
    with pytest.raises(ValueError):
        document_tiptap_service.save_agui_state(DOC_ID, {}, orm=_FakeOrm())
    with pytest.raises(ValueError):
        document_tiptap_service.save_agui_state(DOC_ID, None, orm=_FakeOrm())


def test_save_agui_state_stores_json_string():
    orm = _FakeOrm()
    document_tiptap_service.save_agui_state(DOC_ID, SAVED_STATE, orm=orm)
    assert len(orm.upserts) == 1
    document_id, stored = orm.upserts[0]
    assert document_id == DOC_ID
    assert isinstance(stored, str)
    assert json.loads(stored) == SAVED_STATE


def test_save_agui_state_round_trips_floats_exactly():
    state = {"sections": [{"score": 1.5, "rank": 1}]}
    orm = _FakeOrm()
    document_tiptap_service.save_agui_state(DOC_ID, state, orm=orm)
    _, stored = orm.upserts[0]
    orm.record = {"document_id": DOC_ID, "agui_state": stored}
    assert document_tiptap_service.get_agui_state(DOC_ID, orm=orm) == state


def test_get_agui_state_converts_decimals_in_legacy_records():
    from decimal import Decimal

    orm = _FakeOrm(
        record={
            "document_id": DOC_ID,
            "agui_state": {
                "sections": [{"score": Decimal("2"), "ratio": Decimal("0.5")}]
            },
        }
    )
    state = document_tiptap_service.get_agui_state(DOC_ID, orm=orm)
    section = state["sections"][0]
    assert section["score"] == 2 and isinstance(section["score"], int)
    assert section["ratio"] == 0.5 and isinstance(section["ratio"], float)
    json.dumps(state)


def test_save_tiptap_json_round_trips_floats_exactly():
    tiptap = {
        "type": "doc",
        "content": [
            {
                "type": "medicationRow",
                "attrs": {"suggestions": [{"rank": 1, "score": 1.5}]},
            }
        ],
    }
    orm = _FakeOrm()
    document_tiptap_service.save_tiptap_json(DOC_ID, tiptap, orm=orm)
    _, stored = orm.upserts[0]
    assert isinstance(stored, str)
    orm.record = {"document_id": DOC_ID, "tiptap_json": stored}
    assert document_tiptap_service.get_tiptap_json(DOC_ID, orm=orm) == tiptap
    assert (
        document_tiptap_service.get_document_record(DOC_ID, orm=orm)["tiptap_json"]
        == tiptap
    )


def test_get_agui_state_returns_none_when_missing():
    assert document_tiptap_service.get_agui_state(DOC_ID, orm=_FakeOrm(None)) is None
    assert (
        document_tiptap_service.get_agui_state(
            DOC_ID, orm=_FakeOrm({"document_id": DOC_ID, "tiptap_json": {"a": 1}})
        )
        is None
    )
