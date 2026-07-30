"""
ScribeState — the AG-UI state object the runner streams as STATE_SNAPSHOT
+ STATE_DELTA frames during a scribe agent run.

Subclasses echo.ag_ui.AgUiState so callers can use begin_tracking() /
drain_pending_ops() to extract JSON Patch ops.
"""

from typing import List, Optional

from echo.ag_ui import AgUiState

# Re-export the payload-layer symbols so callers can `from .state import …`.
from .payloads import (  # noqa: F401
    KIND_TO_PAYLOAD,
    KeyValueItem,
    KeyValuePayload,
    ListPayload,
    MedicationTablePayload,
    NarrativePayload,
    Section,
    SectionKind,
    SectionStatus,
    TableColumn,
    TablePayload,
    validate_section_payload,
)


class ScribeState(AgUiState):
    """State streamed over AG-UI for a single scribe run.

    Identifiers (template_id, txn_id, document_id) are populated by the
    host endpoint at run start. transcript holds the merged final
    transcript that the structuring lambda produced. sections is the
    ordered list of rendered sections — the LLM populates it dynamically
    by calling one of the add_* tools per template heading that has data.
    """

    template_id: str = ""
    txn_id: str = ""
    document_id: str = ""
    transcript: str = ""
    sections: List[Section] = []
    pending_tool_call_id: Optional[str] = None
