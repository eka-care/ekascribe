from enum import Enum
from typing import List

from pydantic import ConfigDict, BaseModel, Field


class IntegrationCategory(str, Enum):
    EMR = "emr"
    WEBHOOK = "webhook"
    COMMUNICATION = "communication"
    OTHER = "other"


class IntegrationStatus(str, Enum):
    AVAILABLE = "available"
    COMING_SOON = "coming_soon"
    BETA = "beta"
    DEPRECATED = "deprecated"


class LinkStatus(str, Enum):
    ENABLED = "enabled"
    DISABLED = "disabled"
    CONTACT_SUPPORT = "contact_support"


class Integration(BaseModel):
    id: str
    name: str
    description: str
    category: IntegrationCategory
    icon: str
    integration_status: IntegrationStatus
    link_status: LinkStatus
    tags: List[str] = Field(default_factory=list)

    model_config = ConfigDict(use_enum_values=True)


class IntegrationsData(BaseModel):
    integrations: List[Integration]


class IntegrationsResponse(BaseModel):
    data: IntegrationsData
