from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from botocore.exceptions import ClientError

from logs.custom_logger import get_logger
from voice2rx.model_orms.base_orm import BaseORM

logger = get_logger(__name__)

TABLE_NAME = "ekascribe_document_tiptap"


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class DocumentTiptapORM(BaseORM):
    def __init__(
        self,
        table_name: str = TABLE_NAME,
    ):
        super().__init__(
            table_name=table_name,
        )

    def upsert_tiptap_json(
        self,
        document_id: str,
        tiptap_json: str | Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Upsert a tiptap JSON entry (stored as a JSON string).
        """
        if not isinstance(tiptap_json, (str, dict)):
            raise ValueError("tiptap_json must be a JSON string or dict")
        now = _now_iso()
        item = {
            "document_id": document_id,
            "tiptap_json": tiptap_json,
        }

        try:
            existing_item = self.get({"document_id": document_id})
            if existing_item:
                item.pop("document_id")
                self.update(
                    key={"document_id": document_id},
                    update_data=item,
                )

                return item
            else:
                item["created_at"] = now
                return self.insert_if_not_exists(
                    partition_key="document_id",
                    partition_value=document_id, 
                    item=item
                )

        except ClientError as ce:
            logger.exception(
                "upsert_tiptap_json failed for document_id=%s",
                document_id,
                severity="critical",
            )
            raise
        except Exception as e:
            logger.exception(
                "Unexpected error in upsert_tiptap_json for document_id=%s",
                document_id,
                severity="critical",
            )
            raise

    def get_tiptap_json(
        self,
        document_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get tiptap JSON by document_id.
        """
        try:
            return self.get(
                {"document_id": document_id}
            )

        except ClientError:
            logger.exception(
                "get_tiptap_json failed for document_id=%s",
                document_id,
                severity="medium",
            )
            raise

    def upsert_agui_state(
        self,
        document_id: str,
        agui_state: str | Dict[str, Any],
    ) -> Dict[str, Any]:
        if not isinstance(agui_state, (str, dict)):
            raise ValueError("agui_state must be a JSON string or dict")
        now = _now_iso()

        try:
            existing_item = self.get({"document_id": document_id})
            if existing_item:
                self.update(
                    key={"document_id": document_id},
                    update_data={"agui_state": agui_state},
                )
                return {"agui_state": agui_state}

            item = {
                "document_id": document_id,
                "agui_state": agui_state,
                "created_at": now,
            }
            return self.insert_if_not_exists(
                partition_key="document_id",
                partition_value=document_id,
                item=item,
            )

        except ClientError:
            logger.exception(
                "upsert_agui_state failed for document_id=%s",
                document_id,
                severity="critical",
            )
            raise
        except Exception:
            logger.exception(
                "Unexpected error in upsert_agui_state for document_id=%s",
                document_id,
                severity="critical",
            )
            raise

    def get_record(
        self,
        document_id: str,
    ) -> Optional[Dict[str, Any]]:
        try:
            return self.get({"document_id": document_id})

        except ClientError:
            logger.exception(
                "get_record failed for document_id=%s",
                document_id,
                severity="medium",
            )
            raise
