"""
JSON normalization utilities for LLM output.

Used by template and transcript agents to normalize JSON and whitespace.
Kept in utils to avoid circular imports when tests or services import agents.
"""

import re
import orjson
from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)


def normalize_whitespace(text: str) -> str:
    """
    Normalize whitespace in text:
    1. Replace multiple spaces with single spaces.
    2. Replace triple or more newlines with double newlines.
    3. Strip leading/trailing whitespace.
    """
    if not isinstance(text, str):
        return text
    # replace multiple spaces with a single space
    text = re.sub(r"[ \t]+", " ", text)
    # replace triple or more newlines with double newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_json_output(raw_text: str) -> str:
    """
    Normalize LLM JSON output to ensure it conforms to the [{title, value}] array format.
    If the LLM returns a flat dict, transform it to the expected array format.
    Also strips markdown code fences if present.
    """
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        # remove opening fence (possibly ```json)
        try:
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1 :]
        except ValueError:
            # handle case where there's no newline after ```
            # look for where the actual JSON content likely starts
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            else:
                cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    cleaned = cleaned.strip()

    try:
        parsed = orjson.loads(cleaned)
    except Exception:
        logger.warning(
            "Failed to parse LLM output as JSON, returning raw text",
            raw_text_preview=raw_text[:200],
            severity="medium",
        )
        return raw_text

    if isinstance(parsed, list):
        for item in parsed:
            if isinstance(item, dict) and "value" in item:
                item["value"] = normalize_whitespace(item["value"])
        return orjson.dumps(parsed).decode()

    if isinstance(parsed, dict):
        if "title" in parsed and "value" in parsed and len(parsed) == 2:
            parsed["value"] = normalize_whitespace(parsed["value"])
            return orjson.dumps([parsed]).decode()

        normalized = [
            {"title": key, "value": normalize_whitespace(str(value))}
            for key, value in parsed.items()
        ]
        logger.info(
            "Normalized flat dict output to [{title, value}] array format",
            section_count=len(normalized),
        )
        return orjson.dumps(normalized).decode()

    return normalize_whitespace(cleaned)


# Alias for backward compatibility (agents/tests import _normalize_json_output)
_normalize_json_output = normalize_json_output
