"""
Templates Protocol Routes

FastAPI endpoints for template listing according to
MedScribeAlliance Protocol Specification v0.1

Endpoints:
- GET /templates - List available templates
"""

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from scribe.core.custom_logger import get_logger

from scribe.schemas import TemplatesListResponse, ErrorResponse
from scribe.services.adaptors import TemplateAdaptor

logger = get_logger(__name__)

templates_router = APIRouter()

template_adaptor = TemplateAdaptor()


def extract_headers(request: Request) -> dict:
    """Extract required headers from request"""
    headers = {}
    jwt_payload = request.headers.get("jwt-payload", "{}")
    try:
        import json
        payload = json.loads(jwt_payload)
        headers["b_id"] = payload.get("b-id", "")
        headers["uuid"] = payload.get("uuid", "")
    except  Exception as e:
        logger.error(f"Error extracting headers: {e}", severity="medium")
        headers["b_id"] = ""
        headers["uuid"] = ""
    return headers


@templates_router.get(
    "/templates",
    response_model=TemplatesListResponse,
    responses={
        200: {"description": "Templates retrieved successfully"},
        401: {"model": ErrorResponse, "description": "Authentication failed"},
    },
    tags=["templates"],
    summary="List Templates",
    description="Returns templates available to the authenticated user/EMR"
)
async def list_templates(request: Request):
    """
    List all available templates for the authenticated user/business.
    
    Returns:
        List of templates with ID, name, and description
        
    Note:
        The templates endpoint is behind authentication and returns only
        templates available to the authenticated EMR or user, which may include:
        - Standard templates available to all
        - Custom templates created by the EMR
        - User-specific templates (in B2C model)
    """
    b_id = ""
    
    try:
        headers = extract_headers(request)
        b_id = headers.get("b_id", "")
        
        if not b_id:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": {
                        "code": "authentication_failed",
                        "message": "Missing or invalid authentication credentials",
                    }
                }
            )
        
        logger.info(
            "Listing available templates",
            b_id=b_id,
        )
        
        templates_response = template_adaptor.get_available_templates(
            b_id,
            headers,
        )
        
        logger.info(
            f"Retrieved {len(templates_response.templates)} templates",
            b_id=b_id,
            severity="medium",
        )
        
        return templates_response
        
    except Exception as e:
        logger.error(
            f"Error listing templates: {e}",
            b_id=b_id,
            exc_info=True,
            severity="medium",
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Failed to retrieve templates",
                }
            }
        )
