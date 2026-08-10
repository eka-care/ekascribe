"""Async facade over the Postgres document engine (asyncio.to_thread)."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from scribe_core.db.pg_engine import ConditionalCheckFailed, get_table


class AsyncDocStore:
    """Async document-store API used by async services."""

    async def create_item(self, table_name: str, item: Dict[str, Any]) -> bool:
        try:
            await asyncio.to_thread(get_table(table_name).put_item, item)
            return True
        except Exception:
            return False

    async def get_item(self, table_name: str, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(get_table(table_name).get_item, key)

    async def update_item(
        self, table_name: str, key: Dict[str, Any], updates: Dict[str, Any], **kwargs: Any
    ) -> bool:
        try:
            await asyncio.to_thread(
                lambda: get_table(table_name).update_item(key, updates)
            )
            return True
        except ConditionalCheckFailed:
            return False
        except Exception:
            return False

    async def find(
        self,
        table_name: str,
        where=None,
        *,
        order_by: Optional[str] = None,
        desc: bool = False,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(
            lambda: get_table(table_name).find(
                where, order_by=order_by, desc=desc, limit=limit
            )
        )


_store: Optional[AsyncDocStore] = None
def get_async_store() -> AsyncDocStore:
    global _store
    if _store is None:
        _store = AsyncDocStore()
    return _store
