import base64
import copy
import os
import time
import datetime
import orjson
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Request, HTTPException, status, Body, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from typing import Dict, Any

from logs.custom_logger import get_logger
from voice2rx.api.endpoints.transactions.handlers import ResponseFormatter
from voice2rx.core.exceptions import BadRequestException
from voice2rx.api.schemas.ekascribe_config import (
    WorkspaceConfig,
    UserConfig,
    ALLOWED_IMAGE_CONTENT_TYPES,
    ALLOWED_IMAGE_UNITS,
    ALLOWED_HEADER_FOOTER_TYPES,
    MAX_IMAGE_SIZE_BYTES,
)
from voice2rx.services.hub_client import fetch_doctors as fetch_hub_doctors
from voice2rx.services.storage.s3_service import download_s3_file, upload_file_to_s3
from voice2rx.services.storage.s3_storage_client import S3StorageClient
from voice2rx.services.templates.template_service import TemplateService
from voice2rx.services.config_service import ConfigService
from voice2rx.choices import SUPPORTED_LANGUAGES

language_config_router = APIRouter()
logger = get_logger(__name__)
config_service = ConfigService()

# note : this entire config API is a hack!!!! in ekascribe product. we will have to re-think this whole thing.
# to make it more scalable and maintainable.

non_vaded_bucket = os.getenv("S3_NON_VADED_BUCKET_NAME", "voice-records-batch")
header_footer_bucket = os.getenv("S3_HEADER_FOOTER_BUCKET_NAME", "")
header_footer_cdn_base = os.getenv("S3_HEADER_FOOTER_CDN_BASE_URL", "")

SUPPORTED_CONFIG_DATA = {
    "data": {
        "supported_languages": SUPPORTED_LANGUAGES,
        "supported_output_formats": [
            {"id": "eka_emr_template", "name": "Eka EMR Format"},
            {"id": "clinical_notes_template", "name": "Clinical Notes"},
            {"id": "transcript_template", "name": "Transcription"},
        ],
        "consultation_modes": [
            {
                "id": "consultation",
                "name": "Consultation",
                "desc": "Eka Scribe will listen to your conversation and create clinical notes",
            },
            {
                "id": "dictation",
                "name": "Dictation",
                "desc": "Dictate your notes to Eka Scribe and create clinical notes",
            },
        ],
        "max_selection": {
            "supported_languages": 2,
            "supported_output_formats": 2,
            "consultation_modes": 1,
        },
        "settings": {
            "model_training_consent": {"value": True, "editable": False}
        },
    }
}
_default_my_templates = ["9d9675c6-b29b-424a-abac-99ddd3b8909c", "2f1c9a44-7e6b-4c21-9b3a-1d2e3f4a5b6c", "19288d2f-81a9-46a6-b804-9651242a9b3e", "3a2d8b55-6f7c-4d32-8c4b-2e3f4a5b6c7d", "7d03dd95-45b2-41e1-a5d3-fba98fee0418"]

# TODO: Move this to DB on business level
HARDCODED_TEMPLATES = {
    "174298544783657": [
        {"id": "eka_ipd_notes_template", "name": "Eka IPD Notes Template"},
        {"id": "sushrut_hospital_ipd_notes_template", "name": "Sushrut Hospital IPD Notes Template"},
        {"id": "ot_notes_template", "name": "OT Notes Template"},
    ],
    "174351162717905": [
        {"id": "eka_ipd_notes_template", "name": "Eka IPD Notes Template"},
        {"id": "sushrut_hospital_ipd_notes_template", "name": "Sushrut Hospital IPD Notes Template"},
        {"id": "ot_notes_template", "name": "OT Notes Template"},
    ],
    "7175811053010504": [
        {"id": "sparsh_hospital_opd_template", "name": "Sparsh Hospital OPD Template"},
    ],
}

def _upload_header_footer_image(
    raw_bytes: bytes, content_type: str, oid: str, image_key: str
) -> str:
    ext = content_type.split("/")[-1]
    s3_key = f"header_footer_images/{oid}/{image_key}.{ext}"
    S3StorageClient(bucket_name=header_footer_bucket).put_object(s3_key, raw_bytes, content_type)
    if header_footer_cdn_base:
        return f"{header_footer_cdn_base.rstrip('/')}/{s3_key}"
    return f"https://{header_footer_bucket}.s3.amazonaws.com/{s3_key}"


