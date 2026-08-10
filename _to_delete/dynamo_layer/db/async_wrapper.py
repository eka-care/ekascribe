"""Async document-DB wrapper over the shared Postgres engine.

template_service (and friends) call `get_dynamo_client()` from
voice2rx.utils.dynamo_helper and use this exact surface:
create_item / get_item / update_item / query_items — async, snake_case kwargs,
plain (resource-format) items. On DB_BACKEND=postgres this class serves them
from the same engine as the sync shims, via asyncio.to_thread.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from scribe_core.db.pg_engine import _Engine
from scribe_core.db.spec import get_spec


class PgAsyncWrapper:
    def _engine(self, table_name: str) -> _Engine:
        return _Engine(get_spec(table_name))

    async def create_item(self, table_name: str, item: Dict[str, Any]) -> bool:
        try:
            await asyncio.to_thread(self._engine(table_name).put_item, item)
            return True
        except Exception:
            return False

    async def get_item(
        self, table_name: str, key: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(self._engine(table_name).get_item, key)

    async def update_item(
        self,
        table_name: str,
        key: Dict[str, Any],
        update_data: Dict[str, Any] = None,
        **kwargs: Any,
    ) -> bool:
        try:
            updates = update_data or kwargs.get("updates") or {}
            await asyncio.to_thread(self._engine(table_name).update_item, key, updates)
            return True
        except Exception:
            return False

    async def query_items(
        self,
        table_name: str,
        key_condition_expression: str,
        expression_attribute_values: Dict[str, Any],
        expression_attribute_names: Optional[Dict[str, str]] = None,
        filter_expression: Optional[str] = None,
        limit: Optional[int] = None,
        index_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        def _run():
            result = self._engine(table_name).query(
                key_condition=key_condition_expression,
                values=expression_attribute_values,
                names=expression_attribute_names,
                filter_expression=filter_expression,
                limit=limit,
                index_name=index_name,
            )
            return result["Items"]

        return await asyncio.to_thread(_run)

    async def delete_item(self, table_name: str, key: Dict[str, Any]) -> bool:
        try:
            await asyncio.to_thread(self._engine(table_name).delete_item, key)
            return True
        except Exception:
            return False

    async def close(self) -> None:  # parity with aioboto3 wrapper
        return None
