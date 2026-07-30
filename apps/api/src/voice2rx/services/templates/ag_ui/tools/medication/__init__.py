"""
Medication component for the AG-UI scribe flow.

Everything medication-specific lives here, isolated from the generic
section machinery:

    payloads.py — payload models (LLM-facing emit model + enriched state
                  model) AND the shared payload primitives
                  (StrictModel/ColumnType/TableColumn), which
                  ag_ui/payloads.py re-exports.
    search.py   — catalog search: the ranked-union SQL (prefix /
                  full-text / fuzzy) against datasets_medication,
                  Postgres + CSV (debug/mock) backends, env factory.
    tool.py     — MedicationTableTool (add_medication_table) plus the
                  post-processing enrichment: match each dictated drug
                  against the partner catalog, replace drug_name, keep
                  the dictated text in raw_name, attach top-5 suggestion
                  pills and the hidden medication_id code.

This package intentionally has an empty import surface (no re-exports):
importing `medication` must never drag in the search/tool modules, so
ag_ui/payloads.py can depend on medication.payloads without cycles.
Import the submodule you need directly.
"""
