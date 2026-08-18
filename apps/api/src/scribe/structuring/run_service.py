"""
Markdown structuring run — one streaming LLM call per note.

Replaces AgUiRunService: no AG-UI events, no tools, no ScribeState. The
service streams plain frames (see markdown_notes.sse_frame) and persists the
finished note as the document's blob content, so a completed run is fully
recoverable from storage alone.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional

from echo.llm import LLMConfig
from scribe.core.custom_logger import get_logger
from scribe.services.agent_config import LLMAgentConfig
from scribe.services.context import ResolvedContext, build_conversation_context
from scribe.services.document_service import DocumentService

from .markdown_notes import build_system_prompt, stream_markdown

logger = get_logger(__name__)

_DEFAULT_S3_BUCKET = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

# local-only debug dump of the exact prompt (same convention as before)
_DEBUG_PROMPT_PATH = Path(os.getenv("LOG_DIR", str(Path(__file__).parent))) / "final_prompt_debug.txt"


@dataclass
class ResolvedRunInputs:
    """Fully-resolved inputs for one structuring run.

    Field-compatible with the AG-UI era dataclass so run_input_resolver and
    its tests carry over unchanged."""

    b_id: str
    txn_id: str
    document_id: str
    template_id: str
    s3_url: str
    transcript: str
    template_prompt: str
    s3_bucket: str = _DEFAULT_S3_BUCKET
    date: Optional[str] = None
    llm_config: Optional[LLMConfig] = None  # override for tests/canary
    resolved_context: Optional[ResolvedContext] = None


def _dump_final_prompt_for_debug(system_prompt: str, inputs: ResolvedRunInputs) -> None:
    try:
        body = (
            f"# generated_at={datetime.now().isoformat()}\n"
            f"# template_id={inputs.template_id}\n"
            f"# llm_model={getattr(inputs.llm_config, 'model', None) or os.getenv('ECHO_DEFAULT_LLM_MODEL')}\n\n"
            "===== SYSTEM PROMPT =====\n" + system_prompt +
            "\n\n===== TRANSCRIPT (user message) =====\n" + (inputs.transcript or "") + "\n"
        )
        _DEBUG_PROMPT_PATH.write_text(body, encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        logger.warning("failed to write final prompt debug file", error=str(e), severity="low")


class MarkdownRunService:
    """Streams one markdown note generation and persists the result."""

    def __init__(self, document_service: Optional[DocumentService] = None) -> None:
        self.document_service = document_service or DocumentService()

    async def stream(
        self, run_id: str, inputs: ResolvedRunInputs
    ) -> AsyncGenerator[Dict[str, Any], None]:
        system_prompt = build_system_prompt(inputs.template_prompt, date=inputs.date)
        ctx = build_conversation_context(
            transcript=inputs.transcript,
            resolved_context=inputs.resolved_context,
        )
        llm_config = inputs.llm_config or LLMAgentConfig.from_env().to_llm_config()
        _dump_final_prompt_for_debug(system_prompt, inputs)

        logger.info(
            "markdown run started",
            b_id=inputs.b_id,
            txn_id=inputs.txn_id,
            document_id=inputs.document_id,
            template_id=inputs.template_id,
            run_id=run_id,
            model=getattr(llm_config, "model", ""),
        )
        yield {"type": "start", "run_id": run_id, "document_id": inputs.document_id}

        async for kind, text in stream_markdown(
            system_prompt=system_prompt, context=ctx, llm_config=llm_config
        ):
            if kind == "delta":
                yield {"type": "delta", "text": text}
                continue

            # kind == "done" — persist, then close the stream
            markdown = text
            try:
                self.document_service.write_document_content(
                    s3_url=inputs.s3_url,
                    document_id=inputs.document_id,
                    content=markdown,
                )
                self.document_service.update_document_status(
                    document_id=inputs.document_id, status="success"
                )
            except Exception:
                logger.exception(
                    "failed to persist markdown note",
                    document_id=inputs.document_id,
                    txn_id=inputs.txn_id,
                    severity="critical",
                )
            logger.info(
                "markdown run finished",
                txn_id=inputs.txn_id,
                document_id=inputs.document_id,
                chars=len(markdown),
            )
            yield {
                "type": "done",
                "markdown": markdown,
                "document_id": inputs.document_id,
            }
