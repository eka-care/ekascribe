"""
Document-chat edit tools.

Three LLM-callable BaseTools that edit the note by heading. They run
server-side and mutate ``ChatState.document_markdown`` via
``MarkdownDocument``; the resulting STATE_DELTA carries the full updated
markdown to the FE. The tools return a short status string so the agent
can chain edits and confirm what it changed.

The "component" the user asks for (a table, a list, a key-value block,
prose) is expressed as markdown inside the ``markdown`` arg — the LLM
chooses the shape. There is no separate typed schema under Path C.
"""

from typing import Any, Dict, List, Optional, Type

from echo.tools import BaseTool
from scribe.core.custom_logger import get_logger

from .chat_state import ChatState
from .markdown_ops import MarkdownDocument

logger = get_logger(__name__)

_HEADING_ARG: Dict[str, Any] = {
    "type": "string",
    "minLength": 1,
    "description": (
        "The heading text of the target section, exactly as it appears in "
        "the note but WITHOUT the leading '#' marks (e.g. 'Plan', "
        "'Medications'). Matching is case-insensitive."
    ),
}

_BODY_ARG: Dict[str, Any] = {
    "type": "string",
    "description": (
        "The section body in GitHub-flavored markdown. Do NOT include the "
        "heading line — the tool keeps/sets the heading. Choose the shape "
        "that fits the content: a GFM table (| col | col |), a '- ' bullet "
        "list, '**Key**: value' lines for labelled fields, or prose."
    ),
}


def _resolve_state(tool_context: Optional[Dict[str, Any]]):
    """Pull ChatState out of tool_context, or return an error string."""
    if tool_context is None:
        return "Error: tool_context missing (server bug)."
    state = tool_context.get("chat_state")
    if not isinstance(state, ChatState):
        return (
            f"Error: tool_context['chat_state'] is {type(state).__name__}, "
            f"expected ChatState."
        )
    return state


class ReplaceSectionTool(BaseTool):
    name = "replace_section"
    description = (
        "Replace the entire body of an existing section, identified by its "
        "heading. Use when the user asks to rewrite, update, correct, or "
        "restructure a section that already exists. The heading is kept; only "
        "the body is swapped."
    )

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "required": ["heading", "markdown"],
            "additionalProperties": False,
            "properties": {"heading": _HEADING_ARG, "markdown": _BODY_ARG},
        }

    async def run(
        self,
        heading: str,
        markdown: str = "",
        tool_context: Optional[Dict[str, Any]] = None,
        **_unused: Any,
    ) -> str:
        state = _resolve_state(tool_context)
        if isinstance(state, str):
            return state
        doc = MarkdownDocument(state.document_markdown)
        if not doc.replace_section(heading, markdown):
            return (
                f"Error: no section titled {heading!r}. Available headings: "
                f"{doc.headings()}. To create a new section use add_section."
            )
        state.document_markdown = doc.to_markdown()
        logger.info("replace_section applied", heading=heading, severity="medium")
        return f"ok — replaced section {heading!r}."


class AddSectionTool(BaseTool):
    name = "add_section"
    description = (
        "Add a brand-new section to the note. Use when the user asks to add "
        "content that does not belong in an existing section. Optionally place "
        "it right after an existing section via after_heading; otherwise it is "
        "appended at the end."
    )

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "required": ["heading", "markdown"],
            "additionalProperties": False,
            "properties": {
                "heading": {
                    **_HEADING_ARG,
                    "description": "Heading text for the new section (no '#').",
                },
                "markdown": _BODY_ARG,
                "after_heading": {
                    "type": "string",
                    "description": (
                        "Optional: insert the new section immediately after the "
                        "section with this heading. Omit to append at the end."
                    ),
                },
            },
        }

    async def run(
        self,
        heading: str,
        markdown: str = "",
        after_heading: Optional[str] = None,
        tool_context: Optional[Dict[str, Any]] = None,
        **_unused: Any,
    ) -> str:
        state = _resolve_state(tool_context)
        if isinstance(state, str):
            return state
        doc = MarkdownDocument(state.document_markdown)
        doc.add_section(heading, markdown, after_title=after_heading)
        state.document_markdown = doc.to_markdown()
        logger.info("add_section applied", heading=heading, after=after_heading, severity="medium")
        return f"ok — added section {heading!r}."


class RemoveSectionTool(BaseTool):
    name = "remove_section"
    description = (
        "Delete an existing section, identified by its heading. Use only when "
        "the user explicitly asks to remove or delete a section."
    )

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "required": ["heading"],
            "additionalProperties": False,
            "properties": {"heading": _HEADING_ARG},
        }

    async def run(
        self,
        heading: str,
        tool_context: Optional[Dict[str, Any]] = None,
        **_unused: Any,
    ) -> str:
        state = _resolve_state(tool_context)
        if isinstance(state, str):
            return state
        doc = MarkdownDocument(state.document_markdown)
        if not doc.remove_section(heading):
            return (
                f"Error: no section titled {heading!r}. Available headings: "
                f"{doc.headings()}."
            )
        state.document_markdown = doc.to_markdown()
        logger.info("remove_section applied", heading=heading, severity="medium")
        return f"ok — removed section {heading!r}."


ALL_EDIT_TOOLS: List[Type[BaseTool]] = [
    ReplaceSectionTool,
    AddSectionTool,
    RemoveSectionTool,
]
