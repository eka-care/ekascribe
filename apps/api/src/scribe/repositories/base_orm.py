"""Base repository with common document-store operations."""

from abc import ABC
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from scribe_core.db import ConditionalCheckFailed, get_table

from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)


class BaseORM(ABC):
    """Base repository over the Postgres document engine.

    Subclasses read/write plain dict items; keys and indexed fields are
    mirrored to real columns per scribe_core.db.spec.
    """

    def __init__(self, table_name: str):
        self.table_name = table_name
        self.table = get_table(table_name)

    def get(self, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            return self.table.get_item(key)
        except Exception as e:
            logger.error(
                f"Error getting item from {self.table_name}",
                error=str(e), key=key, severity="medium",
            )
            raise

    def create(self, item: Dict[str, Any]) -> Dict[str, Any]:
        try:
            self.table.put_item(item)
            return item
        except Exception as e:
            logger.error(
                f"Error creating item in {self.table_name}",
                error=str(e), item=item, severity="critical",
            )
            raise

    def update(self, key: Dict[str, Any], update_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            updates = dict(update_data)
            updates["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            return self.table.update_item(key, updates)
        except Exception as e:
            logger.error(
                f"Error updating item in {self.table_name}",
                error=str(e), key=key, severity="critical",
            )
            raise

    def delete(self, key: Dict[str, Any]) -> bool:
        try:
            return self.table.delete_item(key)
        except Exception as e:
            logger.error(
                f"Error deleting item from {self.table_name}",
                error=str(e), key=key, severity="critical",
            )
            raise

    def insert_if_not_exists(self, item: Dict[str, Any], *args: Any, **kwargs: Any) -> Dict[str, Any]:
        """Insert only when the primary key is free (extra legacy args ignored —
        the spec knows the key columns)."""
        try:
            self.table.put_item(item, if_not_exists=True)
            return {"success": True, "message": "Item added successfully"}
        except ConditionalCheckFailed:
            return {"success": False, "error": "Entry already exists!", "code": "duplicate_entry"}
