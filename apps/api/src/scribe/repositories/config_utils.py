"""CRUD helpers for the workspace/user config table."""
import logging
from typing import Any, Dict

from scribe.core.custom_logger import get_logger
from scribe.repositories.doc_store import ConditionalCheckFailed, DocStore

logging.basicConfig(level=logging.INFO)
logger = get_logger(__name__)

TABLE_NAME = 'ekascribe_config'
try:
    db_helper = DocStore(TABLE_NAME)
except Exception as e:
    logger.error(f"Failed to initialize store for table {TABLE_NAME}: {e}", severity="medium")
    db_helper = None


def create_ekascribe_config(config_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new config item (fails when the key already exists)."""
    if not db_helper:
        raise ConnectionError("Config store is not initialized.")
    result = db_helper.insert_if_not_exists(config_data)
    if not result.get("success"):
        logger.error(f"Config already exists for b_id={config_data.get('b_id')}", severity="medium")
        raise ConditionalCheckFailed()
    logger.info(f"Successfully created config for b_id={config_data.get('b_id')}")
    return result


def get_ekascribe_config(b_id: str, user_uuid: str = "_") -> Dict[str, Any]:
    """Fetch a config item."""
    if not db_helper:
        raise ConnectionError("Config store is not initialized.")
    key = {'b_id': b_id, 'user_uuid': user_uuid}
    item = db_helper.get_item(key_dict=key)
    if item:
        logger.info(f"Successfully fetched config for b_id={b_id}")
    else:
        logger.warning(f"No config found for b_id={b_id}", severity="medium")
    return item


def update_ekascribe_config(b_id: str, updates: Dict[str, Any], user_uuid: str = "_") -> Dict[str, Any]:
    """Update a config item, creating it when absent."""
    if not db_helper:
        raise ConnectionError("Config store is not initialized.")
    if not updates:
        logger.warning("No updates provided.", severity="medium")
        return None

    key = {'b_id': b_id, 'user_uuid': user_uuid}
    try:
        db_helper.update_item(key_dict=key, update_dict=updates)
        logger.info(f"Successfully updated config for wid={b_id}")
        return updates
    except ConditionalCheckFailed:
        result = db_helper.insert_if_not_exists(key | updates)
        if not result.get("success"):
            logger.error(f"Error updating config for wid={b_id}", severity="medium")
            raise
        logger.info("Successfully created config")
        return key | updates


def upsert_ekascribe_config(config_data: Dict[str, Any], bid: str, uuid: str) -> Dict[str, Any]:
    """Create or update a config record (true upsert)."""
    if not db_helper:
        raise ConnectionError("Config store is not initialized.")
    if not bid:
        raise ValueError("Missing required field: b_id")

    key = {"b_id": bid, "user_uuid": uuid or "_"}
    existing = db_helper.get_item(key_dict=key)
    if existing:
        update_data = {k: v for k, v in config_data.items() if k not in ("b_id", "user_uuid")}
        if update_data:
            logger.info(f"Record exists for b_id={bid}, user_uuid={uuid}. Updating...")
            db_helper.update_item(key_dict=key, update_dict=update_data)
        else:
            logger.info(f"No updatable fields for b_id={bid}, user_uuid={uuid}. Skipping update.")
        return {"action": "updated", "b_id": bid, "user_uuid": key["user_uuid"]}
    logger.info(f"No existing record for b_id={bid}, user_uuid={uuid}. Creating new item...")
    db_helper.put(config_data)
    return {"action": "created", "b_id": bid, "user_uuid": key["user_uuid"]}
