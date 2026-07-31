"""
Agent Configuration Module

This module provides configuration management for LLM-based agents.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any
from echo import AgentConfig as EchoAgentConfig, PersonaConfig, TaskConfig
from echo import LLMConfig
import os


@dataclass
class LLMAgentConfig:
    """Configuration for LLM-based agents (wraps Echo SDK configuration)"""

    provider: str = "openai"
    model: str = "gpt-4o-mini"
    temperature: float = 0.2
    max_tokens: int = 4096
    max_iterations: int = 5

    @classmethod
    def from_env(cls) -> "LLMAgentConfig":
        """Load configuration from environment variables"""
        return cls(
            # canonical name first; legacy ECHO_DEFAULT_PROVIDER still honored
            provider=os.getenv("ECHO_DEFAULT_LLM_PROVIDER")
            or os.getenv("ECHO_DEFAULT_PROVIDER", "openai"),
            model=os.getenv("ECHO_DEFAULT_LLM_MODEL")
            or os.getenv("ECHO_LLM_MODEL", "gpt-4o-mini"),
            temperature=float(os.getenv("ECHO_DEFAULT_LLM_TEMPERATURE", "0.2")),
            max_tokens=int(os.getenv("ECHO_DEFAULT_LLM_MAX_TOKENS", "4096")),
            max_iterations=int(os.getenv("ECHO_DEFAULT_LLM_MAX_ITERATIONS", "5")),
        )

    @classmethod
    def from_dict(cls, config: Dict[str, Any]) -> "LLMAgentConfig":
        """Load configuration from dictionary (from DB config)"""
        return cls(
            provider=config.get("provider", "openai"),
            model=config.get("model", "gpt-4o-mini"),
            temperature=config.get("temperature", 0.2),
            max_tokens=config.get("max_tokens", 4096),
            max_iterations=config.get("max_iterations", 5),
        )

    def to_llm_config(self) -> LLMConfig:
        """Convert to Echo SDK LLMConfig object"""

        return LLMConfig(
            provider=self.provider,
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            max_iterations=self.max_iterations,
            region=os.getenv("AWS_DEFAULT_REGION", "ap-south-1"),
            api_key=os.getenv("API_KEY"),
            aws_access_key_id=os.getenv("KB_AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("KB_AWS_SECRET_ACCESS_KEY"),
        )
