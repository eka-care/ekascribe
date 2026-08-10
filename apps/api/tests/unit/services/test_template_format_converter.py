"""Unit tests for TemplateFormatConverter."""

import pytest
from scribe.services.format_adapter import TemplateFormatConverter


class TestTemplateFormatConverter:
    """Test cases for template format conversion."""



    def test_categorize_templates_by_type(self):
        """Test template categorization by explicit type field."""
        templates = [
            {"template_id": "custom_template", "template_type": "integration"},
            {"template_id": "another_template", "template_type": "default"},
        ]

        result = TemplateFormatConverter.categorize_templates(templates)

        assert len(result["integration"]) == 1
        assert len(result["visual"]) == 1
        assert result["integration"][0]["template_id"] == "custom_template"


    def test_convert_to_new_format_already_new(self):
        """Test conversion when data is already in new format."""
        transaction_data = {
            "txn_id": "test-123",
            "request_templates": {
                "visual": [{"template_id": "visual_template_a"}],
                "integration": [{"template_id": "integration_template_a"}],
            }
        }

        result = TemplateFormatConverter.convert_to_new_format(transaction_data)

        assert "request_templates" in result
        assert result["request_templates"]["visual"][0]["template_id"] == "visual_template_a"

    def test_convert_to_new_format_no_templates(self):
        """Test conversion when no templates provided."""
        transaction_data = {
            "txn_id": "test-123",
            "b_id": "business-123",
        }

        result = TemplateFormatConverter.convert_to_new_format(transaction_data)

        assert "request_templates" in result
        assert result["request_templates"]["visual"] == []
        assert result["request_templates"]["integration"] == []

    def test_convert_to_old_format(self):
        """Test conversion from new format to old format."""
        transaction_data = {
            "txn_id": "test-123",
            "request_templates": {
                "visual": [{"template_id": "visual_template_a", "language_output": "en-IN"}],
                "integration": [{"template_id": "integration_template_a", "language_output": "en-IN"}],
            }
        }

        result = TemplateFormatConverter.convert_to_old_format(transaction_data)

        assert "output_format_template" in result
        assert "request_templates" in result  # Should keep request_templates
        assert len(result["output_format_template"]) == 2
        # Check that both templates are present
        template_ids = [t["template_id"] for t in result["output_format_template"]]
        assert "visual_template_a" in template_ids
        assert "integration_template_a" in template_ids

    def test_convert_to_old_format_already_old(self):
        """Test conversion when data is already in old format."""
        transaction_data = {
            "txn_id": "test-123",
            "output_format_template": [
                {"template_id": "integration_template_a", "language_output": "en-IN"},
            ]
        }

        result = TemplateFormatConverter.convert_to_old_format(transaction_data)

        assert "output_format_template" in result
        assert len(result["output_format_template"]) == 1

    def test_prepare_for_storage(self):
        """Test prepare_for_storage converts to new format."""
        transaction_data = {
            "txn_id": "test-123",
            "output_format_template": [
                {"template_id": "integration_template_a", "language_output": "en-IN"},
            ]
        }

        result = TemplateFormatConverter.prepare_for_storage(transaction_data)

        assert "request_templates" in result
        assert "output_format_template" not in result

    def test_prepare_for_sqs(self):
        """Test prepare_for_sqs converts to old format."""
        transaction_data = {
            "txn_id": "test-123",
            "request_templates": {
                "visual": [],
                "integration": [{"template_id": "integration_template_a", "language_output": "en-IN"}],
            }
        }

        result = TemplateFormatConverter.prepare_for_sqs(transaction_data)

        assert "output_format_template" in result
        assert len(result["output_format_template"]) == 1
        # Original should not be modified
        assert "request_templates" in transaction_data

    def test_get_all_templates_from_new_format(self):
        """Test getting all templates from new format."""
        transaction_data = {
            "request_templates": {
                "visual": [{"template_id": "template1"}],
                "integration": [{"template_id": "template2"}],
            }
        }

        result = TemplateFormatConverter.get_all_templates(transaction_data)

        assert len(result) == 2
        template_ids = [t["template_id"] for t in result]
        assert "template1" in template_ids
        assert "template2" in template_ids

    def test_get_all_templates_from_old_format(self):
        """Test getting all templates from old format."""
        transaction_data = {
            "output_format_template": [
                {"template_id": "template1"},
                {"template_id": "template2"},
            ]
        }

        result = TemplateFormatConverter.get_all_templates(transaction_data)

        assert len(result) == 2

    def test_get_integration_templates(self):
        """Test getting only integration templates."""
        transaction_data = {
            "request_templates": {
                "visual": [{"template_id": "visual_template_a"}],
                "integration": [{"template_id": "integration_template_a"}],
            }
        }

        result = TemplateFormatConverter.get_integration_templates(transaction_data)

        assert len(result) == 1
        assert result[0]["template_id"] == "integration_template_a"



