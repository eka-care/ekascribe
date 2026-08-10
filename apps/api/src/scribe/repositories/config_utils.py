# Contains the ekascribe_config CRUD operations for DynamoDB
import logging
from typing import Dict, Any

from botocore.exceptions import ClientError

from scribe.core.custom_logger import get_logger
from scribe.repositories.dynamo_helper import DynamoHelper

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = get_logger(__name__)

TABLE_NAME = 'ekascribe_config'
try:
    db_helper = DynamoHelper(TABLE_NAME)
except Exception as e:
    logger.error(f"Failed to initialize DynamoHelper for table {TABLE_NAME}: {e}", severity="medium")
    db_helper = None


def create_ekascribe_config(config_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Creates a new item in the ekascribe_config table.

    :param config_data: A dictionary containing the item data.
                        Expected keys: "b_id"(compulsory), "user_uuid", "auto_download",
                        "scribe_enabled", "special_templates", "selected_preferences"
    :return: The response from DynamoDB.
    """
    if not db_helper:
        raise ConnectionError("DynamoDB helper is not initialized.")
    try:
        # The DynamoHelper.create_item is for simple PKs.
        # We use the table instance from the helper for our composite key condition.
        response = db_helper._table_instance.put_item(
            Item=config_data,
            ConditionExpression='attribute_not_exists(b_id) AND attribute_not_exists(user_uuid)'
        )
        logger.info(f"Successfully created config for b_id={config_data.get('b_id')}")
        return response
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.error(f"Config already exists for b_id={config_data.get('b_id')}", severity="medium")
        else:
            logger.error(f"Error creating config: {e.response['Error']['Message']}", severity="medium")
        raise


def get_ekascribe_config(b_id: str, user_uuid: str = "_") -> Dict[str, Any]:
    """
    Fetches an item from the ekascribe_config table.
    """
    if not db_helper:
        raise ConnectionError("DynamoDB helper is not initialized.")
    try:
        key = {'b_id': b_id, 'user_uuid': user_uuid}
        item = db_helper.get_item(key_dict=key)
        if item:
            logger.info(f"Successfully fetched config for b_id={b_id}")
        else:
            logger.warning(f"No config found for b_id={b_id}", severity="medium")
        return item
    except ClientError as e:
        logger.error(f"Error fetching config for b_id={b_id}: {e.response['Error']['Message']}", severity="medium")
        raise


def update_ekascribe_config(b_id: str, updates: Dict[str, Any], user_uuid: str = "_") -> Dict[str, Any]:
    """
    Updates an item in the ekascribe_config table.

    :param updates: A dictionary of attributes to update.
    :return: The updated attributes of the item.
    """
    if not db_helper:
        raise ConnectionError("DynamoDB helper is not initialized.")
    if not updates:
        logger.warning("No updates provided.", severity="medium")
        return None
        
    key = {'b_id': b_id, 'user_uuid': user_uuid}
    try:
        # key = {'b_id': b_id, 'user_uuid': user_uuid}
        # The update_item helper returns the full response, not just attributes.
        # We also don't need to return the new values for this function's contract.
        db_helper.update_item(key_dict=key, update_dict=updates)
        logger.info(f"Successfully updated config for wid={b_id}")
        # The helper's update_item doesn't return the updated attributes by default.
        # We can return the updates dict to signify what was changed.
        return updates
    except Exception as e:
        try:
            put_dict = key | updates
            response = db_helper._table_instance.put_item(
                Item=put_dict,
                ConditionExpression='attribute_not_exists(b_id) AND attribute_not_exists(user_uuid)'
            )
            logger.info(f"Successfully created config")
            return put_dict
        except ClientError as e:
            logger.error(f"Error updating config for wid={b_id}: {e.response['Error']['Message']}", severity="medium")
            raise


def upsert_ekascribe_config(config_data: Dict[str, Any], bid: str, uuid: str) -> Dict[str, Any]:
    """
    Create or update an ekascribe_config record (true upsert).

    If the record exists, update all fields (excluding primary keys).
    If it doesn't exist, create a new one.
    """
    if not db_helper:
        raise ConnectionError("DynamoDB helper is not initialized.")
    if not bid:
        raise ValueError("Missing required field: b_id")

    if not uuid:
        key = {"b_id": bid, "user_uuid": "_"}
    else:
        key = {"b_id": bid, "user_uuid": uuid}

    try:
        existing = db_helper.get_item(key_dict=key)
        if existing:
            update_data = {k: v for k, v in config_data.items() if k not in ("b_id", "user_uuid")}
            if update_data:
                logger.info(f"Record exists for b_id={bid}, user_uuid={uuid}. Updating...")
                db_helper.update_item(key_dict=key, update_dict=update_data)
            else:
                logger.info(f"No updatable fields for b_id={bid}, user_uuid={uuid}. Skipping update.")
            return {"action": "updated", "b_id": bid, "user_uuid": uuid}
        else:
            logger.info(f"No existing record for b_id={bid}, user_uuid={uuid}. Creating new item...")
            db_helper._table_instance.put_item(Item=config_data)
            return {"action": "created", "b_id": bid, "user_uuid": uuid}

    except ClientError as e:
        logger.error(f"DynamoDB error during upsert for b_id={bid}: {e.response['Error']['Message']}", severity="medium")
        raise
