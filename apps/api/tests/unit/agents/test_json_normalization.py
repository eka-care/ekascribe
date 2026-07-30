import pytest
import orjson
from voice2rx.utils.json_normalization import _normalize_json_output, normalize_whitespace

def test_normalize_json_output_raw_json():
    """Test with raw JSON array."""
    raw = '[{"title": "Chief Complaint", "value": "Fever"}]'
    result = _normalize_json_output(raw)
    parsed = orjson.loads(result)
    assert isinstance(parsed, list)
    assert len(parsed) == 1
    assert parsed[0]["title"] == "Chief Complaint"

def test_normalize_json_output_markdown_fence():
    """Test with markdown code fences."""
    raw = """```json
[
  {
    "title": "Chief Complaint",
    "value": "Fever"
  }
]
```"""
    result = _normalize_json_output(raw)
    parsed = orjson.loads(result)
    assert isinstance(parsed, list)
    assert len(parsed) == 1
    assert parsed[0]["title"] == "Chief Complaint"

def test_normalize_json_output_flat_dict():
    """Test with flat dictionary (should be converted to list of title/value)."""
    raw = '{"Chief Complaint": "Fever", "Plan": "Rest"}'
    result = _normalize_json_output(raw)
    parsed = orjson.loads(result)
    assert isinstance(parsed, list)
    assert len(parsed) == 2
    titles = [item["title"] for item in parsed]
    assert "Chief Complaint" in titles
    assert "Plan" in titles

def test_normalize_json_output_single_title_value_dict():
    """Test with single {title, value} dict (should be wrapped in list)."""
    raw = '{"title": "Chief Complaint", "value": "Fever"}'
    result = _normalize_json_output(raw)
    parsed = orjson.loads(result)
    assert isinstance(parsed, list)
    assert len(parsed) == 1
    assert parsed[0]["title"] == "Chief Complaint"

def test_normalize_json_output_invalid_json():
    """Test with invalid JSON (should return raw text or stripped text)."""
    raw = "This is not JSON"
    result = _normalize_json_output(raw)
    assert result == "This is not JSON"

def test_normalize_json_output_markdown_no_newline():
    """Test with markdown fence but no newline (edge case)."""
    raw = "```json" + '[{"title": "A", "value": "B"}]' + "```"
    result = _normalize_json_output(raw)
    parsed = orjson.loads(result)
    assert parsed[0]["title"] == "A"

def test_normalize_whitespace():
    """Test the normalize_whitespace utility."""
    # Test multiple spaces
    assert normalize_whitespace("Too    many    spaces") == "Too many spaces"
    
    # Test excessive newlines
    assert normalize_whitespace("Line 1\n\n\n\nLine 2") == "Line 1\n\nLine 2"
    
    # Test mixed spaces and tabs
    assert normalize_whitespace("Space and\t\ttab") == "Space and tab"
    
    # Test leading/trailing whitespace
    assert normalize_whitespace("  Trim me  ") == "Trim me"

def test_normalize_json_output_with_whitespace():
    """Test that JSON normalization also cleans whitespace in values."""
    raw = '[{"title": "Chief Complaint", "value": "Fever    and    cough"}]'
    result = _normalize_json_output(raw)
    parsed = orjson.loads(result)
    assert parsed[0]["value"] == "Fever and cough"
