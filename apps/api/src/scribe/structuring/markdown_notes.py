"""
Markdown note generation — vaarta's structuring path.

Replaces the AG-UI tool-emission pipeline: one streaming LLM call produces
the note as plain Markdown. No tools, no typed sections, no state machine —
which also removes the biggest failure mode on small local models (fumbled
tool calls). The template desc is unchanged; the system prompt maps its
section kinds to Markdown shapes.

Also owns the legacy bridge: `sections_to_markdown` deterministically
converts a persisted AG-UI ScribeState's typed sections into the same
Markdown, so pre-migration notes keep opening (and can be re-edited on the
markdown path) without an LLM call.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)

_PROMPT_PATH = (
    Path(__file__).parent.parent / "prompts" / "files" / "markdown_notes_system_prompt.md"
)

# SSE frame types streamed to the client (generation and chat share these):
#   {"type": "start", "run_id": ..., "document_id": ...}
#   {"type": "delta", "text": "..."}
#   {"type": "done",  "markdown": "<full note>", "document_id": ...}
#   {"type": "error", "message": "..."}


def sse_frame(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@lru_cache(maxsize=1)
def _prompt_template() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def build_system_prompt(template_prompt: str, date: Optional[str] = None) -> str:
    return (
        _prompt_template()
        .replace("{{date}}", date or "not specified")
        .replace("{{user_template}}", (template_prompt or "").strip())
    )


_FENCE_RE = re.compile(r"^\s*```[a-zA-Z]*\s*\n(.*)\n```\s*$", re.DOTALL)


def strip_markdown_fences(text: str) -> str:
    """Unwrap a note a model wrapped in one outer code fence (common tic)."""
    m = _FENCE_RE.match(text or "")
    return m.group(1) if m else (text or "")


# ---------------------------------------------------------------------------
# Legacy bridge: typed AG-UI sections -> Markdown (pure, no LLM)
# ---------------------------------------------------------------------------

def _table_md(payload: Dict[str, Any]) -> str:
    headers = payload.get("headers") or []
    rows = payload.get("rows") or []
    if not headers:
        return ""
    keys = [h.get("key", "") for h in headers]
    labels = [h.get("label", h.get("key", "")) for h in headers]
    out = [
        "| " + " | ".join(labels) + " |",
        "| " + " | ".join("---" for _ in labels) + " |",
    ]
    for row in rows:
        out.append("| " + " | ".join(str(row.get(k, "") or "") for k in keys) + " |")
    return "\n".join(out)


def _section_body_md(kind: str, payload: Dict[str, Any]) -> str:
    kind = (kind or "").upper()
    if kind == "LIST":
        return "\n".join(f"- {item}" for item in (payload.get("items") or []))
    if kind == "TABLE":
        return _table_md(payload)
    if kind == "KEY_VALUE":
        return "\n".join(
            f"**{i.get('key', '')}:** {i.get('value', '')}"
            for i in (payload.get("items") or [])
        )
    if kind == "NARRATIVE":
        return payload.get("markdown", "") or ""
    # unknown kind — best-effort dump so nothing is silently lost
    return json.dumps(payload, ensure_ascii=False)


def sections_to_markdown(sections: List[Dict[str, Any]]) -> str:
    """Deterministic conversion of persisted ScribeState sections."""
    parts: List[str] = []
    for section in sorted(sections or [], key=lambda s: s.get("order", 0)):
        heading = section.get("display_name") or section.get("key") or "Section"
        body = _section_body_md(section.get("kind", ""), section.get("payload") or {})
        if body.strip():
            parts.append(f"## {heading}\n\n{body.strip()}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Streaming generation
# ---------------------------------------------------------------------------

async def stream_markdown(
    *,
    system_prompt: str,
    context,  # echo ConversationContext
    llm_config,  # echo LLMConfig
) -> AsyncGenerator[Tuple[str, str], None]:
    """Relay one streaming LLM call as ('delta', text) tuples, ending with
    ('done', full_markdown). Raises RuntimeError on a provider error so the
    caller can emit a single error frame."""
    from echo.llm.factory import get_llm
    from echo.llm.schemas import StreamEventType

    llm = get_llm(llm_config)
    collected: List[str] = []
    final_text: Optional[str] = None

    async for ev in llm.invoke_stream(context=context, system_prompt=system_prompt):
        if ev.type == StreamEventType.TEXT and ev.text:
            collected.append(ev.text)
            yield ("delta", ev.text)
        elif ev.type == StreamEventType.ERROR:
            raise RuntimeError(ev.error or "LLM streaming error")
        elif ev.type == StreamEventType.DONE:
            if ev.llm_response is not None and ev.llm_response.text:
                final_text = ev.llm_response.text

    markdown = strip_markdown_fences(final_text or "".join(collected)).strip()
    yield ("done", markdown)
