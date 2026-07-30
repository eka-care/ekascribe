from fastapi import APIRouter, HTTPException, Depends, Request
# NOTE: use Starlette's UploadFile, not fastapi.UploadFile. `await request.form()`
# yields starlette.datastructures.UploadFile instances, and fastapi.UploadFile is a
# *subclass* — so `isinstance(upload, fastapi.UploadFile)` is False and silently drops
# the upload. Starlette's base class matches both.
from starlette.datastructures import UploadFile
from typing import Dict, Optional
import base64

from voice2rx.api.schemas.template_schema import (
    SectionCreate, SectionUpdate, SectionsListResponse, SectionCreateResponse, 
    SectionUpdateResponse, TemplateCreate, TemplateUpdate, TemplatesListResponse,
    TemplateCreateResponse, MessageResponse,
    AiCreateTemplateRequest, AiCreateTemplateResponse,
)
from voice2rx.services.templates.template_service import TemplateService
from voice2rx.services.templates.template_authoring_service import TemplateAuthoringService
from voice2rx.api.dependencies import get_validated_jwt_payload
from voice2rx.utils.error_handler import handle_template_errors

from logs.custom_logger import get_logger
logger = get_logger(__name__)

# Create router
template_router = APIRouter(tags=["Templates"])
template_authoring_service = TemplateAuthoringService()

async def get_current_business_id(request: Request) -> str:
    """Extract business ID from JWT token"""
    try:
        jwt_payload: Dict = await get_validated_jwt_payload(request)
        if not jwt_payload:
            raise HTTPException(status_code=401, detail="JWT payload not found")
        return jwt_payload["b-id"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid JWT token")

async def get_current_user_id(request : Request) -> str:
    try:
        jwt_payload: Dict = await get_validated_jwt_payload(request)
        if not jwt_payload:
            raise HTTPException(status_code=401, detail="JWT payload not found")
        return jwt_payload["uuid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid JWT token")


@template_router.post("/section", response_model=SectionCreateResponse, status_code=201)
@handle_template_errors
async def create_section(
    section_data: SectionCreate,
    wid: str = Depends(get_current_business_id)
):
    """Create a new section"""
    return await TemplateService.create_section(section_data, wid)

@template_router.get("/section", response_model=SectionsListResponse)
@handle_template_errors
async def get_sections(
    wid: str = Depends(get_current_business_id)
):
    """Get all sections accessible to the business"""
    return await TemplateService.get_sections(wid)

@template_router.patch("/section/{section_id}", response_model=SectionUpdateResponse)
@handle_template_errors
async def update_section(
    section_id: str,
    section_data: SectionUpdate,
    wid: str = Depends(get_current_business_id)
):
    """Update a section or create custom copy if editing default"""
    return await TemplateService.update_section(
        section_id, section_data, wid
    )

@template_router.delete("/section/{section_id}", response_model=MessageResponse)
@handle_template_errors
async def delete_section(
    section_id: str,
    wid: str = Depends(get_current_business_id)
):
    """Archive (soft delete) a section"""

    return await TemplateService.delete_section(section_id, wid)

@template_router.post("", response_model=TemplateCreateResponse, status_code=201)
@handle_template_errors
async def create_template(
    template_data: TemplateCreate,
    wid: str = Depends(get_current_business_id)
):
    """Create a new template"""
    return await TemplateService.create_template(template_data, wid)

@template_router.get("", response_model=TemplatesListResponse)
@handle_template_errors
async def get_templates(
    wid: str = Depends(get_current_business_id),
    user_uuid : str = Depends(get_current_user_id)
):
    """Get all templates accessible to the business"""
    return await TemplateService.get_templates(wid, user_uuid)

@template_router.patch("/{template_id}", response_model=MessageResponse)
@handle_template_errors
async def update_template(
    template_id: str,
    template_data: TemplateUpdate,
    wid: str = Depends(get_current_business_id)
):
    """Update an existing template"""
    return await TemplateService.update_template(template_id, template_data, wid)

@template_router.delete("/{template_id}", response_model=MessageResponse)
@handle_template_errors
async def delete_template(
    template_id: str,
    wid: str = Depends(get_current_business_id),
    user_uuid : str = Depends(get_current_user_id)
):
    """Archive (soft delete) a template"""
    return await TemplateService.delete_template(template_id, wid, user_uuid)


async def _extract_ai_template_inputs(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        payload = await request.json()
        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=400,
                detail="JSON body must be an object.",
            )
        req = AiCreateTemplateRequest(**payload)  
        return {
            "content": req.content,
            "instruction": req.instruction,
            "file_base64": req.file_base64,
            "media_type": req.media_type,
            "file_name": req.file_name,
        }

    if content_type.startswith("multipart/form-data"):
        form = await request.form()

        upload = form.get("file")

        file_base64 = form.get("file_base64")
        media_type = form.get("media_type")
        file_name = form.get("file_name")

        if isinstance(upload, UploadFile):
            raw = await upload.read()
            file_base64 = base64.b64encode(raw).decode("utf-8")
            media_type = upload.content_type or media_type
            file_name = upload.filename or file_name

        return {
            "content": form.get("content"),
            "instruction": form.get("instruction"),
            "file_base64": file_base64,
            "media_type": media_type,
            "file_name": file_name,
        }

    raise HTTPException(
        status_code=415,
        detail="Content-Type must be application/json or multipart/form-data.",
    )


@template_router.post("/ai-create-template", response_model=AiCreateTemplateResponse)
@handle_template_errors
async def ai_create_template(
    request: Request,
    wid: str = Depends(get_current_business_id),
):
    inputs = await _extract_ai_template_inputs(request)

    draft = await template_authoring_service.create_template_draft(
        b_id=wid,
        content=inputs["content"],
        instruction=inputs["instruction"],
        file_base64=inputs["file_base64"],
        media_type=inputs["media_type"],
        file_name=inputs["file_name"],
    )
    return AiCreateTemplateResponse(**draft)