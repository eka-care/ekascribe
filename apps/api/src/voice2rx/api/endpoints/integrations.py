from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from logs.custom_logger import get_logger
from voice2rx.api.schemas.integration import (
    Integration,
    IntegrationCategory,
    IntegrationStatus,
    LinkStatus,
)

integrations_router = APIRouter()
logger = get_logger(__name__)


# Static, hardcoded for now. Will be replaced with a per-user lookup against
# the user_config DB once the backing store is finalized. Contract is stable —
# clients should not need to change when the source moves to DB.
_STATIC_INTEGRATIONS: list[Integration] = [
    Integration(
        id="eka_emr",
        name="Eka Care",
        description=(
            "A leading AI-powered EMR used by 50k+ doctors, ranging from "
            "individual practices to multi-chain hospitals, and seamlessly "
            "integrated with EkaScribe for voice-to-structured clinical notes."
        ),
        category=IntegrationCategory.EMR,
        icon="/assets/eka-emr.png",
        integration_status=IntegrationStatus.AVAILABLE,
        link_status=LinkStatus.ENABLED,
        tags=["EMR"],
    ),
    Integration(
        id="ojas_soft",
        name="Ojas Soft",
        description=(
            "A hospital-management EMR system supporting OPD/IPD, OT, pharmacy, "
            "billing, and complete hospital workflows, with seamless integration "
            "available through EkaScribe."
        ),
        category=IntegrationCategory.EMR,
        icon="/assets/ojas-emr.webp",
        integration_status=IntegrationStatus.AVAILABLE,
        link_status=LinkStatus.CONTACT_SUPPORT,
        tags=["EMR", "Hospital"],
    ),
    Integration(
        id="clinikk",
        name="Clinikk",
        description=(
            "A growing chain of modern primary-care clinics offering affordable, "
            "accessible healthcare services, now using EkaScribe to improve "
            "doctor efficiency and clinical documentation quality."
        ),
        category=IntegrationCategory.EMR,
        icon="/assets/clinikk-emr.png",
        integration_status=IntegrationStatus.AVAILABLE,
        link_status=LinkStatus.CONTACT_SUPPORT,
        tags=["EMR", "Primary Care"],
    ),
    Integration(
        id="nic_ehospital",
        name="E-Hospital (NIC)",
        description=(
            "A government-supported hospital management system offering secure, "
            "unified access to patient records and services across institutions."
        ),
        category=IntegrationCategory.EMR,
        icon="/assets/nic-emr.png",
        integration_status=IntegrationStatus.AVAILABLE,
        link_status=LinkStatus.CONTACT_SUPPORT,
        tags=["EMR", "Government"],
    ),
    Integration(
        id="ohc_emr",
        name="Open Healthcare Network (OHC)",
        description=(
            "Open Healthcare Network(OHC) is an open-source platform that helps governments, hospitals,"
            "and innovators build connected healthcare systems faster, safer, and at national scale"
        ),
        category=IntegrationCategory.EMR,
        icon="https://cdn.eka.care/vagus/cmovcoowa00010tdmhjba8pvi.png",
        integration_status=IntegrationStatus.COMING_SOON,
        link_status=LinkStatus.CONTACT_SUPPORT,
        tags=["EMR", "Government"],
    ),
    Integration(
        id="akhil_emr",
        name="Akhil Systems",
        description=(
            "One of India's pioneering HMIS companies with 30+ years of healthcare experience, offering Augastam EMR,"
            "Miracle HIS, and cloud-based solutions for hospitals, clinics, and diagnostic centres"
        ),
        category=IntegrationCategory.EMR,
        icon="https://cdn.eka.care/vagus/cmovcnut500000tdmhta748p1.png",
        integration_status=IntegrationStatus.AVAILABLE,
        link_status=LinkStatus.CONTACT_SUPPORT,
        tags=["EMR"],
    )
]


@integrations_router.get("")
@integrations_router.get("/")
async def get_integrations() -> JSONResponse:
    integrations = [item.dict() for item in _STATIC_INTEGRATIONS]
    return JSONResponse(
        content={"data": {"integrations": integrations}},
        status_code=status.HTTP_200_OK,
    )
