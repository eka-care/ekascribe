"""
Base ORM class with common DynamoDB operations.
"""
from abc import ABC
from decimal import Decimal
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)


class BaseORM(ABC):
    """
    Base ORM with common DynamoDB operations.
    All ORMs should inherit from this class.
    """

    def __init__(self, table_name: str, region: str = "ap-south-1"):
        """
        Initialize base ORM.

        Args:
            table_name: Name of the DynamoDB table
            region: AWS region name
        """
        self.table_name = table_name
        self.region = region
        # Backend-selected (DB_BACKEND=postgres|dynamodb) — plan B2, Phase 2.
        from scribe_core.db import get_dynamo_client, get_dynamo_resource

        self.dynamodb_client = get_dynamo_client()
        self.dynamodb_resource = get_dynamo_resource()
        self.table = self.dynamodb_resource.Table(table_name)

    def _serialize_value(self, value: Any) -> Dict[str, Any]:
        """
        Convert Python value to DynamoDB format.

        Args:
            value: Python value to convert

        Returns:
            Dict in DynamoDB format
        """
        if value is None:
            return {"NULL": True}
        elif isinstance(value, str):
            return {"S": value}
        elif isinstance(value, bool):
            return {"BOOL": value}
        elif isinstance(value, (int, float, Decimal)):
            return {"N": str(value)}
        elif isinstance(value, list):
            return {"L": [self._serialize_value(v) for v in value]}
        elif isinstance(value, dict):
            return {"M": {k: self._serialize_value(v) for k, v in value.items()}}
        else:
            raise TypeError(f"Unsupported type: {type(value)}")

    def _deserialize_value(self, dynamo_value: Dict[str, Any]) -> Any:
        """
        Convert DynamoDB format to Python value.

        Args:
            dynamo_value: DynamoDB formatted value

        Returns:
            Python value
        """
        if "S" in dynamo_value:
            return dynamo_value["S"]
        elif "N" in dynamo_value:
            num_str = dynamo_value["N"]
            return float(num_str) if "." in num_str else int(num_str)
        elif "BOOL" in dynamo_value:
            return dynamo_value["BOOL"]
        elif "NULL" in dynamo_value:
            return None
        elif "L" in dynamo_value:
            return [self._deserialize_value(item) for item in dynamo_value["L"]]
        elif "M" in dynamo_value:
            return {k: self._deserialize_value(v) for k, v in dynamo_value["M"].items()}
        return None

    def _deserialize_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deserialize a complete DynamoDB item.

        Args:
            item: DynamoDB item

        Returns:
            Python dict
        """
        return {key: self._deserialize_value(value) for key, value in item.items()}

    def get(self, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Get a single item by primary key.

        Args:
            key: Primary key(s) as dict

        Returns:
            Item dict or None if not found
        """
        try:
            response = self.table.get_item(Key=key)
            return response.get("Item")
        except ClientError as e:
            logger.error(
                f"Error getting item from {self.table_name}",
                error=str(e),
                key=key,
                severity="medium",
            )
            raise

    def create(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new item.

        Args:
            item: Item data

        Returns:
            Created item
        """
        try:
            self.table.put_item(Item=item)
            return item
        except ClientError as e:
            logger.error(
                f"Error creating item in {self.table_name}",
                error=str(e),
                item=item,
                severity="critical",
            )
            raise

    def update(self, key: Dict[str, Any], update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing item.

        Args:
            key: Primary key(s)
            update_data: Fields to update

        Returns:
            Updated item
        """
        try:
            # Build update expression
            update_expression_parts = []
            expression_attribute_names = {}
            expression_attribute_values = {}

            for i, (field_name, field_value) in enumerate(update_data.items()):
                safe_name = f"attr{i}"
                safe_value = f"val{i}"
                expression_attribute_names[f"#{safe_name}"] = field_name
                expression_attribute_values[f":{safe_value}"] = field_value
                update_expression_parts.append(f"#{safe_name} = :{safe_value}")

            # Add updated_at timestamp
            expression_attribute_names["#updated_at"] = "updated_at"
            expression_attribute_values[":updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            update_expression_parts.append("#updated_at = :updated_at")

            update_expression = "SET " + ", ".join(update_expression_parts)

            response = self.table.update_item(
                Key=key,
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_attribute_names,
                ExpressionAttributeValues=expression_attribute_values,
                ReturnValues="ALL_NEW",
            )

            return response.get("Attributes", {})
        except ClientError as e:
            logger.error(
                f"Error updating item in {self.table_name}",
                error=str(e),
                key=key,
                severity="critical",
            )
            raise

    def delete(self, key: Dict[str, Any]) -> bool:
        """
        Delete an item.

        Args:
            key: Primary key(s)

        Returns:
            True if deleted, False if not found
        """
        try:
            response = self.table.delete_item(Key=key, ReturnValues="ALL_OLD")
            return "Attributes" in response
        except ClientError as e:
            logger.error(
                f"Error deleting item from {self.table_name}",
                error=str(e),
                key=key,
                severity="critical",
            )
            raise

    def insert_if_not_exists(
        self,
        item: Dict[str, Any],
        partition_key: str,
        partition_value: Any,
        sort_key: Optional[str] = None,
        sort_value: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Insert item only if it doesn't already exist.

        Args:
            item: Item to insert
            partition_key: Partition key attribute name
            partition_value: Partition key value
            sort_key: Optional sort key attribute name
            sort_value: Optional sort key value

        Returns:
            Dict with success/error information

        Raises:
            ClientError: If item already exists or other database error
        """
        try:
            formatted_item = {k: self._serialize_value(v) for k, v in item.items()}

            # Build condition expression
            condition_expression = f"attribute_not_exists({partition_key})"
            if sort_key and sort_value:
                condition_expression += f" AND attribute_not_exists({sort_key})"

            self.dynamodb_client.put_item(
                TableName=self.table_name,
                Item=formatted_item,
                ConditionExpression=condition_expression,
            )

            return {"success": True, "message": "Item added successfully"}

        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return {"success": False, "error": "Entry already exists!", "code" :"duplicate_entry"}
            raise

