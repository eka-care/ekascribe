"""Transaction repository."""

import os
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, time, timedelta
from decimal import Decimal
from scribe.core.custom_logger import get_logger
from scribe.schemas.transaction import TransactionUpdateData
from scribe.core.choices import VOICE2RX_PROCESSING_STATUS
from scribe.repositories.base_orm import BaseORM

logger = get_logger(__name__)


def convert_decimals(obj):
    """Convert Decimal objects to float for JSON serialization."""
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj


class TransactionORM(BaseORM):
    """ORM for transaction-related database operations."""

    def __init__(self):
        """Initialize transaction ORM."""
        table_name = os.getenv("TABLE_NAME", "voice2rx_transactions")
        super().__init__(table_name=table_name)
        self.index_name = "b_id-created_at-index"
        self.uuid_index_name = "uuid-created_at-index"
        self.patient_oid_index_name = "patient_oid-created_at-index"

    @staticmethod
    def _is_archived(item: Optional[Dict[str, Any]]) -> bool:
        if not item:
            return False
        arc_value = item.get("arc")
        if isinstance(arc_value, str):
            return arc_value.lower() == "true"
        return bool(arc_value)

    @staticmethod
    def _non_archived_filter_expression() -> str:
        return "(attribute_not_exists(arc) OR arc = :arc_false)"

    def get_transaction(self, txn_id: str, b_id: str) -> Optional[Dict[str, Any]]:
        """
        Get transaction by ID and business ID.

        Args:
            txn_id: Transaction ID
            b_id: Business ID

        Returns:
            Transaction dict or None
        """
        try:
            item = self.get(key={"txn_id": txn_id, "b_id": b_id})
            if item and not self._is_archived(item):
                return convert_decimals(item)
            return None
        except Exception as e:
            logger.error(
                "Failed to get transaction",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def create_transaction(self, transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new transaction.

        Args:
            transaction_data: Transaction data

        Returns:
            Created transaction data
        """
        try:
            txn_id = transaction_data["txn_id"]
            b_id = transaction_data["b_id"]

            result = self.insert_if_not_exists(
                item=transaction_data,
                partition_key="txn_id",
                partition_value=txn_id,
                sort_key="b_id",
                sort_value=b_id,
            )

            if not result.get("success"):
                return {
                    "error": result.get("error", "Failed to create transaction"),
                    "code": result.get("code", "unknown_error"),
                }
            return {"success": True, "data": transaction_data}

        except Exception as e:
            logger.error(
                "Failed to create transaction",
                txn_id=transaction_data.get("txn_id"),
                b_id=transaction_data.get("b_id"),
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return {"error": str(e)}

    def update_transaction(
        self, txn_id: str, b_id: str, update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update an existing transaction.

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            update_data: Fields to update

        Returns:
            Updated transaction data
        """
        try:
            key = {"txn_id": txn_id, "b_id": b_id}
            # check if transaction exists
            existing = self.get(key)
            if not existing:
                return {"error": "Transaction not found"}

            try:
                update_data_model = TransactionUpdateData.model_validate(update_data)
                update_data = update_data_model.model_dump(exclude_unset=True)
            except Exception as e:
                logger.error(
                    "Error validating update data",
                    txn_id=txn_id,
                    b_id=b_id,
                    error=str(e),
                    exc_info=True,
                    severity="medium",
                )
                return {"error": str(e)}

            updated_item = self.update(key=key, update_data=update_data)
            return {"success": True, "data": convert_decimals(updated_item)}

        except Exception as e:
            logger.error(
                "Failed to update transaction",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return {"error": str(e)}

    def query_transactions_by_business_id(
        self,
        b_id: str,
        uuid: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Query transactions by business ID.

        Args:
            b_id: Business ID
            uuid: Optional user UUID filter
            limit: Optional result limit

        Returns:
            List of transactions
        """
        try:
            where = [
                ("b_id", "eq", b_id),
                ("or", [("arc", "not_exists", None), ("arc", "eq", False)]),
            ]
            if uuid:
                where.append(("uuid", "eq", uuid))
            return self.table.find(
                where, order_by="created_at", desc=True, limit=limit
            )

        except Exception as e:
            logger.error(
                "Failed to query transactions by business ID",
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def count_today_transactions(self, b_id: str) -> int:
        """
        Count successful transactions for a business ID today.

        Args:
            b_id: Business ID

        Returns:
            Count of transactions
        """
        try:
            # Get current date in system's local timezone
            now_local = datetime.now()
            today = now_local.date()

            # Create timezone-aware local day boundaries
            start_of_day_local = datetime.combine(today, time.min).replace(
                tzinfo=now_local.tzinfo
            )
            end_of_day_local = datetime.combine(
                today + timedelta(days=1), time.min
            ).replace(tzinfo=now_local.tzinfo)

            # Convert to UTC for the range query
            start_of_day_utc = start_of_day_local.astimezone(timezone.utc)
            end_of_day_utc = end_of_day_local.astimezone(timezone.utc)

            # Format timestamps
            start_timestamp = start_of_day_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            end_timestamp = end_of_day_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

            return self.table.count(
                [
                    ("b_id", "eq", b_id),
                    ("created_at", "between", (start_timestamp, end_timestamp)),
                    ("processing_status", "eq", VOICE2RX_PROCESSING_STATUS.SUCCESS.value),
                ]
            )

        except Exception as e:
            logger.error(
                "Unexpected error counting today's transactions",
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return 0

    def get_transactions(
        self, uuid: str, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        try:
            # all transactions except cancelled and archived ones, newest first
            items = self.table.find(
                [
                    ("uuid", "eq", uuid),
                    ("or", [("arc", "not_exists", None), ("arc", "eq", False)]),
                    ("or", [
                        ("processing_status", "not_exists", None),
                        ("processing_status", "ne", VOICE2RX_PROCESSING_STATUS.CANCELLED.value),
                    ]),
                ],
                order_by="created_at",
                desc=True,
                limit=limit,
            )
            return items

        except Exception as e:
            logger.error(
                "Failed to get transactions",
                uuid=uuid,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise


    def get_patient_sessions(
        self, b_id: str, oid: str, uuid: Optional[str] = None, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get recent sessions for a patient (indexed on oid + created_at).

        Args:
            b_id: Business ID (from JWT)
            oid: Patient OID
            uuid: Optional user UUID to filter sessions
            limit: Max number of sessions to return (default 10)

        Returns:
            List of full transaction dicts sorted by created_at descending
        """
        try:
            items = self.table.find(
                [("patient_oid", "eq", oid), ("b_id", "eq", b_id)],
                order_by="created_at",
                desc=True,
            )
            results = []
            for full_item in items:
                if self._is_archived(full_item):
                    continue
                if uuid and full_item.get("uuid") != uuid:
                    continue
                results.append(convert_decimals(full_item))
                if len(results) >= limit:
                    break
            return results

        except Exception as e:
            logger.error(
                "Failed to get patient sessions",
                b_id=b_id,
                oid=oid,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise
