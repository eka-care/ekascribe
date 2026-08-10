"""Client for the parchi.eka.care doctor profile API.

Used by the EMR integration to resolve the header/footer image URLs and page
layout for the doctor's currently-selected print template.
"""

import json
import os
from typing import Any, Dict, Optional

import requests

from logs.custom_logger import get_logger

logger = get_logger(__name__)


DEFAULT_PARCHI_BASE_URL = "https://parchi.eka.care"
PRINT_TEMPLATE_TYPE = "PRINT"


class DoctorProfileError(Exception):
    """Raised when the doctor profile cannot be resolved into a print layout."""


def _parchi_base_url() -> str:
    return os.getenv("PARCHI_BASE_URL", DEFAULT_PARCHI_BASE_URL).rstrip("/")


def fetch_print_layout(oid: str, jwt_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return layout metadata for the doctor's default-clinic PRINT template.
    Args:
        oid: Doctor `oid` (from JWT). Used as the path parameter.
        jwt_payload: Dict serialized into the `jwt-payload` request header.

    Returns:
        Dict with keys: header_img, footer_img, header_height, footer_height,
        margin_left, margin_right, page_size.
    """
    try:
        if not oid:
            raise DoctorProfileError("oid is required to fetch doctor profile")

        url = f"{_parchi_base_url()}/profile/get/doctorprofile/{oid}"
        headers = {
            "Content-Type": "application/json",
            "jwt-payload": json.dumps(jwt_payload),
        }

        try:
            response = requests.get(url, headers=headers, timeout=15)
        except requests.RequestException as exc:
            raise DoctorProfileError(f"doctor profile request failed: {exc}") from exc

        if response.status_code != 200:
            raise DoctorProfileError(
                f"doctor profile returned {response.status_code}: {response.text[:200]}"
            )

        try:
            profile_body = response.json()
        except ValueError as exc:
            raise DoctorProfileError(f"doctor profile returned invalid JSON: {exc}") from exc

        return _select_print_layout(profile_body)
    except Exception as e:
        logger.debug(
            "get_doctor_profile: failed to get the doctor profiel from parchi for header and footer",
            error = str(e),
        )


def _select_print_layout(profile_body: Dict[str, Any]) -> Dict[str, Any]:
    professional = (profile_body.get("profile") or {}).get("professional") or {}
    default_clinic = professional.get("default_clinic")
    templates = professional.get("templates_v2") or []

    match = _find_print_template(templates, default_clinic)
    if match is None:
        raise DoctorProfileError(
            f"no PRINT template found for default_clinic={default_clinic!r}"
        )

    layout = {
        "header_img": match.get("header_img", "") or "",
        "footer_img": match.get("footer_img", "") or "",
        "header_height": match.get("header_height") or "5cm",
        "footer_height": match.get("footer_height") or "3cm",
        "margin_left": match.get("margin_left") or "1.27cm",
        "margin_right": match.get("margin_right") or "1.27cm",
        "page_size": match.get("page_size") or "A4",
    }

    logger.info(
        "Resolved doctor print layout",
        default_clinic=default_clinic,
        has_header=bool(layout["header_img"]),
        has_footer=bool(layout["footer_img"]),
        severity="medium",
    )
    return layout


def _find_print_template(
    templates: list, default_clinic: Optional[str]
) -> Optional[Dict[str, Any]]:
    if not default_clinic:
        return None
    for tpl in templates:
        if (
            tpl.get("clinicId") == default_clinic
            and tpl.get("type") == PRINT_TEMPLATE_TYPE
        ):
            return tpl
    return None
