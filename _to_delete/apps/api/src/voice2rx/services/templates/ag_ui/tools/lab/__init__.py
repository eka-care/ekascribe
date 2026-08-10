"""
Lab-investigations component for the AG-UI scribe flow.

Everything lab-catalog-specific lives here, isolated from the generic
section machinery (same layout as the medication/ package):

    payloads.py — payload models (LLM-facing emit model + enriched state
                  model + SuggestedTestPill), re-exported by
                  ag_ui/payloads.py.
    search.py   — catalog search: the ranked-union SQL (prefix-or-alias /
                  full-text / fuzzy) against datasets_lab_test, Postgres +
                  CSV (debug/mock) backends, env factory.
    tool.py     — LabInvestigationsTool (add_lab_investigations) plus the
                  post-processing enrichment: match each ordered test
                  against the partner catalog, replace `investigation`
                  with the catalog display_name, keep the dictated text in
                  raw_name, attach top-5 suggestion pills and the hidden
                  lab_test_id/loinc/... coding fields.

This package intentionally has an empty import surface (no re-exports):
importing `lab` must never drag in the search/tool modules, so
ag_ui/payloads.py can depend on lab.payloads without cycles. Import the
submodule you need directly.
"""
