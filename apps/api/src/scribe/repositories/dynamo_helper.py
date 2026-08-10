# DynamoHelper (sync, shim-backed) + get_dynamo_client (async Postgres wrapper).
 
import itertools
import logging
import string
from functools import reduce
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

log = logging.getLogger(__name__)
deserializer = TypeDeserializer()


# TODO: 
# all the methods of this files need to be moved to services/repo and ORMs etc
# and this file should be deleted.

class ExistingProfile(Exception):
    """Custom exception for existing profile"""
    pass


class _LazyBackend:
    """Class-level lazy handle so DynamoHelper.dynamodb resolves per DB_BACKEND."""

    def __init__(self, kind):
        self.kind = kind

    def __get__(self, obj, objtype=None):
        from scribe_core.db import get_dynamo_client, get_dynamo_resource

        return get_dynamo_resource() if self.kind == "resource" else get_dynamo_client()


class DynamoHelper:
    AWS_DEFAULT_REGION = "ap-south-1"

    dynamodb = _LazyBackend("resource")
    dynamodb_client = _LazyBackend("client")

    def __init__(self, table_name):
        self.table_name = table_name
        self._table_instance = self.dynamodb.Table(table_name)

    # ... rest of your existing methods remain exactly the same ...
    def _create_basic_expression_attributes(self, filter_dict, separator):
        """
        Creates DynamoDB ExpressionAttributeNames and ExpressionAttributeValues from a filter dictionary.

        Args:
            filter_dict (dict): Dictionary of attributes and their values to filter by.
                Example: {"attribute1": "value1", "attribute2": 2}

        Returns:
            tuple: (expression_attribute_names, expression_attribute_values, name_value_map)
                Example: ({"#a": "attribute1", "#b": "attribute2"},
                         {":a": "value1", ":b": 2},
                         {"attribute1": {"name": "#a", "value": ":a"}, "attribute2": {"name": "#b", "value": ":b"}})
        """
        if not filter_dict:
            return {}, {}, {}

        # Generate placeholders: a-z, then aa, ab, ac, ...
        def generate_placeholders():
            for length in itertools.count(1):
                for letters in itertools.product(string.ascii_lowercase, repeat=length):
                    yield "".join(letters)

        expression_attribute_names = {}
        expression_attribute_values = {}
        filter_expression = ""  # To keep track of mappings for filter expression building

        placeholders = generate_placeholders()

        for key, value in filter_dict.items():
            operator = "="  # Default operator
            placeholder = next(placeholders)
            name_placeholder = f"#{placeholder}"
            value_placeholder = f":{placeholder}"

            expression_attribute_names[name_placeholder] = key

            if key == 'archived' and type(value) is dict:
                for k,v in value.items():
                    value = v
                    operator = "<>" if k == "ne" else "="
                    break
            expression_attribute_values[value_placeholder] = value
            filter_expression += f"{name_placeholder} {operator} {value_placeholder}{separator}"

        filter_expression = filter_expression.rstrip(separator)  # Remove trailing separator

        return expression_attribute_names, expression_attribute_values, filter_expression
    
    def get_item(self, key_dict: dict) -> dict:        
        response = self._table_instance.get_item(Key=key_dict)
        return response.get("Item") or {}
    
    def query_multiple_items_batch(self, ids: list, key_name: str = "id") -> list:
        """
        Get multiple items using batch_get_item
        Args:
            ids (list): List of ID values to fetch
            key_name (str): Name of the key attribute (default: "id")
        Returns:
            list: List of items found
        """
        request_items = {
            self.table_name: {
                'Keys': [{key_name: id_val} for id_val in ids]
            }
        }

        response = self.dynamodb.batch_get_item(RequestItems=request_items)
        return response.get('Responses', {}).get(self.table_name, [])


    def update_item(self, key_dict, update_dict: dict, owner_details: dict = None):
        """
        Update an item in the DynamoDB table.

        Args:
            key_dict (dict): Dictionary of keys to identify the item to update.
            update_dict (dict): Dictionary of attributes to update with their new values.

        Returns:
            dict: The response from DynamoDB.
        """
        expression_attribute_names, expression_attribute_values, update_expression = (
            self._create_basic_expression_attributes(update_dict, ", ")
        )
        update_expression = "SET " + update_expression

        # Add the partition key to the expression attribute names for condition expression check
        pks = key_dict.keys()
        condition_expression = ""
        for pk_key in pks:
            expression_attribute_names[f"#{pk_key}"] = pk_key
            condition_expression += f"attribute_exists(#{pk_key}) AND "

        condition_expression = condition_expression.rstrip(" AND ")

        query_params = {
            "Key": key_dict,
            "UpdateExpression": update_expression,
            "ExpressionAttributeNames": expression_attribute_names,
            "ExpressionAttributeValues": expression_attribute_values,
            "ConditionExpression": condition_expression,  # Ensures the item exists
        }
        if owner_details:
            query_params["ConditionExpression"] += " AND attribute_exists(#ownk) AND #ownk = :ownv"
            expression_attribute_names["#ownk"] = owner_details["owner_key"]
            expression_attribute_values[":ownv"] = owner_details["owner_id"]

        response = self._table_instance.update_item(**query_params)  # Ensures the item exists
        return response

    def scan_table(self) -> list:
        try:
            items = []
            scan_kwargs = {}
            
            while True:
                response = self._table_instance.scan(**scan_kwargs)
                items.extend(response.get("Items", []))
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
                    
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            log.info(f"Scanned {len(items)} items from table {self.table_name}")
            return items
            
        except Exception as e:
            log.error(f"Error scanning table {self.table_name}: {e}")
            return []
    
    def scan_by_filter(self, filter_dict: dict) -> list:
        if not filter_dict:
            return self.scan_table()
        
        try:
            items = []
            
            expression_attribute_names, expression_attribute_values, filter_expression = (
                self._create_basic_expression_attributes(filter_dict, " AND ")
            )
            
            scan_kwargs = {
                "FilterExpression": filter_expression,
                "ExpressionAttributeNames": expression_attribute_names,
                "ExpressionAttributeValues": expression_attribute_values,
            }
            
            while True:
                response = self._table_instance.scan(**scan_kwargs)
                items.extend(response.get("Items", []))
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
                    
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            log.info(
                f"Scanned {len(items)} items from table {self.table_name} "
                f"with filter: {filter_dict}"
            )
            return items
            
        except Exception as e:
            log.error(
                f"Error scanning table {self.table_name} with filter {filter_dict}: {e}"
            )
            return []

    @staticmethod
    def dynamodb_transact_write_items(transact_items):
        # table_instance = DynamoHelper.dynamodb.Table(tablename)
        respose = DynamoHelper.dynamodb_client.transact_write_items(TransactItems=transact_items)
        log.debug(f"transact_write_items response: {respose}")
        return respose
    
    def dynamodb_get_batch_items(self, keys: list) -> list:
        """_summary_

        Args:
            table_name (_type_): table name
            keys (_type_): partition keys to get items from DynamoDB

        Returns:
            _type_: list of items from DynamoDB
        """

        table_name = self._table_instance.name
        try:
            response = DynamoHelper.dynamodb_client.batch_get_item(
                RequestItems={
                    table_name: {
                        "Keys": keys,
                    }
                }
            )
            row_items = response.get("Responses", {}).get(table_name, [])
            while "UnprocessedKeys" in response and response["UnprocessedKeys"]:
                response = DynamoHelper.dynamodb_client.batch_get_item(
                    RequestItems=response["UnprocessedKeys"]
                )
                unprocessed_items = response.get("Responses", {}).get(table_name, [])
                row_items.extend(unprocessed_items)

            items = [
                {k: deserializer.deserialize(v) for k, v in item.items()} for item in row_items
            ]  # noqa: E501

            return items
        except Exception as e:
            log.error("Error getting batch items from DynamoDB: %s", e)
            raise

    @staticmethod
    def bulk_insert_update_items(table_name, items):
        """
        Bulk insert or update items in a DynamoDB table.
        Args:
            items (list): List of items to be inserted or updated.
        Returns:
            list: List of responses from DynamoDB for each item.
        """
        batch_size = 25
        success_data = []
        failed_data = []

        try:
            for i in range(0, len(items), batch_size):
                batch = items[i : i + batch_size]
                table = DynamoHelper.dynamodb.Table(table_name)
                with table.batch_writer() as batch_writer:
                    for item in batch:
                        try:
                            batch_writer.put_item(Item=item)
                            success_data.append(item)
                        except DynamoHelper.dynamodb.meta.client.exceptions.ConditionalCheckFailedException as e:  # noqa: E501
                            log.error(
                                (
                                    "AWSHelper:: dynamodb_put_item-err :: profile already exist with given oid"  # noqa: E501
                                    "-> %s :: item-> %s :: error-> %s"
                                )
                                % (item.get("oid"), item, e)
                            )
                            failed_data.append({"profile": item, "error": str(e), "code": "500"})
                        except ClientError as e:
                            log.error(f"Failed to process profile: {item}. Error: {e}")
                            failed_data.append({"profile": item, "error": str(e), "code": "500"})
                        except Exception as e:
                            log.error(f"Unexpected error processing profile: {item}. Error: {e}")
                            failed_data.append({"profile": item, "error": str(e), "code": "500"})
            response = {
                "success": success_data,
                "failed": failed_data,
            }

            return response
        except Exception as e:
            log.error("Error during bulk insert/update: %s", e)
            raise

    # ---------------------------------- old ones ----------------------------------
    
 



def get_dynamo_client() -> "PgAsyncWrapper":
    """
    Get or create the async document-DB client (Postgres-backed).
    """
    
    global _dynamo_instance
    if _dynamo_instance is None:
        from scribe_core.db.async_wrapper import PgAsyncWrapper

        _dynamo_instance = PgAsyncWrapper()
    return _dynamo_instance


def close_dynamo_connection():
    """Close the global DynamoDB connection"""
    global _dynamo_instance
    _dynamo_instance = None
