"""
Parse single-prompt agent text into sections: identity, goal, backstory, task_instructions,
expected_output_json, expected_output_markdown, user_prompt (optional).
Section tags are XML-style: <section_name>...</section_name>.
"""

import re
from dataclasses import dataclass
from typing import Optional

from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)

# Section tags we expect in agent prompts (lowercase for lookup)
SECTION_TAGS = [
    "identity",
    "goal",
    "backstory",
    "scope_boundary",
    "task_instructions",
    "expected_output",
    "expected_output_json",
    "expected_output_markdown",
    "user_prompt",
    "communication_style",
   
    "approach",
    "guardrails",
    "tools_available",
]


@dataclass
class ParsedAgentPrompt:
    """Parsed sections from a single agent prompt. All fields optional; missing sections are None."""

    identity: Optional[str] = None
    goal: Optional[str] = None
    backstory: Optional[str] = None
    scope_boundary: Optional[str] = None
    task_instructions: Optional[str] = None
    expected_output: Optional[str] = None
    expected_output_json: Optional[str] = None
    expected_output_markdown: Optional[str] = None
    user_prompt: Optional[str] = None
    communication_style: Optional[str] = None
    approach: Optional[str] = None
    guardrails: Optional[str] = None
    tools_available: Optional[str] = None

    def role(self) -> str:
        """Default role from identity: first non-empty line, or a generic fallback."""
        if self.identity:
            # for line in self.identity.strip().split("\n"):
            #     line = line.strip()
            #     if line and not line.startswith("-") and not line.startswith("You do NOT"):
            #         return line
            return self.identity.strip()
        return "Assistant"

    def full_backstory(self) -> str:
        """Combine backstory + optional scope_boundary + optional communication_style for PersonaConfig."""
        parts = []
        if self.backstory:
            parts.append(self.backstory.strip())
        if self.scope_boundary:
            parts.append(self.scope_boundary.strip())
        if self.communication_style:
            parts.append(self.communication_style.strip())
        return "\n\n".join(parts) if parts else ""

    def expected_output_for(self, response_type: str = "json") -> Optional[str]:
        """Pick expected_output, expected_output_json, or expected_output_markdown by response_type."""
        if self.expected_output:
            return self.expected_output
        if response_type == "markdown":
            return self.expected_output_markdown
        return self.expected_output_json


def parse_agent_prompt(raw_text: str) -> ParsedAgentPrompt:
    """
    Extract sections from raw prompt text using XML-style tags.
    Tags are case-insensitive; content is preserved as-is (trimmed).
    """
    if not raw_text or not isinstance(raw_text, str):
        return ParsedAgentPrompt()

    sections = {}
    for tag in SECTION_TAGS:
        # Match <tag>...</tag> with any content (non-greedy, allow newlines)
        pattern = re.compile(
            rf"<{tag}\s*>(.*?)</{tag}\s*>",
            re.IGNORECASE | re.DOTALL,
        )
        match = pattern.search(raw_text)
        if match:
            content = match.group(1).strip()
            if content:
                sections[tag.lower()] = content

    return ParsedAgentPrompt(
        identity=sections.get("identity"),
        goal=sections.get("goal"),
        backstory=sections.get("backstory"),
        scope_boundary=sections.get("scope_boundary"),
        task_instructions=sections.get("task_instructions"),
        expected_output=sections.get("expected_output"),
        expected_output_json=sections.get("expected_output_json"),
        expected_output_markdown=sections.get("expected_output_markdown"),
        user_prompt=sections.get("user_prompt"),
        communication_style=sections.get("communication_style"),
        approach=sections.get("approach"),
        guardrails=sections.get("guardrails"),
        tools_available=sections.get("tools_available"),
    )
