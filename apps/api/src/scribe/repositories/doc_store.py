"""Postgres document store — the single data-access helper for repositories.

Items are JSONB documents with spec'd key/indexed columns
(scribe_core.db.spec); queries use the engine's native ``where`` conditions.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from scribe_core.db import ConditionalCheckFailed, get_async_store, get_table

from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)

# Convenience re-export: async services use `get_async_store()` directly.
__all__ = ["DocStore", "get_async_store", "ConditionalCheckFailed"]


def _filter_to_where(filter_dict: Optional[Dict[str, Any]]) -> list:
    """dict of equality filters -> native where; supports the {"ne": x} form
    (legacy archived filter) on any field."""
    where: list = []
    for key, value in (filter_dict or {}).items():
        if isinstance(value, dict) and len(value) == 1:
            op, v = next(iter(value.items()))
            where.append((key, "ne" if op == "ne" else "eq", v))
        else:
            where.append((key, "eq", value))
    return where


class DocStore:
    """Synchronous per-table document store."""

    def __init__(self, table_name: str):
        self.table_name = table_name
        self._table = get_table(table_name)

    # -- reads ---------------------------------------------------------------

    def get_item(self, key_dict: dict) -> dict:
        return self._table.get_item(key_dict) or {}

    def get_batch_items(self, keys: List[dict]) -> List[dict]:
        return self._table.batch_get(keys)

    def query_multiple_items_batch(self, ids: list, key_name: str = "id") -> list:
        return self._table.batch_get([{key_name: i} for i in ids])

    def find(self, where=None, **kwargs) -> List[dict]:
        return self._table.find(where, **kwargs)

    def count(self, where=None) -> int:
        return self._table.count(where)

    def scan_table(self) -> list:
        try:
            return self._table.find([])
        except Exception as e:
            logger.error(f"Error scanning table {self.table_name}: {e}")
            return []

    def scan_by_filter(self, filter_dict: dict) -> list:
        try:
            return self._table.find(_filter_to_where(filter_dict))
        except Exception as e:
            logger.error(
                f"Error scanning table {self.table_name} with filter {filter_dict}: {e}"
            )
            return []

    # -- writes --------------------------------------------------------------

    def put(self, item: dict) -> dict:
        self._table.put_item(item)
        return item

    # legacy-name alias for existing call sites
    create_item = put

    def insert_if_not_exists(self, item: dict) -> dict:
        """Insert only when the primary key is free."""
        try:
            self._table.put_item(item, if_not_exists=True)
            return {"success": True, "message": "Item added successfully"}
        except ConditionalCheckFailed:
            return {"success": False, "error": "Entry already exists!", "code": "duplicate_entry"}

    def update_item(
        self,
        key_dict: dict,
        update_dict: dict,
        owner_details: Optional[dict] = None,
    ) -> dict:
        """Merge fields into an EXISTING item (raises ConditionalCheckFailed when
        missing, or when owner_details does not match)."""
        expect = None
        if owner_details:
            expect = {owner_details["owner_key"]: owner_details["owner_id"]}
        return self._table.update_item(
            key_dict, update_dict, require_exists=True, expect=expect
        )

    def upsert_item(self, key_dict: dict, update_dict: dict) -> dict:
        return self._table.update_item(key_dict, update_dict)

    def delete_item(self, key_dict: dict) -> bool:
        return self._table.delete_item(key_dict)

    def remove_fields(self, key_dict: dict, fields: list) -> None:
        self._table.remove_fields(key_dict, fields)
