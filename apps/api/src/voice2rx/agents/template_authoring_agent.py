"""
Template Authoring Agent

Turns an uploaded/pasted clinical document (or a short instruction like
"generate SOAP notes") into a REUSABLE markdown note template, rather than a
filled-in note. Backs the `ai-create-template` endpoint.

Output contract (LLM returns a JSON object — NOT the [{title, value}] note
shape, so we parse it directly instead of going through
voice2rx.utils.json_normalization):

    {
      "title": "<template name>",
      "desc": "<one-line description>",
      "template_instructions": "<full markdown template as a single string>"
    }
"""

import base64
import binascii
import time
import uuid as uuid_lib
from typing import Any, Dict, Optional, Tuple

import orjson
from echo import AgentConfig as EchoAgentConfig, PersonaConfig, TaskConfig
from echo.agents.generic_agent import GenericAgent
from echo.models.user_conversation import (
    ContentSourceType,
    ConversationContext,
    DocumentContent,
    ImageContent,
    Message,
    MessageRole,
    TextMessage,
)

from logs.custom_logger import get_logger
from voice2rx.services.prompts import get_prompt_service

from .agent_config import LLMAgentConfig

logger = get_logger(__name__)

# Keys we require back from the model.
_REQUIRED_KEYS = ("title", "desc", "template_instructions")


class TemplateAuthoringAgent:
    """Agent that authors a reusable markdown template from arbitrary input."""

    @staticmethod
    def create_agent_config(
        instruction: str = "",
        date: Optional[str] = None,
    ) -> EchoAgentConfig:
        prompt_svc = get_prompt_service()
        parsed = prompt_svc.get_parsed_agent_prompt(
            "template_authoring",
            response_type="json",
            instruction=instruction or "",
            date=date or "",
        )
        return EchoAgentConfig(
            persona=PersonaConfig(
                role=parsed.role(),
                goal=parsed.goal,
                backstory=parsed.full_backstory(),
            ),
            task=TaskConfig(
                description=parsed.task_instructions or "",
                expected_output=parsed.expected_output_for("json"),
            ),
        )

    @staticmethod
    def _build_context(
        content: Optional[str],
        file_base64: Optional[str],
        media_type: Optional[str],
        file_name: Optional[str],
    ) -> ConversationContext:
        ctx = ConversationContext()
        blocks: list = []

        if content and content.strip():
            blocks.append(TextMessage(text=content.strip()))

        if file_base64:
            mt = (media_type or "").lower()
            if mt == "application/pdf":
                blocks.append(
                    DocumentContent(
                        source_type=ContentSourceType.BASE64,
                        data=file_base64,
                        name=file_name or "source.pdf",
                    )
                )
            elif mt.startswith("image/"):
                blocks.append(
                    ImageContent(
                        media_type=mt,
                        source_type=ContentSourceType.BASE64,
                        data=file_base64,
                    )
                )
            else:
                extracted = TemplateAuthoringAgent._extract_file_text(
                    file_base64=file_base64,
                    media_type=media_type,
                    file_name=file_name,
                )
                if extracted:
                    label = (
                        f"Contents of uploaded file '{file_name}':\n"
                        if file_name
                        else ""
                    )
                    blocks.append(TextMessage(text=f"{label}{extracted}"))
                else:
                    logger.info(
                        "AI_CREATE_TEMPLATE: no text extracted from upload",
                        media_type=media_type,
                        file_name=file_name,
                    )

        if not blocks:
            blocks.append(
                TextMessage(text="Design a template based on the steering instruction.")
            )

        ctx.add_message(Message(role=MessageRole.USER, content=blocks))
        return ctx

    @staticmethod
    def _extract_file_text(
        file_base64: str,
        media_type: Optional[str],
        file_name: Optional[str],
    ) -> Optional[str]:
        try:
            raw = base64.b64decode(file_base64, validate=False)
        except (binascii.Error, ValueError) as e:
            logger.warning(
                "AI_CREATE_TEMPLATE: file_base64 is not valid base64",
                file_name=file_name,
                error=str(e),
                severity="medium",
            )
            return None

        from voice2rx.utils.text_extraction import extract_text

        return extract_text(raw, media_type=media_type, file_name=file_name)

    @staticmethod
    def _parse_output(raw_text: str) -> Dict[str, Any]:
        cleaned = (raw_text or "").strip()
        if cleaned.startswith("```"):
            nl = cleaned.find("\n")
            cleaned = cleaned[nl + 1 :] if nl != -1 else cleaned.lstrip("`").lstrip("json")
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            parsed = orjson.loads(cleaned)
        except Exception as e:
            raise ValueError(f"Template authoring model returned non-JSON output: {e}")

        if not isinstance(parsed, dict):
            raise ValueError("Template authoring model did not return a JSON object")

        missing = [k for k in _REQUIRED_KEYS if not parsed.get(k)]
        if missing:
            raise ValueError(
                f"Template authoring output missing required key(s): {missing}"
            )

        return {
            "title": str(parsed["title"]).strip(),
            "desc": str(parsed["desc"]).strip(),
            "template_instructions": str(parsed["template_instructions"]).strip(),
        }

    @staticmethod
    async def generate(
        agent_config: LLMAgentConfig,
        content: Optional[str] = None,
        instruction: Optional[str] = None,
        file_base64: Optional[str] = None,
        media_type: Optional[str] = None,
        file_name: Optional[str] = None,
        date: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
        echo_agent_config = TemplateAuthoringAgent.create_agent_config(
            instruction=instruction or "",
            date=date,
        )
        llm_config = agent_config.to_llm_config()

        agent = GenericAgent(agent_prompt=echo_agent_config, llm_config=llm_config)
        context = TemplateAuthoringAgent._build_context(
            content=content,
            file_base64=file_base64,
            media_type=media_type,
            file_name=file_name,
        )

        out_msg_id = request_id or f"ai_create_template_{uuid_lib.uuid4().hex}"
        started = time.time()
        result = await agent.run(context, out_msg_id=out_msg_id)
        logger.info(
            "template authoring agent.run completed",
            request_id=out_msg_id,
            elapsed=f"{time.time() - started:.2f}s",
            severity="medium",
        )

        if result.llm_response is None:
            raise Exception("Template authoring agent returned no response")
        if result.llm_response.error:
            raise Exception(result.llm_response.error)

        template = TemplateAuthoringAgent._parse_output(result.llm_response.text)
        return template, result.llm_response.details