"""
Backend tools for the AG-UI note flow.

Sub-packages:
    generic_tools/  — the generic emit machinery: one BaseTool per
                      SectionKind (generic.py), the tool_prompts.yaml
                      catalog (catalog.py), and save_scribe_state.

This __init__ is intentionally inert (no imports) to avoid import
cycles through ag_ui.payloads. Import the sub-package you need directly
(e.g. `from .tools.generic_tools import MeetingNoteTool`).
"""
