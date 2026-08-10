"""
Shared mutation helpers for ScribeState.

State mutation is done directly on the Pydantic models. AgUiState's
snapshot-diff drain_pending_ops() picks up the resulting JSON Patch ops;
callers don't need to emit ops explicitly.
"""

from typing import Optional

from .payloads import Section
from .state import ScribeState


def find_section_index(state: ScribeState, key: str) -> Optional[int]:
    """Return the index of the section with matching `key`, or None."""
    for i, s in enumerate(state.sections):
        if s.key == key:
            return i
    return None


def apply_section_to_state(state: ScribeState, section: Section) -> None:
    """Insert or replace `section` in `state.sections` by key.

    If a section with the same key exists, replaces it in place
    (preserving its position). Otherwise appends. Sets the section's
    status to 'ready' if it's still 'pending' so the FE knows the
    extract step is complete for this section.
    """
    if section.status.state == "pending":
        section.status.state = "ready"

    idx = find_section_index(state, section.key)
    if idx is None:
        state.sections.append(section)
    else:
        state.sections[idx] = section
