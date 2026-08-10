# voice2rx-be/voice2rx/services/template_service.py

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException
import uuid
from pydantic import BaseModel, ConfigDict, Field
import asyncio
from scribe.repositories.doc_store import DocStore, get_async_store

from scribe.schemas.template_schema import (
    SectionCreate, SectionUpdate, SectionResponse, SectionsListResponse,
    TemplateCreate, TemplateUpdate, TemplateResponse, TemplatesListResponse,
    SectionCreateResponse, SectionUpdateResponse, TemplateCreateResponse,
    MessageResponse, TemplateUpdateModel, SectionUpdateModel
)

from scribe.core.custom_logger import get_logger
logger = get_logger(__name__)

# Pydantic models for stored items
class TemplateModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wid: str = "DEFAULT"  # DEFAULT -> available to all businesses
    title: str
    desc: Optional[str] = None
    section_ids: List[str] = Field(default_factory=list)
    type: Optional[str] = None # default/custom/integration
    available_tools: Optional[str] = None
    archived: Optional[bool] = None
    archived_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    
    model_config = ConfigDict(from_attributes=True)

class SectionModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wid: str = "DEFAULT"  # DEFAULT -> available to all businesses
    title: str
    desc: Optional[str] = None
    format: Optional[str] = None  # P or B
    example: Optional[str] = None
    categories: Optional[List[str]] = None
    archived: Optional[bool] = None
    archived_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    
    model_config = ConfigDict(from_attributes=True)

