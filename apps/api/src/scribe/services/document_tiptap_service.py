from __future__ import annotations
import json
import logging
from decimal import Decimal
from typing import Any
from scribe.repositories.document_tiptap_orm import DocumentTiptapORM
from scribe.core.exceptions import TiptapJsonNotFound, InvalidTiptapJson

logger = logging.getLogger(__name__)

_tiptap_orm = DocumentTiptapORM()
_JSON_STRING_FIELDS = ("tiptap_json", "agui_state")
def _encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _decode_json(value: Any) -> Any:
    if isinstance(value, str):
        return json.loads(value)
    return _normalize_decimals(value) 


def _normalize_decimals(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, list):
        return [_normalize_decimals(v) for v in value]
    if isinstance(value, dict):
        return {k: _normalize_decimals(v) for k, v in value.items()}
    return value

def save_tiptap_json(
    document_id: str,
    tiptap_json: dict[str, Any],
    *,
    orm: DocumentTiptapORM | None = None,
) -> dict:
    if not isinstance(tiptap_json, dict) or not tiptap_json:
        raise InvalidTiptapJson("tiptap_json must be a non-empty dict")

    _orm = orm or _tiptap_orm
    _orm.upsert_tiptap_json(
        document_id=document_id, tiptap_json=_encode_json(tiptap_json)
    )
    return {"tiptap_json": tiptap_json}


def get_tiptap_json(
    document_id: str,
    *,
    orm: DocumentTiptapORM | None = None,
) -> dict[str, Any]:
    _orm = orm or _tiptap_orm
    item = _orm.get_tiptap_json(document_id=document_id)
    if item is None:
        raise TiptapJsonNotFound(document_id)
    return _decode_json(item["tiptap_json"])


def save_agui_state(
    document_id: str,
    agui_state: dict[str, Any],
    *,
    orm: DocumentTiptapORM | None = None,
) -> dict:
    if not isinstance(agui_state, dict) or not agui_state:
        raise ValueError("agui_state must be a non-empty dict")

    _orm = orm or _tiptap_orm
    _orm.upsert_agui_state(
        document_id=document_id, agui_state=_encode_json(agui_state)
    )
    return {"agui_state": agui_state}


def get_document_record(
    document_id: str,
    *,
    orm: DocumentTiptapORM | None = None,
) -> dict[str, Any] | None:
    _orm = orm or _tiptap_orm
    item = _orm.get_record(document_id=document_id)
    if item is None:
        return None
    record = _normalize_decimals(item)
    for field in _JSON_STRING_FIELDS:
        if field in item:
            record[field] = _decode_json(item[field])
    return record


def get_agui_state(
    document_id: str,
    *,
    orm: DocumentTiptapORM | None = None,
) -> dict[str, Any] | None:
    record = get_document_record(document_id, orm=orm)
    if not record:
        return None
    return record.get("agui_state")