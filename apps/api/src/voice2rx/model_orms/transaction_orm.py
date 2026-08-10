"""
Transaction ORM for DynamoDB operations.
"""

import os
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, time, timedelta
from decimal import Decimal
from botocore.exceptions import ClientError
from logs.custom_logger import get_logger
from voice2rx.api.schemas.transaction import TransactionUpdateData
from voice2rx.choices import VOICE2RX_PROCESSING_STATUS
from voice2rx.model_orms.base_orm import BaseORM

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
            query_params = {
                "IndexName": self.index_name,
                "KeyConditionExpression": "b_id = :bid_val",
                "ExpressionAttributeValues": {":bid_val": {"S": b_id}},
                "ScanIndexForward": False,  # Descending order
                "ProjectionExpression": (
                    "txn_id, created_at, b_id, arc, #mode, client, "
                    "processing_status, #uuid, oid, user_status, "
                    "session_details, flavour, version"
                ),
                "ExpressionAttributeNames": {"#mode": "mode", "#uuid": "uuid"},
            }

            if uuid:
                query_params["FilterExpression"] = (
                    "#uuid = :uuid_val AND "
                    f"{self._non_archived_filter_expression()}"
                )
                query_params["ExpressionAttributeValues"][":uuid_val"] = {"S": uuid}
            else:
                query_params["FilterExpression"] = self._non_archived_filter_expression()

            query_params["ExpressionAttributeValues"][":arc_false"] = {"BOOL": False}

            if limit:
                query_params["Limit"] = limit

            all_items = []
            last_evaluated_key = None

            while True:
                if last_evaluated_key:
                    query_params["ExclusiveStartKey"] = last_evaluated_key

                response = self.dynamodb_client.query(
                    TableName=self.table_name, **query_params
                )
                all_items.extend(response.get("Items", []))
                last_evaluated_key = response.get("LastEvaluatedKey")

                if not last_evaluated_key or limit:
                    break

            # Deserialize items
            deserialized_items = [self._deserialize_item(item) for item in all_items]
            return deserialized_items

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

            # Convert to UTC for DynamoDB query
            start_of_day_utc = start_of_day_local.astimezone(timezone.utc)
            end_of_day_utc = end_of_day_local.astimezone(timezone.utc)

            # Format timestamps for DynamoDB
            start_timestamp = start_of_day_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            end_timestamp = end_of_day_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

            response = self.dynamodb_client.query(
                TableName=self.table_name,
                IndexName=self.index_name,
                KeyConditionExpression="b_id = :bid AND created_at BETWEEN :start AND :end",
                FilterExpression="processing_status = :processing_status",
                ExpressionAttributeValues={
                    ":bid": {"S": b_id},
                    ":start": {"S": start_timestamp},
                    ":end": {"S": end_timestamp},
                    ":processing_status": {
                        "S": VOICE2RX_PROCESSING_STATUS.SUCCESS.value
                    },
                },
                Select="COUNT",
            )

            return response.get("Count", 0)

        except ClientError as e:
            logger.error(
                "Failed to count today's transactions",
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return 0
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
            projection = (
                "arc, #mode, b_id, processing_status, flavour, oid, model_type, "
                "user_status, session_details, txn_id, created_at"
            )
            expression_attr_names = {"#mode": "mode", "#uuid": "uuid"}

            # fetch all transactions except cancelled and archived ones.
            items = self._paginate_query(
                key_condition="#uuid = :uuid",
                filter_expression=(
                    f"{self._non_archived_filter_expression()} AND "
                    "(attribute_not_exists(processing_status) OR processing_status <> :cancelled_status)"
                ),
                expression_values={
                    ":uuid": {"S": uuid},
                    ":arc_false": {"BOOL": False},
                    ":cancelled_status": {
                        "S": VOICE2RX_PROCESSING_STATUS.CANCELLED.value
                    },
                },
                expression_attr_names=expression_attr_names,
                projection=projection,
                scan_forward=False,  # newest first
                max_items=limit,
            )

            return [self._deserialize_item(item) for item in items]

        except Exception as e:
            logger.error(
                "Failed to get transactions",
                uuid=uuid,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def _paginate_query(
        self,
        key_condition: str,
        expression_values: Dict,
        expression_attr_names: Dict,
        projection: str,
        scan_forward: bool = False,
        filter_expression: Optional[str] = None,
        max_items: Optional[int] = None,
        index_name: Optional[str] = None,
    ) -> List[Dict]:
        """
        Paginates a DynamoDB query, stopping early once max_items are collected.
        Note: max_items applies to items *after* FilterExpression is applied.
        """
        query_params = {
            "IndexName": index_name or self.uuid_index_name,
            "KeyConditionExpression": key_condition,
            "ExpressionAttributeValues": expression_values,
            "ExpressionAttributeNames": expression_attr_names,
            "ProjectionExpression": projection,
            "ScanIndexForward": scan_forward,
        }

        if filter_expression:
            query_params["FilterExpression"] = filter_expression

        collected = []
        last_evaluated_key = None

        while True:
            if last_evaluated_key:
                query_params["ExclusiveStartKey"] = last_evaluated_key

            if max_items is not None:
                remaining = max_items - len(collected)
                query_params["Limit"] = remaining * 3  # buffer for filtered-out rows

            response = self.dynamodb_client.query(
                TableName=self.table_name, **query_params
            )

            collected.extend(response.get("Items", []))
            last_evaluated_key = response.get("LastEvaluatedKey")

            if not last_evaluated_key:
                break

            if max_items is not None and len(collected) >= max_items:
                break

        return collected[:max_items] if max_items is not None else collected

    def get_patient_sessions(
        self, b_id: str, oid: str, uuid: Optional[str] = None, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get recent sessions for a patient using oid-created_at-index GSI.

        Args:
            b_id: Business ID (from JWT)
            oid: Patient OID
            uuid: Optional user UUID to filter sessions
            limit: Max number of sessions to return (default 10)

        Returns:
            List of full transaction dicts sorted by created_at descending
        """
        try:
            # query patient_oid GSI for table keys, then fetch full items
            query_params = {
                "IndexName": self.patient_oid_index_name,
                "KeyConditionExpression": "patient_oid = :oid_val",
                "ExpressionAttributeValues": {":oid_val": {"S": oid}},
                "ProjectionExpression": "txn_id, b_id",
                "ScanIndexForward": False,
            }

            all_keys = []
            last_evaluated_key = None
            while True:
                if last_evaluated_key:
                    query_params["ExclusiveStartKey"] = last_evaluated_key
                response = self.dynamodb_client.query(
                    TableName=self.table_name, **query_params
                )
                all_keys.extend(response.get("Items", []))
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break

            #FIXME: in-memory filtring is not good idea fix this later,
            # fetch full items from main table and filter
            results = []
            for key_item in all_keys:
                deserialized = self._deserialize_item(key_item)
                if deserialized.get("b_id") != b_id:
                    continue
                full_item = self.get(key={"txn_id": deserialized["txn_id"], "b_id": b_id})
                if not full_item:
                    continue
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
