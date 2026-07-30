"""
Agents Module

This module provides AI agents for medical template generation and processing.
"""

from .agent_factory import AgentFactory
from .agent_config import LLMAgentConfig
from .template_agent import TemplateGenerationAgent
from .translation_agent import TranscriptTranslationAgent
from .medication_agent import MedicationExtractionAgent

__all__ = [
    "AgentFactory",
    "LLMAgentConfig",
    "TemplateGenerationAgent",
    "TranscriptTranslationAgent",
    "MedicationExtractionAgent",
]
