"""Postgres document engine.

Each logical table (scribe_core.db.spec) maps to a Postgres table with typed
key/indexed columns plus a ``data JSONB`` column holding the full item. Reads
reconstruct the item from ``data``; writes mirror the spec'd columns, so
deployments get real SQL over the same documents:

    SELECT txn_id, processing_status FROM voice2rx_transactions
    WHERE b_id = '...' AND created_at > '2026-07-01' ORDER BY created_at DESC;
"""

from __future__ import annotations

import json
import threading
from decimal import Decimal
from typing import Any, Dict, List, Optional

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
    """Raised when a conditional write (if-not-exists / require-exists / expect) fails."""


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

    def update_item(
        self,
        key: Dict[str, Any],
        updates: Dict[str, Any],
        *,
        require_exists: bool = False,
        expect: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Merge ``updates`` into the item. Default semantics upsert (create if
        absent); ``require_exists=True`` raises ConditionalCheckFailed when the
        row is missing, and ``expect`` enforces field equality (e.g. ownership)
        before writing."""
        updates = _jsonable(updates)
        where = " AND ".join(f'"{k}" = %s' for k in key)
        with get_pool().connection() as conn:
            row = conn.execute(
                f'SELECT data FROM "{self.spec.pg_name}" WHERE {where} FOR UPDATE',
                [str(v) for v in key.values()],
            ).fetchone()
            if row is None and require_exists:
                raise ConditionalCheckFailed()
            if row is not None and expect:
                current = row[0]
                for f_, v_ in expect.items():
                    if current.get(f_) != v_:
                        raise ConditionalCheckFailed()
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

    def remove_fields(self, key: Dict[str, Any], fields: List[str]) -> None:
        """Remove top-level fields from the item's document (and NULL any
        mirrored non-key columns)."""
        if not fields:
            return
        where = " AND ".join(f'"{k}" = %s' for k in key)
        data_sql = "data"
        params: List[Any] = []
        for f_ in fields:
            data_sql += " - %s"
            params.append(f_)
        col_sets = "".join(
            f', "{c}" = NULL' for c in fields
            if c in (self.spec.columns or ()) and c not in self.spec.pk
        )
        sql = (
            f'UPDATE "{self.spec.pg_name}" SET data = {data_sql}{col_sets}, '
            f"db_updated_at = now() WHERE {where}"
        )
        with get_pool().connection() as conn:
            conn.execute(sql, params + [str(v) for v in key.values()])
            conn.commit()

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

    # -- native querying ----------------------------------------------------
    #
    # `where` is a list of conditions, AND-ed together:
    #     ("field", "eq"|"ne"|"lt"|"lte"|"gt"|"gte"|"between"|"begins_with"|
    #      "contains"|"exists"|"not_exists", value)
    # One level of OR is supported: ("or", [triple, triple, ...]).
    #
    # Spec columns compare against real columns; everything else against the
    # JSONB ``data`` document. Data equality is type-faithful via @>. Data
    # ``ne`` uses NOT(data @> ...), which also matches rows where the field
    # is absent — the common "archived <> true" pattern needs exactly that.

    _OPS = {"eq": "=", "ne": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}

    def _is_column(self, field: str) -> bool:
        return field in (self.spec.columns or ()) or field in self.spec.pk or field == self.spec.sort_key

    @staticmethod
    def _like_escape(v: str) -> str:
        return v.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    def _cond_sql(self, cond) -> "tuple[str, list]":
        if cond[0] == "or":
            parts, params = [], []
            for sub in cond[1]:
                sql, p = self._cond_sql(sub)
                parts.append(sql); params.extend(p)
            return "(" + " OR ".join(parts) + ")", params
        field, op, value = cond
        col = self._is_column(field)
        ident = f'"{field}"' if col else None
        if op in ("eq", "ne", "lt", "lte", "gt", "gte"):
            sym = self._OPS[op]
            if col:
                return f"{ident} {sym} %s", [value]
            if op == "eq":
                return "data @> %s::jsonb", [json.dumps({field: _jsonable(value)})]
            if op == "ne":
                return "NOT (data @> %s::jsonb)", [json.dumps({field: _jsonable(value)})]
            if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
                return f"((data->>%s)::numeric) {sym} %s", [field, value]
            return f"(data->>%s) {sym} %s", [field, str(value)]
        if op == "between":
            lo, hi = value
            if col:
                return f"{ident} BETWEEN %s AND %s", [lo, hi]
            if isinstance(lo, (int, float, Decimal)) and not isinstance(lo, bool):
                return "((data->>%s)::numeric) BETWEEN %s AND %s", [field, lo, hi]
            return "(data->>%s) BETWEEN %s AND %s", [field, str(lo), str(hi)]
        if op == "begins_with":
            expr = ident if col else "(data->>%s)"
            params = [] if col else [field]
            return f"{expr} LIKE %s", params + [self._like_escape(str(value)) + "%"]
        if op == "contains":
            expr = ident if col else "(data->>%s)"
            params = [] if col else [field]
            return f"{expr} LIKE %s", params + ["%" + self._like_escape(str(value)) + "%"]
        if op == "exists":
            if col:
                return f"{ident} IS NOT NULL", []
            return "data ? %s", [field]
        if op == "not_exists":
            if col:
                return f"{ident} IS NULL", []
            return "NOT (data ? %s)", [field]
        raise ValueError(f"unknown where op: {op!r}")

    def _where_sql(self, where) -> "tuple[str, list]":
        if not where:
            return "TRUE", []
        parts, params = [], []
        for cond in where:
            sql, p = self._cond_sql(cond)
            parts.append(sql); params.extend(p)
        return " AND ".join(parts), params

    def find(
        self,
        where=None,
        *,
        order_by: Optional[str] = None,
        desc: bool = False,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        where_sql, params = self._where_sql(where or [])
        order_col = order_by or self.spec.sort_key or (
            "created_at" if "created_at" in (self.spec.columns or ()) else self.spec.pk[0]
        )
        direction = "DESC" if desc else "ASC"
        pk_order = ", ".join(f'"{c}" {direction}' for c in self.spec.pk)
        sql = (
            f'SELECT data FROM "{self.spec.pg_name}" WHERE {where_sql} '
            f'ORDER BY "{order_col}" {direction}, {pk_order}'
        )
        if offset:
            sql += " OFFSET %s"; params.append(int(offset))
        if limit:
            sql += " LIMIT %s"; params.append(int(limit))
        with get_pool().connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [r[0] for r in rows]

    def count(self, where=None) -> int:
        where_sql, params = self._where_sql(where or [])
        with get_pool().connection() as conn:
            row = conn.execute(
                f'SELECT count(*) FROM "{self.spec.pg_name}" WHERE {where_sql}', params
            ).fetchone()
        return int(row[0])

    def batch_get(self, keys: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [item for k in keys if (item := self.get_item(k)) is not None]


_tables: Dict[str, "_Engine"] = {}


def get_table(name: str) -> "_Engine":
    """Process-wide engine per table (logical or physical name)."""
    eng = _tables.get(name)
    if eng is None:
        eng = _tables[name] = _Engine(get_spec(name))
    return eng
