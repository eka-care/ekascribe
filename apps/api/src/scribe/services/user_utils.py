# Contains the ekascribe_config CRUD operations for DynamoDB. And util func to check for paid user.
import logging
from typing import Dict, Any
from scribe.repositories.config_utils import get_ekascribe_config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def is_user_paid(b_id: str, jwt_payload: Dict[str, Any], user_uuid: str = "_") -> bool:
    # 1. Check JWT payload first
    if (jwt_payload.get("cc") or {}).get("esc") == 1:
        logger.info(f"User {b_id} is considered paid based on JWT payload.")
        return True
    
    logger.info(f"User {b_id} is not a paid user.")
    return False