def _get_and_validate_jwt(request: Request) -> Dict[str, Any]:
    jwt_payload_header = request.headers.get("jwt-payload")
    if not jwt_payload_header:
        raise HTTPException(status_code=400, detail="Missing jwt-payload header.")

    jwt_resp = orjson.loads(jwt_payload_header)
    wid, _ = jwt_resp.get("b-id"),jwt_resp.get("uuid", "")

    if not wid:
        raise HTTPException(
            status_code=400,
            detail="b-id and uuid are required in jwt-payload.",
        )

    return jwt_resp


class CreateConfigRequest(BaseModel):
    """Request model for creating or updating a configuration."""
    request_type: str  # 'workspace' or 'user'
    data: Dict[str, Any]
    headers: Dict[str, Any] = {}


@language_config_router.put("/")
async def upsert_config(request: Request, req: CreateConfigRequest = Body(...)):
    try:
        # validate bid
        jwt_payload = _get_and_validate_jwt(request)
        wid, user_uuid = jwt_payload["b-id"], jwt_payload.get("uuid", "")
        req.data.update({"wid": wid})

        # utm_details : this should get stored in some analytics table or s3 bucket[[this is one time dump data]]
        # but putting this in user config for now. becuase this need in datadash for analytics.
        utm_details = {
            k: v for k, v in {
                "utm_campaign": request.query_params.get("utm_campaign"),
                "utm_source": request.query_params.get("utm_source"),
                "utm_medium": request.query_params.get("utm_medium"),
            }.items() if v is not None
        }   # Only update utm_details if there's at least one valid value
        if utm_details:
            req.data.update({"utm_details": utm_details})

        # store user system info in s3 instead of storing it in database.
        # store s3 url in database.
        request_sys_info = req.data.get("sys_info", {})
        if request_sys_info and user_uuid:
            s3_file_key = f"system_details/{wid}/{user_uuid}/system_details.json"
            sys_info = download_s3_file(
                non_vaded_bucket, s3_file_key, "system_details.json", "download_system_details_from_s3"
            )
            sys_info_defaults = {
                "microphone_permission": False,
                "consult_language": None,
                "system_compatibility": None,
            }
            if sys_info:
                sys_info.update({
                    k: v for k in sys_info_defaults if (v := request_sys_info.get(k))
                })
            else:
                sys_info = {k: request_sys_info.get(k, default) for k, default in sys_info_defaults.items()}
            upload_file_to_s3(non_vaded_bucket, s3_file_key, sys_info, "upload_system_details_to_s3")
            req.data["sys_info_s3_url"] = s3_file_key

        oid = jwt_payload.get("oid") or wid
        to_remove = []
        for img_field in ("header", "footer"):
            if img_field not in req.data:
                continue
            img_payload = req.data.pop(img_field)
            if img_payload is None:
                to_remove.append(img_field)
                continue
            if not isinstance(img_payload, dict):
                raise BadRequestException(f"{img_field}: must be an object")
            img_type = img_payload.get("type")
            if not img_type:
                raise BadRequestException(f"{img_field}: 'type' is required")
            if img_type not in ALLOWED_HEADER_FOOTER_TYPES:
                raise BadRequestException(
                    f"{img_field}: type '{img_type}' is not supported. Allowed: {sorted(ALLOWED_HEADER_FOOTER_TYPES)}"
                )
            unit = img_payload.get("unit", "cm")
            if unit not in ALLOWED_IMAGE_UNITS:
                raise BadRequestException(
                    f"{img_field}: unit '{unit}' is not supported. Allowed: {sorted(ALLOWED_IMAGE_UNITS)}"
                )
            if img_type == "image":
                if not img_payload.get("data"):
                    raise BadRequestException(f"{img_field}: 'data' is required for type 'image'")
                content_type = img_payload.get("content_type")
                if not content_type:
                    raise BadRequestException(f"{img_field}: 'content_type' is required for type 'image'")
                if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
                    raise BadRequestException(
                        f"{img_field}: content_type '{content_type}' is not supported. Allowed: {sorted(ALLOWED_IMAGE_CONTENT_TYPES)}"
                    )
                try:
                    raw_bytes = base64.b64decode(img_payload["data"])
                except Exception:
                    raise BadRequestException(f"{img_field}: invalid base64 data")
                if len(raw_bytes) > MAX_IMAGE_SIZE_BYTES:
                    raise BadRequestException(f"{img_field}: image exceeds 5 MB limit")
                url = _upload_header_footer_image(
                    raw_bytes=raw_bytes, content_type=content_type, oid=oid, image_key=img_field,
                )
                req.data[img_field] = {"type": "image", "url": url, "width": img_payload.get("width"), "height": img_payload.get("height"), "unit": unit}
            else:
                req.data[img_field] = {"type": "margin", "width": img_payload.get("width"), "height": img_payload.get("height"), "unit": unit}

        if req.request_type == "workspace":
            config_obj = WorkspaceConfig(**req.data)
            item = {**config_obj.dict(exclude_unset=True), "user_uuid": "_", "b_id": wid}
            result = config_service.upsert_config(item, wid, "_")
            if to_remove:
                config_service.remove_config_attributes(wid, to_remove, "_")

        elif req.request_type == "user" and user_uuid:
            req.data["user_uuid"] = user_uuid
            config_obj = UserConfig(**req.data)
            item = {**config_obj.dict(exclude_unset=True), "b_id": wid}
            result = config_service.upsert_config(item, wid, user_uuid)
            if to_remove:
                config_service.remove_config_attributes(wid, to_remove, user_uuid)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid request_type. Must be 'workspace' or 'user'.",
            )

        return {"message": "Config upserted successfully", "result": result}

    except ValidationError as ve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=ve.errors())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error upserting config: {e}", severity="medium")
        return ResponseFormatter.from_exception(e)  


