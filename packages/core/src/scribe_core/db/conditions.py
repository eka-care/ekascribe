"""DynamoDB expression → SQL translation (Phase 2).

Parses the bounded expression grammar the codebase actually uses:

  KeyConditionExpression / FilterExpression strings:
    a = :v | a <> :v | a < :v | a <= :v | a > :v | a >= :v
    a BETWEEN :x AND :y
    begins_with(a, :v) | attribute_not_exists(a) | attribute_exists(a) | contains(a, :v)
    expr AND expr | expr OR expr | (expr)   with #name / :value placeholders

Columns in the table spec compare against real columns; everything else against
``data`` (JSONB) with type-faithful semantics (Dynamo compares typed values, so
``arc = false`` does not match ``arc = "false"`` — mirrored here via @>).
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Tuple

from scribe_core.db.spec import TableSpec

_TOKEN_RE = re.compile(
    r"""\s*(?:
        (?P<lparen>\() | (?P<rparen>\)) |
        (?P<op><>|<=|>=|=|<|>) |
        (?P<comma>,) |
        (?P<value>:[A-Za-z0-9_]+) |
        (?P<name>\#?[A-Za-z_][A-Za-z0-9_.-]*)
    )""",
    re.VERBOSE,
)

_FUNCS = {"begins_with", "attribute_not_exists", "attribute_exists", "contains"}
_KEYWORDS = {"AND", "OR", "NOT", "BETWEEN"}


def _tokenize(expr: str) -> List[Tuple[str, str]]:
    tokens = []
    pos = 0
    while pos < len(expr):
        m = _TOKEN_RE.match(expr, pos)
        if not m:
            raise ValueError(f"Cannot tokenize expression at: {expr[pos:]!r}")
        pos = m.end()
        for kind, val in m.groupdict().items():
            if val is not None:
                if kind == "name" and val.upper() in _KEYWORDS:
                    tokens.append(("kw", val.upper()))
                elif kind == "name" and val in _FUNCS:
                    tokens.append(("func", val))
                else:
                    tokens.append((kind, val))
                break
    return tokens


class _Parser:
    """Recursive descent: or_expr → and_expr (OR and_expr)* etc."""

    def __init__(self, tokens, translator):
        self.tokens = tokens
        self.i = 0
        self.t = translator

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else (None, None)

    def next(self):
        tok = self.peek()
        self.i += 1
        return tok

    def expect(self, kind, val=None):
        k, v = self.next()
        if k != kind or (val is not None and v != val):
            raise ValueError(f"Expected {kind} {val}, got {k} {v}")
        return v

    def parse(self) -> str:
        sql = self.or_expr()
        if self.peek() != (None, None):
            raise ValueError(f"Trailing tokens: {self.tokens[self.i:]}")
        return sql

    def or_expr(self) -> str:
        parts = [self.and_expr()]
        while self.peek() == ("kw", "OR"):
            self.next()
            parts.append(self.and_expr())
        return "(" + " OR ".join(parts) + ")" if len(parts) > 1 else parts[0]

    def and_expr(self) -> str:
        parts = [self.unary_expr()]
        while self.peek() == ("kw", "AND"):
            self.next()
            parts.append(self.unary_expr())
        return "(" + " AND ".join(parts) + ")" if len(parts) > 1 else parts[0]

    def unary_expr(self) -> str:
        kind, val = self.peek()
        if kind == "kw" and val == "NOT":
            self.next()
            return f"(NOT {self.unary_expr()})"
        if kind == "lparen":
            self.next()
            inner = self.or_expr()
            self.expect("rparen")
            return f"({inner})"
        if kind == "func":
            return self.func_expr()
        return self.comparison()

    def func_expr(self) -> str:
        _, fname = self.next()
        self.expect("lparen")
        _, attr = self.next()
        if fname in ("begins_with", "contains"):
            self.expect("comma")
            _, value_ref = self.next()
            self.expect("rparen")
            return self.t.func_sql(fname, attr, value_ref)
        self.expect("rparen")
        return self.t.func_sql(fname, attr, None)

    def comparison(self) -> str:
        kind, attr = self.next()
        if kind != "name":
            raise ValueError(f"Expected attribute name, got {kind} {attr}")
        kind, val = self.next()
        if kind == "kw" and val == "BETWEEN":
            _, lo = self.next()
            self.expect("kw", "AND")
            _, hi = self.next()
            return self.t.between_sql(attr, lo, hi)
        if kind == "op":
            _, value_ref = self.next()
            return self.t.compare_sql(attr, val, value_ref)
        raise ValueError(f"Expected operator after {attr}")


class Translator:
    """Holds spec + names/values; produces SQL with %s params in self.params."""

    def __init__(
        self,
        spec: TableSpec,
        values: Dict[str, Any],
        names: Dict[str, str] | None = None,
    ):
        self.spec = spec
        self.values = values
        self.names = names or {}
        self.params: List[Any] = []

    # -- helpers ---------------------------------------------------------------

    def resolve_name(self, attr: str) -> str:
        if attr.startswith("#"):
            if attr not in self.names:
                raise ValueError(f"Unresolved name placeholder {attr}")
            return self.names[attr]
        return attr

    def resolve_value(self, ref: str) -> Any:
        if not ref.startswith(":"):
            raise ValueError(f"Expected value placeholder, got {ref}")
        if ref not in self.values:
            raise ValueError(f"Unresolved value placeholder {ref}")
        return self.values[ref]

    def is_column(self, field: str) -> bool:
        return field in self.spec.pk or field in self.spec.columns

    # -- SQL builders ----------------------------------------------------------

    def compare_sql(self, attr: str, op: str, value_ref: str) -> str:
        field = self.resolve_name(attr)
        value = self.resolve_value(value_ref)
        sql_op = "!=" if op == "<>" else op
        if self.is_column(field):
            self.params.append(value if isinstance(value, str) else str(value))
            return f'"{field}" {sql_op} %s'
        if op in ("=", "<>") and not isinstance(value, str):
            # typed equality against JSONB (bool/number/null faithfulness)
            self.params.append(json.dumps({field: value}))
            eq = "" if op == "=" else "NOT "
            return f"({eq}data @> %s::jsonb)"
        self.params.append(value if isinstance(value, str) else str(value))
        return f"(data->>'{field}') {sql_op} %s"

    def between_sql(self, attr: str, lo_ref: str, hi_ref: str) -> str:
        field = self.resolve_name(attr)
        lo, hi = self.resolve_value(lo_ref), self.resolve_value(hi_ref)
        self.params.extend([lo, hi])
        target = f'"{field}"' if self.is_column(field) else f"(data->>'{field}')"
        return f"{target} BETWEEN %s AND %s"

    def func_sql(self, fname: str, attr: str, value_ref: str | None) -> str:
        field = self.resolve_name(attr)
        if fname == "attribute_not_exists":
            if self.is_column(field):
                return f'"{field}" IS NULL'
            return f"NOT (data ? '{field}')"
        if fname == "attribute_exists":
            if self.is_column(field):
                return f'"{field}" IS NOT NULL'
            return f"(data ? '{field}')"
        value = self.resolve_value(value_ref)
        if fname == "begins_with":
            self.params.append(str(value).replace("%", r"\%").replace("_", r"\_") + "%")
            target = f'"{field}"' if self.is_column(field) else f"(data->>'{field}')"
            return f"{target} LIKE %s"
        if fname == "contains":
            self.params.append("%" + str(value).replace("%", r"\%").replace("_", r"\_") + "%")
            target = f'"{field}"' if self.is_column(field) else f"(data->>'{field}')"
            return f"{target} LIKE %s"
        raise ValueError(f"Unsupported function {fname}")


def expression_to_sql(
    expr: str,
    spec: TableSpec,
    values: Dict[str, Any],
    names: Dict[str, str] | None = None,
) -> Tuple[str, List[Any]]:
    """Translate a Dynamo expression string → (sql_fragment, params)."""
    t = Translator(spec, values, names)
    sql = _Parser(_tokenize(expr), t).parse()
    return sql, t.params
