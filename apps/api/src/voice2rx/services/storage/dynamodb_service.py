from typing import Optional, Dict, Any  # Added Dict, Any
from botocore.exceptions import ClientError

from voice2rx.choices import VOICE2RX_PROCESSING_STATUS

from datetime import datetime, time, timezone, timedelta
from boto3.dynamodb.conditions import Key


class DynamoDBOperations:
    def __init__(self, table_name, index_name: str = ""):
        self.table_name = table_name
        from scribe_core.db import get_dynamo_client

        self.dynamodb_client = get_dynamo_client()
        self.index_name = index_name

    # Helper method to deserialize DynamoDB items
    def deserialize_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        deserialized = {}
        for key, value_dict in item.items():
            if "S" in value_dict:
                deserialized[key] = value_dict["S"]
            elif "N" in value_dict:
                num_str = value_dict["N"]
                if '.' in num_str:
                    deserialized[key] = float(num_str)
                else:
                    deserialized[key] = int(num_str)
            elif "BOOL" in value_dict:
                deserialized[key] = value_dict["BOOL"]
            elif "NULL" in value_dict:
                deserialized[key] = None
            elif "L" in value_dict:
                deserialized_list = []
                for element in value_dict["L"]:
                    if "S" in element:
                        deserialized_list.append(element["S"])
                    elif "N" in element:
                        el_num_str = element["N"]
                        if '.' in el_num_str:
                            deserialized_list.append(float(el_num_str))
                        else:
                            deserialized_list.append(int(el_num_str))
                    elif "M" in element:
                        deserialized_list.append(self.deserialize_item(element["M"])) # Changed to self.deserialize_item
                    else:
                        deserialized_list.append(element)
                deserialized[key] = deserialized_list
            elif "M" in value_dict:
                deserialized[key] = self.deserialize_item(value_dict["M"]) # Changed to self.deserialize_item
        return deserialized

    def convert_to_dynamodb_type(self, value):
            """Recursively convert Python data to DynamoDB format."""
            if value is None:
                return {'NULL': True}
            elif isinstance(value, str):
                return {"S": value}
            elif isinstance(value, bool):
                return {"BOOL": value}
            elif isinstance(value, (int, float)):
                return {"N": str(value)}
            elif isinstance(value, list):
                return {"L": [self.convert_to_dynamodb_type(v) for v in value]}
            elif isinstance(value, dict):
                return {"M": {k: self.convert_to_dynamodb_type(v) for k, v in value.items()}}
            else:
                raise TypeError(f"Unsupported type: {type(value)}")

    def insert_item_if_not_exists(self, item, partition_key, partition_value, sort_key=None, sort_value=None):
        """
            Inserts an item into DynamoDB only if the partition key (and optionally sort key) does not already exist.

            :param item: Dictionary representing the item to insert
            :param partition_key: Name of the partition key attribute
            :param partition_value: Value of the partition key
            :param sort_key: (Optional) Name of the sort key attribute
            :param sort_value: (Optional) Value of the sort key
            :return: Dictionary indicating success or failure
        """
        try:
            print("Inserting item into DynamoDB:", (item, partition_key, partition_value, sort_key, sort_value))
            formatted_item = {k: self.convert_to_dynamodb_type(v) for k, v in item.items()}

            # Build ConditionExpression dynamically
            condition_expression = f"attribute_not_exists({partition_key})"
            expression_attribute_values = {f":pkval": self.convert_to_dynamodb_type(partition_value)}

            if sort_key and sort_value:
                condition_expression += f" AND attribute_not_exists({sort_key})"
                expression_attribute_values[f":skval"] = self.convert_to_dynamodb_type(sort_value)

            response = self.dynamodb_client.put_item(
                TableName=self.table_name,
                Item=formatted_item,
                ConditionExpression=condition_expression,  # Prevent duplicate keys
            )

            return {"message": "Item added successfully", "response": response}

        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return {"error": "Entry already exists!"}

            return {"error": str(e)}
        except Exception as e:
            return {"error": str(e)}

    def create_item(self, item):
        """Insert an item into DynamoDB"""
        try:
            response = dynamodb_client.put_item(
                TableName=self.table_name, Item={k: {"S": str(v)} for k, v in item.items()}
            )
            return {"message": "Item added successfully", "response": response}
        except ClientError as e:
            return {"error": str(e)}

    def get_item(self, key):
        """Retrieve an item from DynamoDB"""
        try:
            response = dynamodb_client.get_item(
                TableName=self.table_name, Key={k: {"S": str(v)} for k, v in key.items()}
            )
            return response
        except ClientError as e:
            return {"error": str(e)}

    def update_item(self, key, update_data):
        """Update an item in DynamoDB, handling multiple data types correctly"""
        try:
            expression_attribute_values = {}
            expression_attribute_names = {}
            update_expressions = []
            
            # Create safe attribute names and expressions
            for i, (field_name, field_value) in enumerate(update_data.items()):
                # Create safe alias for attribute names (using index to avoid conflicts)
                safe_name_alias = f"attr{i}"
                safe_value_alias = f"val{i}"
                
                # Add to expression attribute names and values
                expression_attribute_names[f"#{safe_name_alias}"] = field_name
                expression_attribute_values[f":{safe_value_alias}"] = self.convert_to_dynamodb_type(field_value)
                
                # Add to update expression
                update_expressions.append(f"#{safe_name_alias} = :{safe_value_alias}")

            update_expression = "SET " + ", ".join(update_expressions)
            formatted_key = {f"{k}": self.convert_to_dynamodb_type(v) for k, v in key.items()}

            response = self.dynamodb_client.update_item(
                TableName=self.table_name,
                Key=formatted_key,
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_attribute_names,
                ExpressionAttributeValues=expression_attribute_values,
                ReturnValues="ALL_NEW"
            )
            return {"message": "Item updated successfully", "response": response}
        except ClientError as e:
            return {"error": str(e), "response": {}}

    def query_items_by_b_id(self, b_id: str, uuid: str = None, limit: Optional[int] = None):
        """
        Query items from DynamoDB by b_id using a GSI, ordered by creation_date (descending).
        Optionally filters by uuid after the query.
        Handles pagination if limit is not provided.
        Returns deserialized items list on success, or an error dictionary on failure.
        """
        try:
            query_params = {
                "TableName": self.table_name,
                "IndexName": self.index_name,
                "KeyConditionExpression": "b_id = :bid_val",
                "ExpressionAttributeValues": {
                    ":bid_val": {"S": b_id}
                },
                "ScanIndexForward": False,  # False for descending order (latest first)
                "ProjectionExpression": "txn_id, created_at, b_id, arc, #mode, client, processing_status, #uuid, oid, user_status, patient_details, flavour, version",
                "ExpressionAttributeNames": {
                    "#mode": "mode",
                    "#uuid": "uuid"
                }
            }
            
            if uuid:
                query_params["FilterExpression"] = "#uuid = :uuid_val"
                query_params["ExpressionAttributeValues"][":uuid_val"] = {"S": uuid}

            all_raw_items = []
            if limit is not None:
                query_params["Limit"] = limit
                response = self.dynamodb_client.query(**query_params) # Can raise ClientError
                all_raw_items.extend(response.get("Items", []))
            else:
                last_evaluated_key = None
                while True:
                    if last_evaluated_key:
                        query_params["ExclusiveStartKey"] = last_evaluated_key
                    
                    response = self.dynamodb_client.query(**query_params) # Can raise ClientError
                    all_raw_items.extend(response.get("Items", []))
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
            
            if not all_raw_items:
                return [] # Success, no items

            # Deserialization
            try:
                deserialized_items = [self.deserialize_item(item) for item in all_raw_items]
                return deserialized_items # Success with items
            except Exception as e_deserialize:
                print(f"Error deserializing items in query_items_by_b_id: {e_deserialize}")
                return {"error": f"Failed to process query results: {str(e_deserialize)}", "is_error": True}

        except ClientError as e_client:
            error_code = e_client.response.get("Error", {}).get("Code", "DynamoDBError")
            error_message = e_client.response.get("Error", {}).get("Message", "An error occurred with DynamoDB.")
            print(f"DynamoDB ClientError in query_items_by_b_id: {e_client}") # Log in service
            return {"error": f"Database query failed: {error_code} - {error_message}", "is_error": True}
        except Exception as e_general:
            # This catches other errors during query_params setup or unexpected issues
            print(f"An unexpected error occurred during query operation in query_items_by_b_id: {e_general}")
            return {"error": f"An unexpected server error occurred during data retrieval: {str(e_general)}", "is_error": True}
    
    def get_count_by_b_id_today(self, b_id):
        """
        Get count of transactions for a b_id for today (local timezone)
        """
        try:
            # Get current date in system's local timezone
            now_local = datetime.now()
            today = now_local.date()
            
            # Create timezone-aware local day boundaries
            start_of_day_local = datetime.combine(today, time.min).replace(tzinfo=now_local.tzinfo)
            end_of_day_local = datetime.combine(today + timedelta(days=1), time.min).replace(tzinfo=now_local.tzinfo)
            
            # Convert to UTC for DynamoDB query
            start_of_day_utc = start_of_day_local.astimezone(timezone.utc)
            end_of_day_utc = end_of_day_local.astimezone(timezone.utc)
            
            # Format timestamps for DynamoDB
            start_timestamp = start_of_day_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            end_timestamp = end_of_day_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            
            response = self.dynamodb_client.query(
                TableName=self.table_name,
                IndexName=self.index_name,
                KeyConditionExpression='b_id = :bid AND created_at BETWEEN :start AND :end',
                FilterExpression='processing_status = :processing_status',  
                ExpressionAttributeValues={
                    ':bid': {'S': b_id},
                    ':start': {'S': start_timestamp},
                    ':end': {'S': end_timestamp},
                    ':processing_status': {'S': VOICE2RX_PROCESSING_STATUS.SUCCESS.value}
                },
                Select='COUNT'
            )
            
            return response['Count']
            
        except ClientError as e_client:
            error_code = e_client.response.get("Error", {}).get("Code", "DynamoDBError")
            error_message = e_client.response.get("Error", {}).get("Message", "An error occurred with DynamoDB.")
            print(f"DynamoDB ClientError in get_count_by_b_id_today: {e_client}")
            return {"error": f"Database query failed: {error_code} - {error_message}", "is_error": True}
        except Exception as e:
            print(f"An unexpected error occurred in get_count_by_b_id_today: {e}")
            return {"is_error": True, "error": str(e)}