@language_config_router.get("/")
async def get_language_config(
    request: Request, 
    my_templates: bool = False,
    timezone: str = Query(None, description="Timezone identifier (e.g., 'Asia/Kolkata', 'UTC')"),   
) -> JSONResponse:
    try:
        # validate bid
        jwt_payload = _get_and_validate_jwt(request)
        wid, user_uuid = jwt_payload["b-id"], jwt_payload.get("uuid", "")
        paid_doc = (jwt_payload.get("cc") or {}).get("esc") == 1

        def _get_is_eka_doc(data: Dict[str, Any]) -> bool:
            claims = data.get("cc") or {}
            # pex should be in future, it's epoch time.
            return claims.get("pst") == "true" and claims.get("pex", 0) >= time.time()

        is_eka_doc = _get_is_eka_doc(jwt_payload)
        # if timezone query parameter is provided, 
        # return current time in UTC based on the timezone query parameter
        if timezone:
            try:
                # deprecated timezone handling
                if timezone=="Asia/Calcutta":
                    timezone = "Asia/Kolkata"
                tz = ZoneInfo(timezone)
            except (ZoneInfoNotFoundError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid timezone: '{timezone}'. Please provide a valid IANA timezone identifier.",
                )
            current_time_utc = datetime.datetime.now(tz).astimezone(
                datetime.timezone.utc
            )
            logger.info(
                f"Timezone conversion: {timezone} -> UTC: {current_time_utc.isoformat()}"
            )
            response = {
                "timezone": timezone,
                "current_time_utc": current_time_utc.isoformat(),
                "timestamp": current_time_utc.timestamp(),
            }
            return ResponseFormatter.json_response(
                response, status_code=status.HTTP_200_OK
            )

        # if my_templates query parameter is provided, return my templates
        # and cache it for 2 hours in browser.
        if my_templates:
            templates = config_service.get_my_templates(wid, user_uuid)
            if len(templates) == 0:
                templates.extend(_default_my_templates)

            templates_details = TemplateService.get_templates_by_ids(templates)
            response = JSONResponse(
                content={"data": {"my_templates": [
                    {"id": t.get("id"), "name": t.get("title", "NA")} 
                    for t in templates_details
                ]}},
                status_code=status.HTTP_200_OK,
            )
            return response

        logger.info(f"Fetching v3 config for wid={wid}, user_uuid={user_uuid}")

        response_data = copy.deepcopy(SUPPORTED_CONFIG_DATA)
        response_data["data"]["selected_preferences"] = {}
        response_data["data"]["my_templates"] = []
        response_data["data"]["notes_ids"] = []
        response_data["data"]["print_compact"] = True

        if templates := HARDCODED_TEMPLATES.get(wid):
            response_data["data"]["supported_output_formats"].extend(templates)

        # merge the workspace and user configs, 
        # override by user config if same is in workspace config and user config.
        for config in filter(None, [
            config_service.get_workspace_config(wid),
            config_service.get_user_config(wid, user_uuid) if user_uuid else None,
        ]):
            prefs = response_data["data"]["selected_preferences"]
            data = response_data["data"]
            if output_format_template := config.get("output_format_template"):
                existing = prefs.get("output_formats") or []
                unique_formats = {
                    (item.get("id") or item.get("template_id")): item 
                    for item in existing
                }
                for template in output_format_template:
                    template_id = template.get("id") or template.get("template_id")
                    unique_formats[template_id] = template
                prefs["output_formats"] = list(unique_formats.values())
            
            prefs.update({
                "auto_download": config.get("auto_download", prefs.get("auto_download", False)),
                "languages": config.get("input_languages", prefs.get("languages", [])),
                "output_formats": prefs.get("output_formats", config.get("output_format_template")),
                "model_type": config.get("model_type", prefs.get("model_type")),
                "consultation_mode": config.get("consultation_mode", prefs.get("consultation_mode")),
                "auto_detect_language": config.get("auto_detect_language", prefs.get("auto_detect_language", False)),
            })

            if paid_doc:
                data["settings"]["model_training_consent"].update({
                    "value": config.get("scribe_enabled", False),
                    "editable": True,
                })

            if special_templates := config.get("special_templates"):
                unique_formats = {item["id"]: item for item in data["supported_output_formats"]}
                unique_formats.update({t["id"]: t for t in special_templates})
                data["supported_output_formats"] = list(unique_formats.values())

            # merge my_templates with template details lookup
            my_templates = config.get("my_templates")
            if (not my_templates or len(my_templates) == 0) and os.getenv("ENV") == "prod":
                my_templates = _default_my_templates

            existing_ids = {t.get("id") for t in data["my_templates"]}
            templates_details = []
            if my_templates:
                templates_details = TemplateService.get_templates_by_ids(list(my_templates))
            
            for template in templates_details:
                if template.get("id") not in existing_ids:
                    data["my_templates"].append({
                        "id": template.get("id"),
                        "name": template.get("title", "NA"),
                    })

            for key in (
                "clinic_name",
                "specialization",
                "emr_name",
                "microphone_permission_check",
                "consult_language",
                "scribe_signup",
                "contact_number",
                "onboarding_step",
                "copy_overlay",
                "header",
                "footer",
                "notes_ids",
            ):
                if value := config.get(key):
                    data[key] = value

            # explicit None check: the walrus loop above drops falsy values,
            # which would turn a stored print_compact=False back into the default True
            if (print_compact := config.get("print_compact")) is not None:
                data["print_compact"] = print_compact

        user_fields = ["uuid", "fn", "mn", "ln", "dob", "gen", "s", "w-id", "b-id", "w-n", "oid"]
        response_data["data"]["user_details"] = {
            **{key: jwt_payload.get(key) for key in user_fields},
            "is_paid_doc": paid_doc,
            "is_eka_doc": is_eka_doc,
        }

        if jwt_payload.get("oid"):
            doctors = fetch_hub_doctors(jwt_payload)
            if doctors is not None:
                response_data["data"]["doctors"] = doctors

        return ResponseFormatter.json_response(
            response_data, status_code=status.HTTP_200_OK
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching v3 config", severity="medium")
        return ResponseFormatter.from_exception(e)
