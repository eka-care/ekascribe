"""
Template Format Converter Service.

Handles conversion between old output_format_template format and new request_templates format.
"""

from typing import Dict, List, Any, Optional
from logs.custom_logger import get_logger
from voice2rx.utils.constants import INTEGRATION_TEMPLATE_IDS

logger = get_logger(__name__)

class TemplateFormatConverter:
    """
    Middleware service to convert between output_format_template and request_templates formats.
    
    This service handles:
    1. Converting old format (output_format_template) to new format (request_templates)
    2. Categorizing templates into 'visual' and 'integration' types
    3. Converting new format back to old format for SQS messages
    """

    @staticmethod
    def is_integration_template(template_id: str) -> bool:
        return template_id in INTEGRATION_TEMPLATE_IDS

    @staticmethod
    def categorize_templates(
        output_format_templates: List[Dict[str, Any]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        visual_templates = []
        integration_templates = []

        for template in output_format_templates:
            template_id = template.get("template_id", "")
            template_type = template.get("template_type", "default")
            
            if (
                template_type == "integration" or
                TemplateFormatConverter.is_integration_template(template_id)
            ):
                integration_templates.append(template)
            else:
                visual_templates.append(template)

        return {
            "visual": visual_templates,
            "integration": integration_templates
        }

    # convert to new format. [with viausl templates + integration templates]
    @staticmethod
    def convert_to_new_format(transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        if "request_templates" in transaction_data:
            return transaction_data
    
        if "output_format_template" in transaction_data:
            output_format_templates = transaction_data.get("output_format_template", [])
            categorized = TemplateFormatConverter.categorize_templates(
                output_format_templates
            )
            transaction_data["request_templates"] = categorized
            del transaction_data["output_format_template"]
        else:
            logger.info(
                "No templates provided, initializing empty request_templates",
                txn_id=transaction_data.get("txn_id"),
                severity="medium",
            )
            transaction_data["request_templates"] = {
                "visual": [],
                "integration": []
            }

        return transaction_data

    # convert to output_format_template format.
    @staticmethod
    def convert_to_old_format(transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        if "output_format_template" in transaction_data:
            return transaction_data

        if "request_templates" in transaction_data:
            request_templates = transaction_data.get("request_templates", {})
            
            visual_templates = request_templates.get("visual", [])
            integration_templates = request_templates.get("integration", [])
            
            output_format_templates = visual_templates + integration_templates
            transaction_data["output_format_template"] = output_format_templates
        else:
            transaction_data["output_format_template"] = []

        return transaction_data

    @staticmethod
    def parse_request_templates(transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        return TemplateFormatConverter.convert_to_new_format(transaction_data)

    @staticmethod
    def prepare_for_storage(transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare transaction data for storage by converting to new format."""
        storage_data = transaction_data.copy()
        return TemplateFormatConverter.convert_to_new_format(storage_data)

    @staticmethod
    def prepare_for_sqs(transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        # check if we can avaid deepcopy then it would be better, because deepcopy is heavy recursive operation
        # and it might cause some latency if transaction data is large.
        # sqs_data = copy.deepcopy(transaction_data)
        sqs_data = transaction_data.copy()
        return TemplateFormatConverter.convert_to_old_format(sqs_data)

    @staticmethod
    def get_all_templates(transaction_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        if "request_templates" in transaction_data:
            request_templates = transaction_data.get("request_templates", {})
            visual = request_templates.get("visual", [])
            integration = request_templates.get("integration", [])
            return visual + integration

        elif "output_format_template" in transaction_data:
            return transaction_data.get("output_format_template", [])
        else:
            return []

    @staticmethod
    def get_integration_templates(transaction_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        if "request_templates" in transaction_data:
            request_templates = transaction_data.get("request_templates", {})
            return request_templates.get("integration", [])
        elif "output_format_template" in transaction_data:
            all_templates = transaction_data.get("output_format_template", [])
            return [
                t for t in all_templates
                if TemplateFormatConverter.is_integration_template(t.get("template_id", ""))
            ]
        else:
            return []

