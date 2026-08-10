"""Client for the Eka Care hub onboarding configuration API.

Used by the language config endpoint to fetch the workspace's doctors list
when the JWT carries an `oid` claim.
"""

import json
import os
from typing import Any, Dict, List, Optional

import requests

from logs.custom_logger import get_logger

logger = get_logger(__name__)


HUB_CONFIG_KEYS = (
    "id,abha,business_name,clinics,doctors,tags,labels,queues,"
    "mr_document_type,denial_list,loginmeta,groups,patient_attributes,"
    "custom_attributes,meta"
)
HUB_CONFIG_PATH = "/onboarding/5/configuration/"


def _hub_base_url() -> str:
    env = (os.getenv("ENV") or "").lower()
    if env != "prod":
        return "http://hub.orbi.dev"
    return "http://hub.orbi.orbi"


def fetch_doctors(jwt_payload: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """Return the `doctors` list from hub's onboarding configuration.

    Returns None on any failure so the caller can degrade gracefully.
    """
    url = f"{_hub_base_url()}{HUB_CONFIG_PATH}"
    headers = {
        "Content-Type": "application/json",
        "jwt-payload": json.dumps(jwt_payload),
    }
    params = {"config_keys": HUB_CONFIG_KEYS, "format": "json"}

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
    except requests.RequestException as exc:
        logger.warning(f"hub configuration request failed: {exc}", severity="medium")
        return None

    if response.status_code != 200:
        logger.warning(
            f"hub configuration returned {response.status_code}: {response.text[:200]}",
            severity="medium",
        )
        return None

    try:
        body = response.json()
    except ValueError as exc:
        logger.warning(f"hub configuration returned invalid JSON: {exc}", severity="medium")
        return None

    return body.get("doctors")
