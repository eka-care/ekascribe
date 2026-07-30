from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Type

import yaml
from logs.custom_logger import get_logger
from pydantic import BaseModel, ConfigDict

from .generic import NAME_TO_TOOL, _GenericEmitTool

logger = get_logger(__name__)

_TOOL_PROMPTS_PATH = Path(__file__).parent / "tool_prompts.yaml"

NARRATIVE_TOOL_NAME = "add_narrative"


class RouteAway(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    tool: str


class ToolPromptEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    when_to_use: str
    rules: Optional[str] = None
    mandatory_content: List[str] = []
    routes_away: List[RouteAway] = []


class ToolPromptsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    preamble: str
    fallback_rule: str
    mandatory_selection_header: str
    tools: Dict[str, ToolPromptEntry]


@lru_cache(maxsize=1)
def load_tool_prompts() -> ToolPromptsConfig:
    try:
        raw = yaml.safe_load(_TOOL_PROMPTS_PATH.read_text(encoding="utf-8"))
        config = ToolPromptsConfig.model_validate(raw)
    except Exception as e:
        raise RuntimeError(
            f"Failed to load tool prompts from {_TOOL_PROMPTS_PATH}: {e}"
        ) from e

    missing = set(NAME_TO_TOOL) - set(config.tools)
    unknown = set(config.tools) - set(NAME_TO_TOOL)
    if missing or unknown:
        raise RuntimeError(
            f"tool_prompts.yaml out of sync with NAME_TO_TOOL registry: "
            f"missing={sorted(missing)}, unknown={sorted(unknown)}"
        )
    return config


@dataclass(frozen=True)
class ToolSpec:
    name: str
    tool_cls: Type[_GenericEmitTool]
    prompt: ToolPromptEntry


def _parse_tokens(available_tools: str) -> List[str]:
    return [t.strip().lower() for t in available_tools.split(",") if t.strip()]


def validate_available_tools(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return ""
    if stripped.lower() == "all":
        return "all"
    tokens = _parse_tokens(stripped)
    unknown = [t for t in tokens if t not in NAME_TO_TOOL]
    if unknown:
        raise ValueError(
            f"Unknown tools in available_tools: {unknown}. "
            f"Valid values: 'all', '' (narrative only), or a comma-separated "
            f"subset of {list(NAME_TO_TOOL)}."
        )
    requested = set(tokens)
    return ",".join(name for name in NAME_TO_TOOL if name in requested)


class ToolCatalog:

    def __init__(self, config: Optional[ToolPromptsConfig] = None) -> None:
        self._config = config or load_tool_prompts()

    def _spec(self, name: str) -> ToolSpec:
        return ToolSpec(
            name=name,
            tool_cls=NAME_TO_TOOL[name],
            prompt=self._config.tools[name],
        )

    def resolve(self, available_tools: Optional[str]) -> List[ToolSpec]:
        if available_tools is None or available_tools.strip().lower() == "all":
            return [self._spec(name) for name in NAME_TO_TOOL]

        tokens = _parse_tokens(available_tools)
        unknown = [t for t in tokens if t not in NAME_TO_TOOL]
        if unknown:
            logger.warning(
                "available_tools contains unknown tool names; ignoring them",
                unknown=unknown,
                available_tools=available_tools,
                severity="medium",
            )
        enabled = {t for t in tokens if t in NAME_TO_TOOL}
        enabled.add(NARRATIVE_TOOL_NAME)
        return [self._spec(name) for name in NAME_TO_TOOL if name in enabled]

    def render_tools_available(self, specs: List[ToolSpec]) -> str:
        """Render the {{tools_available}} prompt block for the enabled set."""
        enabled = {s.name for s in specs}
        parts = [self._config.preamble.strip(), self._config.fallback_rule.strip()]

        for spec in specs:
            parts.append(self._render_tool_block(spec, enabled))

        mandatory_lines = [
            f"- {content} → {spec.name}"
            for spec in specs
            for content in spec.prompt.mandatory_content
        ]
        if mandatory_lines:
            parts.append(
                self._config.mandatory_selection_header.strip()
                + "\n"
                + "\n".join(mandatory_lines)
            )

        return "\n\n".join(parts)

    def _render_tool_block(
        self, spec: ToolSpec, enabled: set, include_heading: bool = True
    ) -> str:
        lines = [f"### {spec.name}"] if include_heading else []
        lines.append(spec.prompt.summary.strip())
        lines.append("When to use: " + spec.prompt.when_to_use.strip())
        if spec.prompt.rules:
            lines.append("Rules: " + spec.prompt.rules.strip())
        redirects = [
            f"- for {r.content} use {r.tool}"
            for r in spec.prompt.routes_away
            if r.tool in enabled
        ]
        if redirects:
            lines.append("Do NOT use this tool:\n" + "\n".join(redirects))
        return "\n".join(lines)

    def instantiate(self, specs: List[ToolSpec]) -> List[_GenericEmitTool]:
        enabled = {s.name for s in specs}
        tools: List[_GenericEmitTool] = []
        for spec in specs:
            tool = spec.tool_cls()

            tool.description = self._render_tool_block(
                spec, enabled, include_heading=False
            )
            tools.append(tool)
        return tools


_catalog: Optional[ToolCatalog] = None


def get_tool_catalog() -> ToolCatalog:
    global _catalog
    if _catalog is None:
        _catalog = ToolCatalog()
    return _catalog