class TemplateService:
    
    @staticmethod
    def section_to_response(section_data: Dict[str, Any]) -> SectionResponse:
        """Convert a stored section item to SectionResponse schema."""
        return SectionResponse(
            id=section_data.get("id", ""),
            title=section_data.get("title", ""),
            desc=section_data.get("desc", ""),
            format=section_data.get("format", ""),
            example=section_data.get("example", ""),
            default=section_data.get("wid") == "DEFAULT"
        )
    
    @staticmethod
    async def validate_section_access(section_ids: List[str], wid: str) -> List[Dict[str, Any]]:
        """Validate that all sections are accessible to the business"""
        default_sections_task = asyncio.create_task(TemplateService.get_default_sections())
        workspace_sections_task = asyncio.create_task(TemplateService.get_sections_by_business(wid))
    
        # Wait for both queries to complete
        default_sections, workspace_sections = await asyncio.gather(
            default_sections_task, workspace_sections_task
        )
        # Extract section IDs using set operations
        accessible_section_ids = set()
        accessible_section_ids.update(section.get("id") for section in default_sections)
        accessible_section_ids.update(section.get("id") for section in workspace_sections)
        
        input_section_ids = set(section_ids)
        
        # Smart validation: check if input set is subset of accessible set
        missing_sections = input_section_ids - accessible_section_ids
        
        if missing_sections:
            raise HTTPException(
                status_code=400,
                detail=f"Sections not found or not accessible: {list(missing_sections)}"
            )
    
    @staticmethod
    async def get_sections_by_business(wid: str) -> List[Dict[str, Any]]:
        """Get sections for a specific business"""
        store = get_async_store()
        try:
            return await store.find(
                "ekascribe_template_section",
                [("wid", "eq", wid), ("or", [("archived", "not_exists", None), ("archived", "ne", True)])],
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch sections for business {wid}: {str(e)}"
            )
    
    @staticmethod
    async def get_default_sections() -> List[Dict[str, Any]]:
        """Get default sections."""
        store = get_async_store()
        try:
            return await store.find(
                "ekascribe_template_section",
                [("wid", "eq", "DEFAULT"), ("or", [("archived", "not_exists", None), ("archived", "ne", True)])],
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch default sections: {str(e)}"
            )
    
    @staticmethod
    async def get_templates_by_business(wid: str) -> List[Dict[str, Any]]:
        """Get templates for a specific business."""
        store = get_async_store()
        try:
            return await store.find(
                "ekascribe_template",
                [("wid", "eq", wid), ("or", [("archived", "not_exists", None), ("archived", "ne", True)]), ("or", [("type", "not_exists", None), ("type", "ne", "integration")])],
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch templates for business {wid}: {str(e)}"
            )
    
    # TODO add index (wid + type) to optimize this query
    @staticmethod
    async def get_template_by_bid_and_type(wid: str, template_type: str) -> Optional[Dict[str, Any]]:
        """Get template for a specific business and type."""
        store = get_async_store()
        try:
            templates = await store.find(
                "ekascribe_template",
                [("wid", "eq", wid), ("or", [("archived", "not_exists", None), ("archived", "ne", True)]), ("type", "eq", template_type)],
            )
            # one doamin(wid) can have only one template of a type
            if templates:
                logger.critical(f"Found {len(templates)} templates for business {wid} and type {template_type}", severity="critical")
                return templates[0]  
            return None
        
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch template for business {wid} and type {template_type}: {str(e)}"
            )
    
    @staticmethod
    async def get_template_by_bid_and_filters(
        wid: str, 
        filters: Optional[Dict[str, Any]] = None,
        exclude_archived: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Get template for a specific business with flexible filters
        Args:
            wid: Workspace/Business ID
            filters: Dictionary of field-value pairs to filter on
                    e.g., {"type": "integration", "domain": "sales", "status": "active"}
            exclude_archived: Whether to exclude archived templates (default: True)
        
        Returns:
            First matching template or None
        """
        store = get_async_store()

        try:
            where = [("wid", "eq", wid)]
            if exclude_archived:
                where.append(("or", [("archived", "not_exists", None), ("archived", "ne", True)]))
            for field, value in (filters or {}).items():
                if value is None:
                    where.append((field, "not_exists", None))
                else:
                    where.append((field, "eq", value))

            templates = await store.find("ekascribe_template", where)
            
            if filters:
                filter_desc = ", ".join([f"{k}={v}" for k, v in filters.items()])
                logger.info(f"Found {len(templates)} templates for wid={wid} with filters: {filter_desc}")
            else:
                logger.info(f"Found {len(templates)} templates for wid={wid}")
            
            return templates[0] if templates else None
        
        except Exception as e:
            filter_desc = str(filters) if filters else "no filters"
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch template for wid {wid} with {filter_desc}: {str(e)}"
            )
    
    @staticmethod
    async def get_default_templates() -> List[Dict[str, Any]]:
        """Get default templates."""
        store = get_async_store()
        try:
            return await store.find(
                "ekascribe_template",
                [("wid", "eq", "DEFAULT"), ("or", [("archived", "not_exists", None), ("archived", "ne", True)]), ("or", [("type", "not_exists", None), ("type", "ne", "integration")])],
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch default templates: {str(e)}"
            )
    
    @staticmethod
    async def get_my_templates(wid : str, user_uuid : str) -> List[Dict[str, Any]] :
        store = get_async_store()
        template_ids = []
        if workspace_config := await store.get_item("ekascribe_config",{"b_id": wid,"user_uuid": "_"}):
            template_ids.extend(workspace_config.get("my_templates", []))

        if user_config := await store.get_item("ekascribe_config",{"b_id": wid, "user_uuid": user_uuid}):
            template_ids.extend(user_config.get("my_templates", []))

        templates = TemplateService.get_templates_by_ids(list(set(template_ids)))
        return templates

    # Section Services
    @staticmethod
    async def create_section(section_data: SectionCreate, wid: str) -> SectionCreateResponse:
        """Create a new section"""
        # note create all the templates in default for 7176288959780124
        if wid == "7176288959780124":
            wid = "DEFAULT"

        section = SectionModel(
            wid=wid,
            title=section_data.title,
            desc=section_data.desc,
            format=section_data.format.value,
            example=section_data.example,
        )
        
        section_dict = section.model_dump(exclude_none=True)
        store = get_async_store()

        success = await store.create_item("ekascribe_template_section", section_dict)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create section")
        
        return SectionCreateResponse(
            msg="created successfully",
            section_id=section.id
        )
    
    @staticmethod
    async def get_sections(wid: str) -> SectionsListResponse:
        """Get all sections accessible to business"""
        try:
            # Run both queries concurrently

            default_sections_task = asyncio.create_task(TemplateService.get_default_sections())
            workspace_sections_task = asyncio.create_task(TemplateService.get_sections_by_business(wid))
            
            default_sections_data, workspace_sections_data = await asyncio.gather(
                default_sections_task, workspace_sections_task
            )
            
            # Combine all sections into one list
            all_sections_data = default_sections_data + workspace_sections_data
            all_sections = [TemplateService.section_to_response(s) for s in all_sections_data]

            # sort all_sections by custom first
            all_sections.sort(key=lambda x: x.default, reverse=False)
            
            return SectionsListResponse(items=all_sections)
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch sections: {str(e)}"
            )
    
    @staticmethod
    async def update_section(
        section_id: str, 
        section_data: SectionUpdate, 
        wid: str
    ) -> SectionUpdateResponse:
        """Update section or create custom copy if editing default"""
        if wid == "7176288959780124":
            wid = "DEFAULT"

        store = get_async_store()

        # Get the section
        section = await store.get_item("ekascribe_template_section", {"id": section_id})
        if not section or section.get("archived") is True:
            raise HTTPException(status_code=404, detail="Section not found")
        
        # If section belongs to current business, update in place
        if section.get("wid") == wid:
            # Use Pydantic model for update data
            
            update_model = SectionUpdateModel(
                title=section_data.title,
                desc=section_data.desc,
                format=section_data.format.value if section_data.format else None,
                example=section_data.example
            )
            
            # Get only non-None values
            update_data = update_model.model_dump(exclude_none=True)

            success = await store.update_item(
                "ekascribe_template_section", {"id": section_id}, update_data
            )
            
            if not success:
                raise HTTPException(status_code=500, detail="Failed to update section")
            
            return SectionUpdateResponse(
                msg="updated successfully",
                section_id=section_id,
                action="updated"
            )
        
        # If section is default, raise error (no custom copy creation)
        elif section.get("wid") == "DEFAULT":
            raise HTTPException(status_code=403, detail="Default Section not editable")
        
        else:
            raise HTTPException(status_code=403, detail="Section not accessible")
    
    @staticmethod
    async def delete_section(section_id: str, wid: str) -> MessageResponse:
        """Archive (soft delete) a section"""
        store = get_async_store()
        # Get the section
        section = await store.get_item("ekascribe_template_section", {"id": section_id})
        if not section or section.get("archived") is True:
            raise HTTPException(status_code=404, detail="Section not found or already archived")
        
        # Check if section belongs to current business
        if section.get("wid") != wid:
            raise HTTPException(status_code=403, detail="Cannot delete section - not owned by your workspace")
        
        # Soft delete
        success = await store.update_item(
            "ekascribe_template_section",
            {"id": section_id},
            {"archived": True, "archived_at": datetime.utcnow().isoformat()},
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to archive section")
        
        return MessageResponse(msg="Section archived successfully")
    
    # Template Services
    @staticmethod
    async def create_template(template_data: TemplateCreate, wid: str) -> TemplateCreateResponse:
        """Create a new template"""
        # note create all the templates in default for 7176288959780124
        if wid == "7176288959780124":
            wid = "DEFAULT"

        # Validate section access
        await TemplateService.validate_section_access(template_data.section_ids, wid)

        template = TemplateModel(
            wid=wid,
            title=template_data.title,
            desc=template_data.desc,
            section_ids=template_data.section_ids,
            type= template_data.type,
            available_tools=template_data.available_tools
        )

        template_dict = template.model_dump(exclude_none=True)
        store = get_async_store()

        success = await store.create_item("ekascribe_template", template_dict)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create template")

        return TemplateCreateResponse(
            msg="created successfully",
            template_id=template.id
        )
    
    @staticmethod
    async def get_templates(wid: str, user_uuid: str) -> TemplatesListResponse:
        """Get all templates accessible to business"""
        try:
            default_task = asyncio.create_task(TemplateService.get_default_templates())
            workspace_task = asyncio.create_task(TemplateService.get_templates_by_business(wid))
            my_templates_task = asyncio.create_task(TemplateService.get_my_templates(wid, user_uuid))

            default_templates, workspace_templates, my_templates = await asyncio.gather(
                default_task, workspace_task, my_templates_task
            )

            # Deduplicate by ID since dictionaries are unhashable
            default_templates = list({t.get("id"): t for t in default_templates}.values())
            workspace_templates = list({t.get("id"): t for t in workspace_templates}.values())
            my_templates = list({t.get("id"): t for t in my_templates}.values())

            accessible_templates = default_templates + workspace_templates
            accessible_map = {t.get("id"): t for t in accessible_templates}


            my_template_ids = {t.get("id") for t in my_templates}
            for my_tpl in my_templates:
                if my_tpl.get("id") not in accessible_map:
                    accessible_map[my_tpl.get("id")] = my_tpl

            def to_template_response(template):
                # The database is the source of truth for template content.
                return TemplateResponse(
                    id=template.get("id", ""),
                    title=template.get("title", ""),
                    desc=template.get("desc") or "",
                    section_ids=template.get("section_ids", []),
                    default=template.get("wid") == "DEFAULT",
                    is_favorite=template.get("id") in my_template_ids,
                    available_tools=template.get("available_tools")
                )

            accessible_items = [
                resp
                for resp in (to_template_response(t) for t in accessible_map.values())
                if resp is not None
            ]
            accessible_items.sort(key=lambda t: t.default)

            return TemplatesListResponse(
                items=accessible_items
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch templates: {str(e)}"
            )
    
    @staticmethod
    async def update_template(
        template_id: str,
        template_data: TemplateUpdate,
        wid: str
    ) -> MessageResponse:
        if wid == "7176288959780124":
            wid = "DEFAULT"

        """Update an existing template"""
        store = get_async_store()

        template = await store.get_item("ekascribe_template", {"id": template_id})
        if not template or template.get("archived") is True:
            raise HTTPException(status_code=404, detail="Template not found")

        if template.get("wid") != wid:
            raise HTTPException(status_code=403, detail="Template not editable")

        if template_data.section_ids is not None:
            await TemplateService.validate_section_access(template_data.section_ids, wid)

        update_model = TemplateUpdateModel(
            title=template_data.title,
            desc=template_data.desc,
            section_ids=template_data.section_ids,
            available_tools=template_data.available_tools
        )

        update_data = update_model.model_dump(exclude_none=True)

        success = await store.update_item(
            "ekascribe_template", {"id": template_id}, update_data
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to update template")

        return MessageResponse(msg="updated successfully")
    
    @staticmethod
    async def delete_template(template_id: str, wid: str, user_uuid: str) -> MessageResponse:
        """Archive (soft delete) a template and remove its id from any configs' my_templates list."""
        store = get_async_store()

        template = await store.get_item("ekascribe_template", {"id": template_id})
        if not template or template.get("archived") is True:
            raise HTTPException(status_code=404, detail="Template not found or already archived")
        
        if template.get("wid") != wid:
            raise HTTPException(status_code=403, detail="Template not editable")

        # Workspace config (wid, user_uuid="-"/"_", allow legacy and current)
        workspace_config = await store.get_item("ekascribe_config", {"b_id": wid, "user_uuid": "_"})
        user_config = await store.get_item("ekascribe_config", {"b_id": wid, "user_uuid": user_uuid})

        # Remove this template_id from my_templates list of both configs if present
        tasks = []
        for config, key in [
            (workspace_config, {"b_id": wid, "user_uuid": "_"}),
            (user_config, {"b_id": wid, "user_uuid": user_uuid}),
        ]:
            if config:
                my_templates = config.get("my_templates", [])
                if template_id in my_templates:
                    new_templates = [tid for tid in my_templates if tid != template_id]
                    tasks.append(
                        store.update_item(
                            "ekascribe_config", key, {"my_templates": new_templates}
                        )
                    )
        if tasks:
            await asyncio.gather(*tasks)

        success = await store.update_item(
            "ekascribe_template",
            {"id": template_id},
            {"archived": True, "archived_at": datetime.utcnow().isoformat()},
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to archive template")
        
        return MessageResponse(msg="Template archived successfully")

    @staticmethod
    async def get_template_by_id(template_id: str) -> Optional[Dict[str, Any]]:
        """Get template by ID."""
        store = get_async_store()
        try:
            template = await store.get_item(
                "ekascribe_template", {"id": template_id}
            )
            return template
        except Exception as e:
            logger.error(f"Failed to fetch template {template_id}: {str(e)}", severity="critical")
            return None
    
    @staticmethod
    def get_templates_by_ids(template_ids: List[str]) -> List[Dict[str, Any]]:
        store = DocStore('ekascribe_template')
        if not template_ids:
            return []
        
        try:
            batch_size = 100
            all_templates = []
            for i in range(0, len(template_ids), batch_size):
                batch_ids = template_ids[i:i + batch_size]
                response = store.query_multiple_items_batch(
                    ids=batch_ids, key_name="id"
                )
                if response:
                    all_templates.extend(response)
            
            return all_templates
            
        except Exception as e:
            logger.error(f"Failed to fetch templates {template_ids}: {str(e)}", severity="medium")
            return []

    @staticmethod
    def get_template(template_id: str) -> Optional[Dict[str, Any]]:
        store = DocStore('ekascribe_template')
        template = store.get_item({"id": template_id})
        # The database is the source of truth for template content (desc).
        return template

