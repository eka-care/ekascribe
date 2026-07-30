"""
Configuration Service for EkaScribe Config Management.

This service handles all configuration-related operations including:
- Workspace-level configurations (user_uuid = "_")
- User-level configurations
- CRUD operations for ekascribe_config table
"""
import os
from typing import Dict, Any, Optional
from botocore.exceptions import ClientError
from logs.custom_logger import get_logger
from voice2rx.utils.dynamo_helper import DynamoHelper

logger = get_logger(__name__)

TABLE_NAME = "ekascribe_config"
TEMPLATE_TABLE_NAME = "ekascribe_template"

class ConfigService:
    def __init__(self):
        try:
            self.db_helper = DynamoHelper(TABLE_NAME)
            logger.info(f"ConfigService initialized with table: {TABLE_NAME}")
        except Exception as e:
            logger.error(
                f"Failed to initialize DynamoHelper for table {TABLE_NAME}",
                error=str(e),
                severity="critical",
            )
            raise ConnectionError(f"Failed to initialize ConfigService: {e}")

    def get_workspace_config(self, b_id: str) -> Optional[Dict[str, Any]]:
        try:
            key = {"b_id": b_id, "user_uuid": "_"}
            config = self.db_helper.get_item(key_dict=key)

            if config:
                logger.info("Workspace config retrieved", b_id=b_id, severity="medium")
            else:
                logger.info("No workspace config found", b_id=b_id)

            return config
        except ClientError as e:
            logger.error(
                "Error fetching workspace config",
                b_id=b_id,
                error=e.response["Error"]["Message"],
                severity="critical",
            )
            raise
        except Exception as e:
            logger.error(
                "Unexpected error fetching workspace config", b_id=b_id, error=str(e),
                severity="critical",
            )
            raise

    def get_user_config(self, b_id: str, user_uuid: str) -> Optional[Dict[str, Any]]:
        if not user_uuid or user_uuid == "_":
            logger.warning("Invalid user_uuid provided", b_id=b_id, user_uuid=user_uuid, severity="medium")
            return None

        try:
            key = {"b_id": b_id, "user_uuid": user_uuid}
            config = self.db_helper.get_item(key_dict=key)

            if config:
                logger.info("User config retrieved", b_id=b_id, user_uuid=user_uuid, severity="medium")
            else:
                logger.info("No user config found", b_id=b_id, user_uuid=user_uuid)

            return config
        except ClientError as e:
            logger.error(
                "Error fetching user config",
                b_id=b_id,
                user_uuid=user_uuid,
                error=e.response["Error"]["Message"],
                severity="critical",
            )
            raise
        except Exception as e:
            logger.error(
                "Unexpected error fetching user config",
                b_id=b_id,
                user_uuid=user_uuid,
                error=str(e),
                severity="critical",
            )
            raise

    def get_config(
        self, b_id: str, user_uuid: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        # try user config first if user_uuid is provided
        if user_uuid and user_uuid != "_":
            user_config = self.get_user_config(b_id, user_uuid)
            if user_config:
                return user_config
        # fall back to workspace config
        return self.get_workspace_config(b_id)

    def get_merged_config(
        self, b_id: str, user_uuid: Optional[str] = None
    ) -> Dict[str, Any]:
        merged_config = {}

        # Start with workspace config
        workspace_config = self.get_workspace_config(b_id)
        if workspace_config:
            merged_config.update(workspace_config)

        # Override with user config if available
        if user_uuid and user_uuid != "_":
            user_config = self.get_user_config(b_id, user_uuid)
            if user_config:
                # Merge user config, user settings take precedence
                for key, value in user_config.items():
                    if key not in ["b_id", "user_uuid"]:  # Don't override keys
                        merged_config[key] = value

        return merged_config

    def create_config(self, config_data: Dict[str, Any]) -> Dict[str, Any]:
        if not config_data.get("b_id"):
            raise ValueError("b_id is required")
        if "user_uuid" not in config_data:
            raise ValueError("user_uuid is required")

        try:
            response = self.db_helper._table_instance.put_item(
                Item=config_data,
                ConditionExpression="attribute_not_exists(b_id) AND attribute_not_exists(user_uuid)",
            )
            logger.info(
                "Config created successfully",
                b_id=config_data.get("b_id"),
                user_uuid=config_data.get("user_uuid"),
                severity="medium",
            )
            return response
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                logger.error(
                    "Config already exists",
                    b_id=config_data.get("b_id"),
                    user_uuid=config_data.get("user_uuid"),
                    severity="medium",
                )
            else:
                logger.error(
                    "Error creating config", error=e.response["Error"]["Message"],
                    severity="critical",
                )
            raise

    def update_config(
        self, b_id: str, updates: Dict[str, Any], user_uuid: str = "_"
    ) -> Dict[str, Any]:
        if not updates:
            logger.warning("No updates provided for config update", severity="medium")
            raise ValueError("No updates provided")

        key = {"b_id": b_id, "user_uuid": user_uuid}

        try:
            self.db_helper.update_item(key_dict=key, update_dict=updates)
            logger.info("Config updated successfully", b_id=b_id, user_uuid=user_uuid, severity="medium")
            return updates
        except Exception:
            # Try creating if update fails (item doesn't exist)
            try:
                put_dict = key | updates
                self.db_helper._table_instance.put_item(
                    Item=put_dict,
                    ConditionExpression="attribute_not_exists(b_id) AND attribute_not_exists(user_uuid)",
                )
                logger.info(
                    "Config created (update fallback)",
                    b_id=b_id,
                    user_uuid=user_uuid,
                    severity="medium",
                )
                return put_dict
            except ClientError as ce:
                logger.error(
                    "Error updating/creating config",
                    b_id=b_id,
                    user_uuid=user_uuid,
                    error=ce.response["Error"]["Message"],
                    severity="critical",
                )
                raise

    def upsert_config(
        self, config_data: Dict[str, Any], b_id: str, user_uuid: str = "_"
    ) -> Dict[str, Any]:
        if not b_id:
            raise ValueError("b_id is required")

        key = {"b_id": b_id, "user_uuid": user_uuid}

        try:
            existing = self.db_helper.get_item(key_dict=key)
            if existing:
                # Update existing record
                update_data = {
                    k: v
                    for k, v in config_data.items()
                    if k not in ("b_id", "user_uuid")
                }
                if update_data:
                    logger.info(
                        "Config exists, updating",
                        b_id=b_id,
                        user_uuid=user_uuid,
                    )
                    self.db_helper.update_item(key_dict=key, update_dict=update_data)
                else:
                    logger.info(
                        "No updatable fields",
                        b_id=b_id,
                        user_uuid=user_uuid,
                    )
                return {"action": "updated", "b_id": b_id, "user_uuid": user_uuid}
            else:
                # Create new record
                logger.info(
                    "Config doesn't exist, creating",
                    b_id=b_id,
                    user_uuid=user_uuid,
                )
                self.db_helper._table_instance.put_item(Item=config_data)
                return {"action": "created", "b_id": b_id, "user_uuid": user_uuid}

        except ClientError as e:
            logger.error(
                "DynamoDB error during upsert",
                b_id=b_id,
                user_uuid=user_uuid,
                error=e.response["Error"]["Message"],
                severity="critical",
            )
            raise

    def remove_config_attributes(
        self, b_id: str, attributes: list, user_uuid: str = "_"
    ) -> None:
        if not attributes:
            return
        key = {"b_id": b_id, "user_uuid": user_uuid}
        remove_expr = "REMOVE " + ", ".join(f"#{a}" for a in attributes)
        attr_names = {f"#{a}": a for a in attributes}
        try:
            self.db_helper._table_instance.update_item(
                Key=key,
                UpdateExpression=remove_expr,
                ExpressionAttributeNames=attr_names,
            )
            logger.info(
                "Config attributes removed",
                b_id=b_id,
                user_uuid=user_uuid,
                attributes=attributes,
                severity="medium",
            )
        except Exception as e:
            logger.error(
                "Error removing config attributes",
                b_id=b_id,
                user_uuid=user_uuid,
                attributes=attributes,
                error=str(e),
                severity="critical",
            )
            raise

    def delete_config(self, b_id: str, user_uuid: str = "_") -> Dict[str, Any]:
        key = {"b_id": b_id, "user_uuid": user_uuid}

        try:
            response = self.db_helper._table_instance.delete_item(Key=key)
            logger.info("Config deleted successfully", b_id=b_id, user_uuid=user_uuid, severity="medium")
            return response
        except ClientError as e:
            logger.error(
                "Error deleting config",
                b_id=b_id,
                user_uuid=user_uuid,
                error=e.response["Error"]["Message"],
                severity="critical",
            )
            raise

    def check_audio_full_enabled(
        self, b_id: str, user_uuid: Optional[str] = None
    ) -> bool:
        try:
            config = self.get_config(b_id, user_uuid)
            if config:
                return config.get("audio_full", False)
            return False
        except Exception as e:
            logger.error(
                "Error checking audio_full setting",
                b_id=b_id,
                user_uuid=user_uuid,
                error=str(e),
                severity="medium",
            )
            return False

    def check_audio_api_enabled(
        self, b_id: str, user_uuid: Optional[str] = None
    ) -> bool:
        try:
            config = self.get_config(b_id, user_uuid)
            if config:
                return config.get("audio_api_enabled", False)
            return False
        except Exception as e:
            logger.error(
                "Error checking audio_api_enabled setting",
                b_id=b_id,
                user_uuid=user_uuid,
                error=str(e),
                severity="medium",
            )
            return False

    def get_audio_url_expiry_hours(
        self, b_id: str, user_uuid: Optional[str] = None
    ) -> int:
        default_hours = 24
        try:
            config = self.get_config(b_id, user_uuid) or {}
            hours = int(config.get("audio_url_expiry_hours", default_hours))
            return max(1, min(hours, 168))
        except Exception as e:
            logger.error(
                "Error reading audio_url_expiry_hours setting",
                b_id=b_id,
                user_uuid=user_uuid,
                error=str(e),
                severity="medium",
            )
            return default_hours

    def get_special_templates(self, b_id: str, user_uuid: Optional[str] = None) -> list:
        try:
            merged_config = self.get_merged_config(b_id, user_uuid)
            return merged_config.get("special_templates", [])
        except Exception as e:
            logger.error(
                "Error fetching special templates",
                b_id=b_id,
                user_uuid=user_uuid,
                error=str(e),
                severity="medium",
            )
            return []

    def get_my_templates(self, b_id: str, user_uuid: Optional[str] = None) -> list:
        try:
            templates = []

            # Get workspace templates
            workspace_config = self.get_workspace_config(b_id)
            if workspace_config:
                templates.extend(workspace_config.get("my_templates", []))

            # Get user templates
            if user_uuid and user_uuid != "_":
                user_config = self.get_user_config(b_id, user_uuid)
                if user_config:
                    templates.extend(user_config.get("my_templates", []))

            # return unique, non-archived template IDs
            return self._drop_archived_templates(list(set(templates)))
        except Exception as e:
            logger.error(
                "Error fetching my_templates",
                b_id=b_id,
                user_uuid=user_uuid,
                error=str(e),
                severity="medium",
            )
            return []

    def _drop_archived_templates(self, template_ids: list) -> list:
        if not template_ids:
            return []

        try:
            template_db = DynamoHelper(TEMPLATE_TABLE_NAME)
            archived_ids = set()
            batch_size = 100
            for i in range(0, len(template_ids), batch_size):
                batch = template_ids[i : i + batch_size]
                for item in template_db.query_multiple_items_batch(ids=batch, key_name="id"):
                    if item.get("archived"):
                        archived_ids.add(item.get("id"))
            return [t for t in template_ids if t not in archived_ids]
        except Exception as e:
            # Fail open: an archived-lookup failure should not hide valid templates
            logger.warning(
                "Error filtering archived templates, returning unfiltered list",
                error=str(e),
                severity="medium",
            )
            return template_ids
