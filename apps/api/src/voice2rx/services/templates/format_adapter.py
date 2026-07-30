"""
Template Format Converter Service.

Handles conversion between old output_format_template format and new request_templates format.
"""

from typing import Dict, List, Any, Optional
from logs.custom_logger import get_logger
from voice2rx.utils.constants import INTEGRATION_TEMPLATE_IDS

logger = get_logger(__name__)

SUPPORTED_EMRS = {
    "ace-health-solutions": {"name": "Ace Health Solutions", "template_id": "eka_emr_template"},
    "advancedmd": {"name": "AdvancedMD", "template_id": "eka_emr_template"},
    "allscripts": {"name": "Allscripts", "template_id": "eka_emr_template"},
    "amazing-charts": {"name": "Amazing Charts", "template_id": "eka_emr_template"},
    "athenahealth": {"name": "athenahealth", "template_id": "eka_emr_template"},
    "attune-technologies": {"name": "Attune Technologies", "template_id": "eka_emr_template"},
    "bestdoc": {"name": "BestDoc", "template_id": "eka_emr_template"},
    "birlamedisoft": {"name": "Birlamedisoft", "template_id": "eka_emr_template"},
    "carecloud": {"name": "CareCloud", "template_id": "eka_emr_template"},
    "cerner-oracle-health": {"name": "Cerner Oracle Health", "template_id": "eka_emr_template"},
    "chartlogic": {"name": "ChartLogic", "template_id": "eka_emr_template"},
    "chirotouch": {"name": "ChiroTouch", "template_id": "eka_emr_template"},
    "cloudnine": {"name": "Cloudnine", "template_id": "eka_emr_template"},
    "compurx-infotech": {"name": "CompuRx Infotech", "template_id": "eka_emr_template"},
    "compulink": {"name": "Compulink", "template_id": "eka_emr_template"},
    "cpsi": {"name": "CPSI", "template_id": "eka_emr_template"},
    "curemd": {"name": "CureMD", "template_id": "eka_emr_template"},
    "dentrix": {"name": "Dentrix", "template_id": "eka_emr_template"},
    "docengage": {"name": "DocEngage", "template_id": "eka_emr_template"},
    "docon": {"name": "DocOn", "template_id": "eka_emr_template"},
    "docpulse": {"name": "DocPulse", "template_id": "eka_emr_template"},
    "drchrono": {"name": "DrChrono", "template_id": "eka_emr_template"},
    "eka-care": {"name": "Eka Care", "template_id": "eka_emr_template"},
    "elation-health": {"name": "Elation Health", "template_id": "eka_emr_template"},
    "ema-by-modernizing-medicine": {"name": "EMA by Modernizing Medicine", "template_id": "eka_emr_template"},
    "eclinicalworks": {"name": "eClinicalWorks", "template_id": "eka_emr_template"},
    "ehospital-systems": {"name": "eHospital Systems", "template_id": "eka_emr_template"},
    "epic": {"name": "Epic", "template_id": "eka_emr_template"},
    "ezovion": {"name": "Ezovion", "template_id": "eka_emr_template"},
    "greenway-health": {"name": "Greenway Health", "template_id": "eka_emr_template"},
    "harris-healthcare": {"name": "Harris Healthcare", "template_id": "eka_emr_template"},
    "healthplix": {"name": "HealthPlix", "template_id": "eka_emr_template"},
    "healthray": {"name": "Healthray", "template_id": "eka_emr_template"},
    "inicu": {"name": "iNICU", "template_id": "eka_emr_template"},
    "insta-by-practo": {"name": "Insta by Practo", "template_id": "eka_emr_template"},
    "intellimed": {"name": "IntelliMed", "template_id": "eka_emr_template"},
    "jeevanti": {"name": "Jeevanti", "template_id": "eka_emr_template"},
    "kareo": {"name": "Kareo", "template_id": "eka_emr_template"},
    "lybrate": {"name": "Lybrate", "template_id": "eka_emr_template"},
    "matrixcare": {"name": "MatrixCare", "template_id": "eka_emr_template"},
    "medevolve": {"name": "MedEvolve", "template_id": "eka_emr_template"},
    "medhost": {"name": "Medhost", "template_id": "eka_emr_template"},
    "meditech": {"name": "MEDITECH", "template_id": "eka_emr_template"},
    "medixcel": {"name": "Medixcel", "template_id": "eka_emr_template"},
    "medmantra": {"name": "Medmantra", "template_id": "eka_emr_template"},
    "medmind-technologies": {"name": "MedMind Technologies", "template_id": "eka_emr_template"},
    "modmed": {"name": "ModMed", "template_id": "eka_emr_template"},
    "mocdoc": {"name": "MocDoc", "template_id": "eka_emr_template"},
    "nephroplus": {"name": "NephroPlus", "template_id": "eka_emr_template"},
    "netsmart": {"name": "Netsmart", "template_id": "eka_emr_template"},
    "nextech": {"name": "Nextech", "template_id": "eka_emr_template"},
    "nextgen-healthcare": {"name": "NextGen Healthcare", "template_id": "eka_emr_template"},
    "nicksoft": {"name": "NICKSoft", "template_id": "eka_emr_template"},
    "office-practicum": {"name": "Office Practicum", "template_id": "eka_emr_template"},
    "open-dental": {"name": "Open Dental", "template_id": "eka_emr_template"},
    "paras-hmis": {"name": "Paras HMIS", "template_id": "eka_emr_template"},
    "pcc-pediatric-solutions": {"name": "PCC Pediatric Solutions", "template_id": "eka_emr_template"},
    "pointclickcare": {"name": "PointClickCare", "template_id": "eka_emr_template"},
    "practice-fusion": {"name": "Practice Fusion", "template_id": "eka_emr_template"},
    "practo": {"name": "Practo", "template_id": "eka_emr_template"},
    "praxis-emr": {"name": "Praxis EMR", "template_id": "eka_emr_template"},
    "prognocis": {"name": "PrognoCIS", "template_id": "eka_emr_template"},
    "remedy-hms": {"name": "Remedy HMS", "template_id": "eka_emr_template"},
    "sevocity": {"name": "Sevocity", "template_id": "eka_emr_template"},
    "simplepractice": {"name": "SimplePractice", "template_id": "eka_emr_template"},
    "softclinic": {"name": "SoftClinic", "template_id": "eka_emr_template"},
    "therapynotes": {"name": "TherapyNotes", "template_id": "eka_emr_template"},
    "trakcare": {"name": "TrakCare", "template_id": "eka_emr_template"},
    "veradigm": {"name": "Veradigm", "template_id": "eka_emr_template"},
    "webpt": {"name": "WebPT", "template_id": "eka_emr_template"},
    "other": {"name": "Other", "template_id": "eka_emr_template"},
}

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

    @staticmethod
    def get_visual_templates(transaction_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        if "request_templates" in transaction_data:
            request_templates = transaction_data.get("request_templates", {})
            return request_templates.get("visual", [])
        elif "output_format_template" in transaction_data:
            all_templates = transaction_data.get("output_format_template", [])
            return [
                t for t in all_templates
                if not TemplateFormatConverter.is_integration_template(t.get("template_id", ""))
            ]
        else:
            return []

    def integration_template_by_emr(emr_name: str) -> Optional[str]:
        emr_config = SUPPORTED_EMRS.get(emr_name)
        if emr_config is None:
            return None
        return emr_config.get("template_id")

