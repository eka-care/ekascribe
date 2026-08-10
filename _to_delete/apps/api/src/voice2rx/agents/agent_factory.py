"""
Agent Factory

Factory for creating appropriate agents based on flow type.
"""

from typing import Optional, Dict, Any
from .agent_config import LLMAgentConfig
from .template_agent import TemplateGenerationAgent
from .integration_template_agent import IntegrationTemplateAgent


class AgentFactory:
    """Factory for creating appropriate agents based on flow type"""

    @staticmethod
    def get_agent_for_template_flow():
        """Get agent for template ID based flow"""
        return TemplateGenerationAgent

    @staticmethod
    def get_agent_for_integration_flow():
        return IntegrationTemplateAgent
    
    @staticmethod
    def create_agent_config(
        business_config: Optional[Dict[str, Any]] = None
    ) -> LLMAgentConfig:
        """Create agent configuration with priority: business config > env > defaults"""
        if business_config and "echo_agent_config" in business_config:
            return LLMAgentConfig.from_dict(business_config["echo_agent_config"])
        return LLMAgentConfig.from_env()
