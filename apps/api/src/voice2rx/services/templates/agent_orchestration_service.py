"""
Agent Orchestration Service - Handles all agent-based operations

This service manages:
- Agent configuration and feature flags
- Translation operations via TranscriptTranslationAgent
- Template generation via TemplateGenerationAgent 
"""

import os
from typing import TYPE_CHECKING, Any, Dict, Optional, Tuple
import time
from logs.custom_logger import get_logger
from voice2rx.agents import AgentFactory, LLMAgentConfig, TranscriptTranslationAgent
from voice2rx.core.exceptions import SystemFailureException
from voice2rx.services.config_service import ConfigService

if TYPE_CHECKING:
    from voice2rx.services.templates.conversion_pipeline import ConversionContext

logger = get_logger(__name__)


class AgentOrchestrationService:
    """Service for orchestrating all agent-based operations."""

    def __init__(self, file_service, s3_bucket_name: str):
        """
        Initialize agent orchestration service.

        Args:
            file_service: TemplateResultFileService for file operations
            s3_bucket_name: S3 bucket name for storing results
        """
        self.config_service = ConfigService()
        self.file_service = file_service
        self.s3_bucket_name = s3_bucket_name
        self.default_agent_config = LLMAgentConfig.from_env()

        logger.info("AgentOrchestrationService initialized successfully")

    def should_use_agent(self, b_id: str) -> bool:
        try:
            use_echo_agent = os.getenv("USE_ECHO_AGENT")
            if use_echo_agent and use_echo_agent == "true":
                return True

            return False
        except Exception as e:
            logger.warning(
                "Failed to check use_echo_agent flag, defaulting to False",
                b_id=b_id,
                error=str(e),
                severity="medium",
            )
            return False

    def get_agent_config(self, b_id: str) -> LLMAgentConfig:
        try:
            config = self.config_service.get_workspace_config(b_id)
            if config and "echo_agent_config" in config:
                return LLMAgentConfig.from_dict(config["echo_agent_config"])

            return self.default_agent_config
        except Exception as e:
            logger.warning(
                "Failed to load business config, using env defaults",
                b_id=b_id,
                error=str(e),
                severity="medium",
            )
            return self.default_agent_config

    async def process_with_agent(
        self, ctx: "ConversionContext"
    ) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        try:
            logger.info(
                "Starting agent processing",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                has_template=ctx.template_id is not None or bool(ctx.final_prompt),
            )

            if not (ctx.template_id or ctx.final_prompt):
                return None, None

            agent_config = self.get_agent_config(ctx.b_id)
            output_data, details = await self._generate_template(ctx, agent_config)

            logger.info(
                "Template generation completed",
                txn_id=ctx.txn_id,
                output_length=len(output_data) if output_data else 0,
                severity="medium",
            )
            return output_data, details

        except Exception as e:
            logger.error(
                "Agent processing failed",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    async def translate_transcript(
        self, ctx: "ConversionContext"
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        try:
            agent_config = self.get_agent_config(ctx.b_id)

            logger.info(
                f"Translating transcript to {ctx.target_language}",
                txn_id=ctx.txn_id,
                target_language=ctx.target_language,
            )

            translated_text, details = await TranscriptTranslationAgent.translate(
                transcript=ctx.transcript_text,
                target_language=ctx.target_language,
                agent_config=agent_config,
                txn_id=ctx.txn_id,
            )

            if not translated_text:
                raise SystemFailureException(
                    f"Translation to {ctx.target_language} returned empty result",
                    txn_id=ctx.txn_id,
                    b_id=ctx.b_id,
                )

            logger.info(
                f"Translation completed for {ctx.target_language}",
                txn_id=ctx.txn_id,
                target_language=ctx.target_language,
                severity="medium",
            )

            return translated_text, details

        except Exception as e:
            logger.error(
                f"Failed to translate transcript to {ctx.target_language}",
                txn_id=ctx.txn_id,
                target_language=ctx.target_language,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    async def _generate_template(
        self,
        ctx: "ConversionContext",
        agent_config: LLMAgentConfig,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        try:
            logger.info(
                "Agent invocation started",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                is_direct_transcript=ctx.is_direct_transcript,
            )
            start_time = time.time()

            if getattr(ctx, "is_integration_generation", False):
                agent_class = AgentFactory.get_agent_for_integration_flow()
                output, details = await agent_class.generate(
                    transcript=ctx.transcript_text,
                    final_prompt=ctx.final_prompt,
                    agent_config=agent_config,
                    txn_id=ctx.txn_id,
                    resolved_context=ctx.resolved_context,
                )
            else:
                agent_class = AgentFactory.get_agent_for_template_flow()
                output, details = await agent_class.generate(
                    transcript=ctx.transcript_text,
                    final_prompt=ctx.final_prompt,
                    agent_config=agent_config,
                    txn_id=ctx.txn_id,
                    response_type=ctx.response_type,
                    date=ctx.date_str,
                    schema=ctx.schema_str,
                    resolved_context=ctx.resolved_context,
                )
            elapsed = time.time() - start_time
            logger.info(
                "Agent call completed successfully",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                elapsed=f"{elapsed:.2f}s",
                output_length=len(output) if output else 0,
                severity="medium",
            )

            if not output:
                raise SystemFailureException(
                    "Agent returned empty response", txn_id=ctx.txn_id, b_id=ctx.b_id
                )

            return output, details

        except Exception as e:
            logger.error(
                "Agent call failed",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise SystemFailureException(
                f"Agent generation failed: {str(e)}", txn_id=ctx.txn_id, b_id=ctx.b_id
            )
