"""Postgres document-table engine with a boto3-DynamoDB-compatible surface.

PgResource / PgTable / PgClient mimic the (small) subset of the boto3 resource,
Table, and client APIs the forked code uses, executing against the relational
tables defined in spec.py. This lets all four legacy Dynamo access paths
(BaseORM, DynamoHelper, DynamoDBOperations, raw resource) run unchanged on
Postgres by swapping only their client construction (see factory.py).

Semantics preserved: ConditionalCheckFailedException on conditional put,
wire-format (``{"S": ...}``) items on the client API, LastEvaluatedKey
pagination, ScanIndexForward ordering, ProjectionExpression.
"""

from __future__ import annotations

import json
import threading
from decimal import Decimal
from typing import Any, Dict, List, Optional

from scribe_core.db.conditions import expression_to_sql
from scribe_core.db.spec import TableSpec, get_spec
from scribe_core.settings import get_settings

# --- wire format (client API) conversions ------------------------------------


def wire_to_py(v: Dict[str, Any]) -> Any:
    if "S" in v:
        return v["S"]
    if "N" in v:
        n = v["N"]
        return float(n) if "." in n or "e" in n.lower() else int(n)
    if "BOOL" in v:
        return v["BOOL"]
    if "NULL" in v:
        return None
    if "L" in v:
        return [wire_to_py(x) for x in v["L"]]
    if "M" in v:
        return {k: wire_to_py(x) for k, x in v["M"].items()}
    raise ValueError(f"Unsupported wire value: {v}")


def py_to_wire(value: Any) -> Dict[str, Any]:
    if value is None:
        return {"NULL": True}
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, str):
        return {"S": value}
    if isinstance(value, (int, float, Decimal)):
        return {"N": str(value)}
    if isinstance(value, list):
        return {"L": [py_to_wire(v) for v in value]}
    if isinstance(value, dict):
        return {"M": {k: py_to_wire(v) for k, v in value.items()}}
    raise TypeError(f"Unsupported type: {type(value)}")


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, (set, tuple)):
        return [_jsonable(v) for v in value]
    return value


class ConditionalCheckFailed(Exception):
    """Raised internally; converted to botocore ClientError at the shim edge."""


def _client_error(code: str, op: str):
    from botocore.exceptions import ClientError

    return ClientError({"Error": {"Code": code, "Message": code}}, op)


# --- connection pool ----------------------------------------------------------

_pool = None
_pool_lock = threading.Lock()


def get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                from psycopg_pool import ConnectionPool

                dsn = get_settings().database_url
                _pool = ConnectionPool(conninfo=dsn, min_size=1, max_size=10, open=True)
    return _pool


def reset_pool():
    global _pool
    if _pool is not None:
        _pool.close()
    _pool = None


# --- schema -------------------------------------------------------------------


