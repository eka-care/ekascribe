"""
ChatState — the AG-UI state object for a document-chat run.

Under Path C the editable document is plain markdown, so the entire
streamed state is a single ``document_markdown`` field. The edit tools
mutate it; echo's AgUiState diff (begin_tracking / drain_pending_ops)
turns each mutation into a STATE_DELTA replace on ``/document_markdown``
which the FE applies via ``editor.setMarkdown(...)``. Q&A turns leave the
field untouched, so no delta is emitted — only TEXT_MESSAGE_* events.
"""

from echo.ag_ui import AgUiState


class ChatState(AgUiState):
    document_markdown: str = ""
