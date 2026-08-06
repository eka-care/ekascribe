"""Central registry of ekascribe webhook events.

Every outbound webhook shares the messenger envelope:

    {
      "business_id": "<b_id>",
      "client_id": "<c_id>",
      "service_id": "v2rx",
      "event_id": "<event id>",
      "payload": {
        "service": "v2rx",
        "event": "<event id>",
        "event_time": <unix seconds>,
        "transaction_id": "<session / txn id>",
        "data": { ...event specific, see EVENT_REGISTRY... }
      }
    }
"""

import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional

SERVICE_ID = "v2rx"


class ScribeEvent(str, Enum):
    SESSION_INIT = "scribe.session.init"
    SESSION_CONFIG_UPDATE = "scribe.session.update"
    SESSION_END = "scribe.session.end"
    TRANSCRIPT_GENERATE = "scribe.session.transcript.completed"
    DOCUMENT_GENERATE = "scribe.session.document.generated"
    # legacy event ids kept unchanged for existing consumers
    DOCUMENT_PUBLISH = "scribe.document.publish"
    SESSION_DELETE = "scribe.session.deleted"
    V2RX_COMPLETED = "v2rx.completed"


@dataclass(frozen=True)
class EventSpec:
    event_id: str
    description: str
    # canonical JSON shape of the `data` object (documentation + test fixture)
    data_schema: Dict[str, Any]


EVENT_REGISTRY: Dict[str, EventSpec] = {
    # payloads are intentionally minimal: identifiers only. clients fetch full
    # details from the GET session / GET document APIs — this keeps PHI out of
    # the webhook channel and avoids shipping stale snapshots.
    ScribeEvent.SESSION_INIT.value: EventSpec(
        event_id=ScribeEvent.SESSION_INIT.value,
        description="Fired once when a scribe session is created (legacy init or protocol create).",
        data_schema={
            "session_id": "str",
        },
    ),
    ScribeEvent.SESSION_CONFIG_UPDATE.value: EventSpec(
        event_id=ScribeEvent.SESSION_CONFIG_UPDATE.value,
        description="Fired when the client updates session config (protocol PATCH /sessions/{id}).",
        data_schema={
            "session_id": "str",
        },
    ),
    ScribeEvent.SESSION_END.value: EventSpec(
        event_id=ScribeEvent.SESSION_END.value,
        description="Fired when the session is committed/ended (legacy commit or protocol end).",
        data_schema={
            "session_id": "str",
        },
    ),
    ScribeEvent.TRANSCRIPT_GENERATE.value: EventSpec(
        event_id=ScribeEvent.TRANSCRIPT_GENERATE.value,
        description="Fired when the raw transcript is ready (pipeline sets transcript_status=success).",
        data_schema={
            "session_id": "str",
            "transcript_status": "str",
        },
    ),
    ScribeEvent.DOCUMENT_GENERATE.value: EventSpec(
        event_id=ScribeEvent.DOCUMENT_GENERATE.value,
        description=(
            "Fired when any document generation completes — background markdown "
            "agent, integration agent, or AG-UI run."
        ),
        data_schema={
            "session_id": "str",
            "document_id": "str",
            "template_id": "str",
            "status": "success",
            "source": "background_agent|integration_agent|ag_ui",
        },
    ),
    ScribeEvent.DOCUMENT_PUBLISH.value: EventSpec(
        event_id=ScribeEvent.DOCUMENT_PUBLISH.value,
        description="Fired when a document finishes the publish pipeline (legacy payload, unchanged).",
        data_schema={
            "encounter_id": "str",
            "document_id": "str",
            "patient_oid": "str",
            "event_time": "int",
            "doctor_uuid": "str",
        },
    ),
    ScribeEvent.SESSION_DELETE.value: EventSpec(
        event_id=ScribeEvent.SESSION_DELETE.value,
        description="Fired when a session is deleted/archived (DELETE /{txn_id}).",
        data_schema={
            "session_id": "str",
        },
    ),
    ScribeEvent.V2RX_COMPLETED.value: EventSpec(
        event_id=ScribeEvent.V2RX_COMPLETED.value,
        description="Fired when transaction processing completes (legacy event, unchanged).",
        data_schema={
            "original_audio_url": "str (presigned, only when audio_full is enabled)",
        },
    ),
}


def build_envelope(
    event_id: str,
    *,
    b_id: str,
    c_id: str,
    txn_id: str,
    data: Dict[str, Any],
    event_time: Optional[int] = None,
) -> Dict[str, Any]:
    event_time = event_time if event_time is not None else int(time.time())
    return {
        "business_id": b_id,
        "client_id": c_id,
        "service_id": SERVICE_ID,
        "event_id": event_id,
        "payload": {
            "service": SERVICE_ID,
            "event": event_id,
            "event_time": event_time,
            "transaction_id": txn_id,
            "data": data,
        },
    }


def build_session_data(session_id: str) -> Dict[str, Any]:
    """Minimal payload for session-lifecycle events (init/update/end/delete)."""
    return {"session_id": session_id}


def build_transcript_data(
    session_id: str,
    transcript_status: str = "success",
) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "transcript_status": transcript_status,
    }


def build_document_data(
    *,
    session_id: str,
    document_id: str,
    template_id: str,
    source: str,
    status: str = "success",
) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "document_id": document_id,
        "template_id": template_id,
        "status": status,
        "source": source,
    }
