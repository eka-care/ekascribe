"""
Shared text-matching helpers for catalog enrichment (medication / lab).

Stdlib-only leaf module — safe to import from any ag_ui module without
creating cycles.
"""

import re
from difflib import SequenceMatcher
from typing import FrozenSet


def canon(text: str) -> str:
    """Alphanumeric-only lowercase — 'Dolo 650 Mg' == 'dolo-650mg'."""
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def name_similarity(query: str, name: str) -> float:
    """Prefix-aware, punctuation/spacing-insensitive similarity.

    Catalog names carry long suffixes ('Dolo 650 mg (Paracetamol) Tab
    15s'), so a plain full-string ratio punishes a perfect head match.
    Compare the canonical query against both the full canonical name and
    the name truncated to the query's length, and keep the best.
    """
    q, n = canon(query), canon(name)
    if not q or not n:
        return 0.0
    full = SequenceMatcher(None, q, n).ratio()
    head = SequenceMatcher(None, q, n[: len(q)]).ratio()
    return max(full, head)


def token_set(text: str) -> FrozenSet[str]:
    """Order-insensitive word identity — 'MRI Knee' == 'knee MRI'."""
    return frozenset(re.findall(r"[a-z0-9]+", (text or "").lower()))
