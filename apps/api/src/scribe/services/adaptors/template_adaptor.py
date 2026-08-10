"""
Template Adaptor

Bridges MedScribeAlliance protocol template listing to Voice2Rx
template management system.
"""

from typing import Any, Dict, List, Optional

from scribe.core.custom_logger import get_logger

from scribe.schemas import TemplateInfo, TemplatesListResponse
from scribe.services.template_service import TemplateService

logger = get_logger(__name__)


class TemplateAdaptor:
    """
    Adaptor for converting backend templates to protocol template format.
    
    Maps Voice2Rx templates to standard protocol template IDs:
    - eka_emr_template → soap
    - medication_template → medications
    - transcript_template → transcript
    - Custom templates → Pass through with original ID
    """
    
    def __init__(self, template_service: Optional[TemplateService] = None):
        """
        Initialize template adaptor.
        
        Args:
            template_service: Backend template service
        """
        self.template_service = template_service or TemplateService()
        
        # keeping these template as standard templates just for example
        # there is not any concept to standard templates in the protocol
        self.standard_templates = {
            "eka_emr_template": TemplateInfo(
                id="eka_emr_template",
                name="Eka EMR Template",
                description="EKa EMR integration template"
            ),
            "clinikk_template": TemplateInfo(
                id="clinikk_template",
                name="Clinikk Template",
                description="Clinikk integration template"
            ),
            "transcript_template": TemplateInfo(
                id="transcript_template",
                name="Full Transcript",
                description="Complete voice-to-text transcription"
            ),
            "nic_template": TemplateInfo(
                id="nic_template",
                name="NIC Template",
                description="Nic clinet integration template"
            ),
            "clinical_notes_template": TemplateInfo(
                id="clinical_notes_template",
                name="Clinical Notes",
                description="Clinical notes integration template"
            ),
        }
    
    async def get_available_templates(
        self,
        b_id: str,
        headers: Optional[Dict[str, str]] = None
    ) -> TemplatesListResponse:
        """
        Get available templates for authenticated user/business.
        
        Combines standard protocol templates with custom templates
        from the backend.
        
        Args:
            b_id: Business ID
            headers: Request headers with auth info
            
        Returns:
            Protocol templates list response
        """
        templates_list = []
        
        # Add standard templates (always available)
        templates_list.extend(self.standard_templates.values())
        
        # Fetch custom templates from backend
        try:
            custom_templates = await self._fetch_custom_templates(b_id, headers)
            templates_list.extend(custom_templates)
        except Exception as e:
            logger.warning(
                f"Failed to fetch custom templates: {e}",
                b_id=b_id,
                severity="medium",
            )
        
        logger.info(
            f"Retrieved {len(templates_list)} templates",
            b_id=b_id,
            template_count=len(templates_list),
            severity="medium",
        )
        
        return TemplatesListResponse(templates=templates_list)
    
    async def _fetch_custom_templates(
        self,
        b_id: str,
        headers: Optional[Dict[str, str]]
    ) -> List[TemplateInfo]:
        """
        Fetch custom templates from backend and convert to protocol format.
        
        Args:
            b_id: Business ID
            headers: Request headers
            
        Returns:
            List of custom template info
        """
        custom_templates = []
        
        try:
            # Fetch templates from backend
            backend_templates = await self.template_service.get_templates_by_business(b_id)
            default_templates = await self.template_service.get_default_templates()

            backend_templates = backend_templates + default_templates
            
            for template in backend_templates:
                # Skip standard templates (already added)
                template_id = template.get("id", "")
                if template_id in self.standard_templates:
                    continue
                
                # Convert to protocol format
                custom_templates.append(TemplateInfo(
                    id=template_id,
                    name=template.get("template_name", template_id),
                    description=template.get("description", f"Custom template: {template_id}")
                ))
                
        except Exception as e:
            logger.error(
                f"Error fetching custom templates: {e}",
                b_id=b_id,
                exc_info=True,
                severity="medium",
            )
        
        return custom_templates
    
    async def validate_template_ids(
        self,
        template_ids: List[str],
        b_id: str,
    ) -> tuple[bool, Optional[str]]:
        """
        Validate that requested template IDs are available.
        
        Args:
            template_ids: List of template IDs to validate
            b_id: Business ID
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        available_templates = await self.get_available_templates(b_id)
        available_ids = {t.id for t in available_templates.templates}
        
        for template_id in template_ids:
            if template_id not in available_ids:
                return False, f"Template '{template_id}' is not available"
        
        return True, None
