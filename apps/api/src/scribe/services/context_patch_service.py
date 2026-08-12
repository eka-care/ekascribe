from typing import Any, Dict, Iterable, List, Optional

_CONTEXT_STRING_LIST_FIELDS = ("documents",)


def _clean(values: Optional[Iterable[Any]]) -> List[str]:
    """Drop None/empty-string entries, coerce to str, preserve order."""
    if not values:
        return []
    cleaned: List[str] = []
    for v in values:
        if v is None:
            continue
        s = str(v)
        if not s:
            continue
        cleaned.append(s)
    return cleaned


def _clean_attachments(values: Optional[Iterable[Any]]) -> List[Dict[str, Any]]:
    """Normalise attachment entries, drop any without an 'id'."""
    if not values:
        return []
    cleaned: List[Dict[str, Any]] = []
    for v in values:
        if v is None:
            continue
        if isinstance(v, dict) and v.get("id"):
            cleaned.append(v)
    return cleaned


def _clean_past_sessions(values: Optional[Iterable[Any]]) -> List[Dict[str, Any]]:
    """Normalise past_sessions to [{session_id, date_epoch, title}].

    Tolerates legacy string entries (treated as session_id with no date) and
    legacy dicts stored before `title` existed (title comes back None).
    """
    if not values:
        return []
    cleaned: List[Dict[str, Any]] = []
    for v in values:
        if v is None:
            continue
        if isinstance(v, dict) and v.get("session_id"):
            cleaned.append({
                "session_id": str(v["session_id"]),
                "date_epoch": v.get("date_epoch"),
                "title": v.get("title"),
            })
        elif isinstance(v, str) and v:
            cleaned.append({"session_id": v, "date_epoch": None, "title": None})
    return cleaned


def _extract_past_session_ids(values: Optional[Iterable[Any]]) -> set:
    """Pull session_ids out of either dicts or bare strings."""
    ids: set = set()
    if not values:
        return ids
    for v in values:
        if isinstance(v, dict) and v.get("session_id"):
            ids.add(str(v["session_id"]))
        elif isinstance(v, str) and v:
            ids.add(v)
    return ids


def _dedupe_preserve_order(values: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for v in values:
        if v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def _dedupe_attachments(values: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """De-duplicate attachments by 'id', keeping the last occurrence's data."""
    seen: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for v in values:
        aid = v["id"]
        if aid not in seen:
            order.append(aid)
        seen[aid] = v
    return [seen[aid] for aid in order]


def _dedupe_past_sessions(values: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """De-duplicate past_sessions by session_id; later writes win on date_epoch."""
    seen: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for v in values:
        sid = v["session_id"]
        if sid not in seen:
            order.append(sid)
        seen[sid] = v
    return [seen[sid] for sid in order]


def merge_context_append(
    existing: Optional[Dict[str, Any]],
    patch: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Union each list field of `existing` with `patch`, de-duped."""
    existing = existing or {}
    patch = patch or {}
    merged: Dict[str, Any] = {}
    for field in _CONTEXT_STRING_LIST_FIELDS:
        combined = _clean(existing.get(field)) + _clean(patch.get(field))
        merged[field] = _dedupe_preserve_order(combined)

    combined_past_sessions = (
        _clean_past_sessions(existing.get("past_sessions"))
        + _clean_past_sessions(patch.get("past_sessions"))
    )
    merged["past_sessions"] = _dedupe_past_sessions(combined_past_sessions)

    combined_attachments = (
        _clean_attachments(existing.get("attachments"))
        + _clean_attachments(patch.get("attachments"))
    )
    merged["attachments"] = _dedupe_attachments(combined_attachments)

    return merged


def merge_context_remove(
    existing: Optional[Dict[str, Any]],
    patch: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Remove values in `patch` from each list field of `existing`."""
    existing = existing or {}
    patch = patch or {}
    merged: Dict[str, Any] = {}
    for field in _CONTEXT_STRING_LIST_FIELDS:
        to_remove = set(_clean(patch.get(field)))
        merged[field] = [v for v in _clean(existing.get(field)) if v not in to_remove]

    session_ids_to_remove = _extract_past_session_ids(patch.get("past_sessions"))
    merged["past_sessions"] = [
        p for p in _clean_past_sessions(existing.get("past_sessions"))
        if p["session_id"] not in session_ids_to_remove
    ]

    ids_to_remove = {a["id"] for a in _clean_attachments(patch.get("attachments"))}
    merged["attachments"] = [
        a for a in _clean_attachments(existing.get("attachments"))
        if a["id"] not in ids_to_remove
    ]

    return merged


def append_document_to_context(
    existing: Optional[Dict[str, Any]], document_id: str
) -> Dict[str, Any]:
    """Shortcut for appending a single document_id to context.documents."""
    return merge_context_append(existing, {"documents": [document_id]})
