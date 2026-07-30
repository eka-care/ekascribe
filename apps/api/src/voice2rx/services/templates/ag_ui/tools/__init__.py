"""
Backend tools for the AG-UI scribe flow.

Sub-packages:
    generic_tools/  — the generic emit machinery: one BaseTool per
                      SectionKind (generic.py), the tool_prompts.yaml
                      catalog (catalog.py), and save_scribe_state.
    medication/     — the medication component (payloads / catalog
                      search / add_medication_table + enrichment).
    lab/            — the lab-investigations component (payloads /
                      catalog search / add_lab_investigations +
                      enrichment).

This __init__ is INTENTIONALLY inert (no imports). ag_ui/payloads.py
imports medication/lab payload models through this package, which
triggers this module first — an eager import of generic_tools here
would cycle back through generic.py -> ag_ui.payloads. Import the
sub-package you need directly (e.g. `from .tools.generic_tools import
MeetingNoteTool`).
"""
