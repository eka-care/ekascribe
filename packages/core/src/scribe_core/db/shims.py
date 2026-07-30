"""boto3-DynamoDB-shaped shims over the Postgres engine (Phase 2).

PgResource ≈ boto3.resource("dynamodb"); PgTable ≈ resource.Table(name);
PgClient ≈ boto3.client("dynamodb"). Only the call-surface the forked code
uses is implemented; anything else raises loudly.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from scribe_core.db.pg_engine import (
    ConditionalCheckFailed,
    _Engine,
    _client_error,
    py_to_wire,
    wire_to_py,
)
from scribe_core.db.spec import get_spec


def _cond_to_expr(cond) -> tuple[str, Dict[str, Any], Dict[str, str]]:
    """boto3 conditions object (Key(...).eq(...) & ...) → string expr + values."""
    from boto3.dynamodb.conditions import ConditionExpressionBuilder

    built = ConditionExpressionBuilder().build_expression(cond, is_key_condition=True)
    return (
        built.condition_expression,
        dict(built.attribute_value_placeholders),
        dict(built.attribute_name_placeholders),
    )


def _apply_projection(items, projection: Optional[str], names: Optional[Dict[str, str]]):
    if not projection:
        return items
    fields = []
    for raw in projection.split(","):
        raw = raw.strip()
        fields.append((names or {}).get(raw, raw))
    return [{f: item[f] for f in fields if f in item} for item in items]


class PgTable:
    def __init__(self, logical_name: str):
        self.name = logical_name
        self.spec = get_spec(logical_name)
        self.engine = _Engine(self.spec)

    # boto3 Table surface ------------------------------------------------------

    def get_item(self, Key: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        item = self.engine.get_item(Key)
        return {"Item": item} if item is not None else {}

    def put_item(self, Item: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        self.engine.put_item(Item)
        return {}

    def update_item(
        self,
        Key: Dict[str, Any],
        UpdateExpression: str,
        ExpressionAttributeValues: Dict[str, Any] | None = None,
        ExpressionAttributeNames: Dict[str, str] | None = None,
        ReturnValues: str = "NONE",
        **kwargs,
    ) -> Dict[str, Any]:
        updates = _parse_set_expression(
            UpdateExpression, ExpressionAttributeValues or {}, ExpressionAttributeNames or {}
        )
        item = self.engine.update_item(Key, updates)
        if ReturnValues in ("ALL_NEW", "UPDATED_NEW"):
            return {"Attributes": item}
        return {}

    def delete_item(self, Key: Dict[str, Any], ReturnValues: str = "NONE", **kwargs):
        existing = self.engine.get_item(Key) if ReturnValues == "ALL_OLD" else None
        deleted = self.engine.delete_item(Key)
        resp: Dict[str, Any] = {}
        if ReturnValues == "ALL_OLD" and deleted and existing is not None:
            resp["Attributes"] = existing
        return resp

    def query(self, **kwargs) -> Dict[str, Any]:
        key_cond = kwargs.get("KeyConditionExpression")
        values = dict(kwargs.get("ExpressionAttributeValues") or {})
        names = dict(kwargs.get("ExpressionAttributeNames") or {})
        filter_expr = kwargs.get("FilterExpression")

        if key_cond is not None and not isinstance(key_cond, str):
            key_cond, extra_vals, extra_names = _cond_to_expr(key_cond)
            values.update(extra_vals)
            names.update(extra_names)
        if filter_expr is not None and not isinstance(filter_expr, str):
            filter_expr, extra_vals, extra_names = _cond_to_expr(filter_expr)
            values.update(extra_vals)
            names.update(extra_names)

        result = self.engine.query(
            key_condition=key_cond,
            values=values,
            names=names,
            filter_expression=filter_expr,
            limit=kwargs.get("Limit"),
            scan_forward=kwargs.get("ScanIndexForward", True),
            exclusive_start=kwargs.get("ExclusiveStartKey"),
            index_name=kwargs.get("IndexName"),
        )
        result["Items"] = _apply_projection(
            result["Items"], kwargs.get("ProjectionExpression"), names
        )
        return result

    def scan(self, **kwargs) -> Dict[str, Any]:
        filter_expr = kwargs.get("FilterExpression")
        values = dict(kwargs.get("ExpressionAttributeValues") or {})
        names = dict(kwargs.get("ExpressionAttributeNames") or {})
        if filter_expr is not None and not isinstance(filter_expr, str):
            filter_expr, extra_vals, extra_names = _cond_to_expr(filter_expr)
            values.update(extra_vals)
            names.update(extra_names)
        items = self.engine.scan(filter_expr, values, names)
        items = _apply_projection(items, kwargs.get("ProjectionExpression"), names)
        return {"Items": items, "Count": len(items)}


class PgResource:
    """boto3.resource("dynamodb") shim."""

    def Table(self, name: str) -> PgTable:
        return PgTable(name)

    def batch_get_item(self, RequestItems: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        responses: Dict[str, List[Dict[str, Any]]] = {}
        for table_name, spec_req in RequestItems.items():
            table = PgTable(table_name)
            responses[table_name] = table.engine.batch_get(spec_req.get("Keys", []))
        return {"Responses": responses, "UnprocessedKeys": {}}


class PgClient:
    """boto3.client("dynamodb") shim — wire-format items in/out."""

    def put_item(
        self,
        TableName: str,
        Item: Dict[str, Any],
        ConditionExpression: str | None = None,
        **kwargs,
    ):
        table = PgTable(TableName)
        py_item = {k: wire_to_py(v) for k, v in Item.items()}
        if_not_exists = bool(ConditionExpression and "attribute_not_exists" in ConditionExpression)
        try:
            table.engine.put_item(py_item, if_not_exists=if_not_exists)
        except ConditionalCheckFailed:
            raise _client_error("ConditionalCheckFailedException", "PutItem")
        return {}

    def query(self, TableName: str, **kwargs) -> Dict[str, Any]:
        values = kwargs.get("ExpressionAttributeValues") or {}
        kwargs["ExpressionAttributeValues"] = {k: wire_to_py(v) for k, v in values.items()}
        start = kwargs.get("ExclusiveStartKey")
        if start and "__offset" in start:
            # wire-format opaque token round-trips unchanged
            kwargs["ExclusiveStartKey"] = {"__offset": wire_to_py(start["__offset"])} if isinstance(start["__offset"], dict) else start
        result = PgTable(TableName).query(**kwargs)
        wire_items = [{k: py_to_wire(v) for k, v in item.items()} for item in result["Items"]]
        out: Dict[str, Any] = {"Items": wire_items, "Count": result.get("Count", len(wire_items))}
        if "LastEvaluatedKey" in result:
            out["LastEvaluatedKey"] = result["LastEvaluatedKey"]
        return out

    def transact_write_items(self, TransactItems: List[Dict[str, Any]], **kwargs):
        for op in TransactItems:
            if "Put" in op:
                self.put_item(
                    TableName=op["Put"]["TableName"],
                    Item=op["Put"]["Item"],
                    ConditionExpression=op["Put"].get("ConditionExpression"),
                )
            elif "Update" in op:
                spec = op["Update"]
                table = PgTable(spec["TableName"])
                key = {k: wire_to_py(v) for k, v in spec["Key"].items()}
                updates = _parse_set_expression(
                    spec["UpdateExpression"],
                    {k: wire_to_py(v) for k, v in (spec.get("ExpressionAttributeValues") or {}).items()},
                    spec.get("ExpressionAttributeNames") or {},
                )
                table.engine.update_item(key, updates)
            elif "Delete" in op:
                spec = op["Delete"]
                PgTable(spec["TableName"]).engine.delete_item(
                    {k: wire_to_py(v) for k, v in spec["Key"].items()}
                )
            else:
                raise NotImplementedError(f"transact op {list(op)} not supported")
        return {}

    def batch_get_item(self, RequestItems: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        responses = {}
        for table_name, req in RequestItems.items():
            keys = [{k: wire_to_py(v) for k, v in key.items()} for key in req.get("Keys", [])]
            items = PgTable(table_name).engine.batch_get(keys)
            responses[table_name] = [
                {k: py_to_wire(v) for k, v in item.items()} for item in items
            ]
        return {"Responses": responses, "UnprocessedKeys": {}}


def _parse_set_expression(
    expr: str, values: Dict[str, Any], names: Dict[str, str]
) -> Dict[str, Any]:
    """Parse ``SET #a = :v, b = :w`` (the only form the codebase emits)."""
    expr = expr.strip()
    if not expr.upper().startswith("SET "):
        raise NotImplementedError(f"Only SET update expressions supported, got: {expr}")
    updates: Dict[str, Any] = {}
    for part in expr[4:].split(","):
        left, _, right = part.partition("=")
        field = left.strip()
        value_ref = right.strip()
        field = names.get(field, field)
        if not value_ref.startswith(":"):
            raise NotImplementedError(f"Unsupported SET rhs: {part}")
        updates[field] = values[value_ref]
    return updates
