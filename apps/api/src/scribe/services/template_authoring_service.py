"""
Template Authoring Service

Orchestrates the `ai-create-template` flow: validate input, resolve the LLM
config, call the authoring agent, and return a draft template as markdown
(NOT structured sections).

Returns a dict: {title, desc, template_instructions}.
The caller (router) shapes the HTTP response.
"""

from typing import Any, Dict, Optional

from scribe.core.custom_logger import get_logger
from scribe.services.agent_config import LLMAgentConfig
from scribe.services.template_authoring_agent import TemplateAuthoringAgent
from scribe.core.time_utils import get_current_utc_timestamp

logger = get_logger(__name__)


class TemplateAuthoringService:
    async def create_template_draft(
        self,
        b_id: str,
        content: Optional[str] = None,
        instruction: Optional[str] = None,
        file_base64: Optional[str] = None,
        media_type: Optional[str] = None,
        file_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        if (
            not (content and content.strip())
            and not file_base64
            and not (instruction and instruction.strip())
        ):
            raise ValueError(
                "Provide at least one of `content` (pasted/extracted text), "
                "`file_base64` (an image/PDF upload), or `instruction`."
            )

        agent_config = LLMAgentConfig.from_env()

        logger.info(
            "AI_CREATE_TEMPLATE: authoring template draft",
            b_id=b_id,
            has_text=bool(content and content.strip()),
            has_file=bool(file_base64),
            media_type=media_type,
        )

        template, usage = await TemplateAuthoringAgent.generate(
            agent_config=agent_config,
            content=content,
            instruction=instruction,
            file_base64=file_base64,
            media_type=media_type,
            file_name=file_name,
            date=get_current_utc_timestamp(),
        )

        logger.info(
            "AI_CREATE_TEMPLATE: draft ready",
            b_id=b_id,
            title=template.get("title"),
            instructions_len=len(template.get("template_instructions", "")),
            usage_information=usage,
            severity="medium",
        )

        return template