def ddl_for_spec(spec: TableSpec) -> List[str]:
    cols = list(spec.pk) + [c for c in spec.columns if c not in spec.pk]
    col_defs = ", ".join(f'"{c}" TEXT' + (" NOT NULL" if c in spec.pk else "") for c in cols)
    pk = ", ".join(f'"{c}"' for c in spec.pk)
    stmts = [
        f'CREATE TABLE IF NOT EXISTS "{spec.pg_name}" ('
        f"{col_defs}, data JSONB NOT NULL DEFAULT '{{}}'::jsonb, "
        f"db_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
        f"PRIMARY KEY ({pk}))"
    ]
    # Idempotent evolution: spec columns added to pre-existing tables.
    for c in cols:
        stmts.append(f'ALTER TABLE "{spec.pg_name}" ADD COLUMN IF NOT EXISTS "{c}" TEXT')
    for idx in spec.indexes:
        idx_name = f"{spec.pg_name}_{'_'.join(idx)}_idx"
        idx_cols = ", ".join(f'"{c}"' for c in idx)
        stmts.append(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{spec.pg_name}" ({idx_cols})')
    return stmts


def ensure_schema(extra_specs: Optional[List[TableSpec]] = None) -> None:
    from scribe_core.db.spec import SPECS

    with get_pool().connection() as conn:
        for spec in list(SPECS.values()) + (extra_specs or []):
            for stmt in ddl_for_spec(spec):
                conn.execute(stmt)
        conn.commit()


# --- core row ops -------------------------------------------------------------


def _mirror_columns(spec: TableSpec, item: Dict[str, Any]) -> Dict[str, Any]:
    cols = {}
    for c in list(spec.pk) + list(spec.columns):
        v = item.get(c)
        cols[c] = None if v is None else str(v)
    return cols


class _Engine:
    """Table-level operations against Postgres."""

    def __init__(self, spec: TableSpec):
        self.spec = spec

    # -- basic ops --

    def get_item(self, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        where = " AND ".join(f'"{k}" = %s' for k in key)
        sql = f'SELECT data FROM "{self.spec.pg_name}" WHERE {where}'
        with get_pool().connection() as conn:
            row = conn.execute(sql, [str(v) for v in key.values()]).fetchone()
        return row[0] if row else None

    def put_item(self, item: Dict[str, Any], if_not_exists: bool = False) -> None:
        item = _jsonable(item)
        cols = _mirror_columns(self.spec, item)
        col_names = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * (len(cols) + 1))
        pk = ", ".join(f'"{c}"' for c in self.spec.pk)
        if if_not_exists:
            conflict = f"ON CONFLICT ({pk}) DO NOTHING"
        else:
            sets = ", ".join(
                f'"{c}" = EXCLUDED."{c}"' for c in list(cols) if c not in self.spec.pk
            )
            sets = (sets + ", " if sets else "") + "data = EXCLUDED.data, db_updated_at = now()"
            conflict = f"ON CONFLICT ({pk}) DO UPDATE SET {sets}"
        sql = (
            f'INSERT INTO "{self.spec.pg_name}" ({col_names}, data) '
            f"VALUES ({placeholders}) {conflict}"
        )
        with get_pool().connection() as conn:
            cur = conn.execute(sql, list(cols.values()) + [json.dumps(item)])
            if if_not_exists and cur.rowcount == 0:
                raise ConditionalCheckFailed()
            conn.commit()

    def update_item(self, key: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        """Dynamo update semantics: creates the item if absent (upsert), merges fields."""
        updates = _jsonable(updates)
        where = " AND ".join(f'"{k}" = %s' for k in key)
        with get_pool().connection() as conn:
            row = conn.execute(
                f'SELECT data FROM "{self.spec.pg_name}" WHERE {where} FOR UPDATE',
                [str(v) for v in key.values()],
            ).fetchone()
            item = dict(row[0]) if row else {k: str(v) for k, v in key.items()}
            item.update(updates)
            cols = _mirror_columns(self.spec, item)
            col_names = ", ".join(f'"{c}"' for c in cols)
            pk = ", ".join(f'"{c}"' for c in self.spec.pk)
            non_pk_sets = ", ".join(
                f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in self.spec.pk
            )
            sets = (non_pk_sets + ", " if non_pk_sets else "") + (
                "data = EXCLUDED.data, db_updated_at = now()"
            )
            sql = (
                f'INSERT INTO "{self.spec.pg_name}" ({col_names}, data) '
                f'VALUES ({", ".join(["%s"] * (len(cols) + 1))}) '
                f"ON CONFLICT ({pk}) DO UPDATE SET {sets}"
            )
            conn.execute(sql, list(cols.values()) + [json.dumps(item)])
            conn.commit()
        return item

    def delete_item(self, key: Dict[str, Any]) -> bool:
        where = " AND ".join(f'"{k}" = %s' for k in key)
        with get_pool().connection() as conn:
            cur = conn.execute(
                f'DELETE FROM "{self.spec.pg_name}" WHERE {where}',
                [str(v) for v in key.values()],
            )
            conn.commit()
            return cur.rowcount > 0

    # -- query/scan --

    def query(
        self,
        key_condition: str,
        values: Dict[str, Any],
        names: Optional[Dict[str, str]] = None,
        filter_expression: Optional[str] = None,
        limit: Optional[int] = None,
        scan_forward: bool = True,
        exclusive_start: Optional[Dict[str, Any]] = None,
        index_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        where_sql, params = expression_to_sql(key_condition, self.spec, values, names)
        if filter_expression:
            f_sql, f_params = expression_to_sql(filter_expression, self.spec, values, names)
            where_sql = f"({where_sql}) AND ({f_sql})"
            params = params + f_params

        order_col = self._order_column(key_condition, index_name)
        direction = "ASC" if scan_forward else "DESC"
        order_sql = f'ORDER BY "{order_col}" {direction}, {self._pk_order(direction)}'

        offset = int((exclusive_start or {}).get("__offset", 0))
        sql = f'SELECT data FROM "{self.spec.pg_name}" WHERE {where_sql} {order_sql}'
        sql += " OFFSET %s"
        params.append(offset)
        fetch_limit = None
        if limit:
            sql += " LIMIT %s"
            params.append(limit + 1)  # +1 to detect more pages
            fetch_limit = limit

        with get_pool().connection() as conn:
            rows = conn.execute(sql, params).fetchall()

        items = [r[0] for r in rows]
        result: Dict[str, Any] = {}
        if fetch_limit is not None and len(items) > fetch_limit:
            items = items[:fetch_limit]
            result["LastEvaluatedKey"] = {"__offset": offset + fetch_limit}
        result["Items"] = items
        result["Count"] = len(items)
        return result

    def scan(
        self,
        filter_expression: Optional[str] = None,
        values: Optional[Dict[str, Any]] = None,
        names: Optional[Dict[str, str]] = None,
    ) -> List[Dict[str, Any]]:
        sql = f'SELECT data FROM "{self.spec.pg_name}"'
        params: List[Any] = []
        if filter_expression:
            f_sql, params = expression_to_sql(filter_expression, self.spec, values or {}, names)
            sql += f" WHERE {f_sql}"
        with get_pool().connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [r[0] for r in rows]

    def batch_get(self, keys: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [item for k in keys if (item := self.get_item(k)) is not None]

    def _order_column(self, key_condition: str, index_name: Optional[str] = None) -> str:
        # Dynamo orders results by the queried index's sort key. GSI names follow
        # the "<partition>-<sort>-index" convention, so parse the sort key out.
        if index_name and index_name.endswith("-index"):
            parts = index_name[: -len("-index")].split("-")
            if len(parts) >= 2:
                candidate = parts[-1]
                if candidate in self.spec.columns or candidate in self.spec.pk:
                    return candidate
        # Main-table query: order by the table sort key when present.
        if self.spec.sort_key:
            return self.spec.sort_key
        if "created_at" in (self.spec.columns or ()):
            return "created_at"
        return self.spec.pk[0]

    def _pk_order(self, direction: str) -> str:
        return ", ".join(f'"{c}" {direction}' for c in self.spec.pk)
