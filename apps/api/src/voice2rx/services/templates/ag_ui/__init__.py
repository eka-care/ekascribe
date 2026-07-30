"""
AG-UI integration for the scribe template flow.

Modules:
    payloads.py        — SectionKind (LIST/TABLE/KEY_VALUE/NARRATIVE/
                         MEDICATION_TABLE), payload models, Section shell,
                         validation.
    state.py           — ScribeState (extends echo.ag_ui.AgUiState).
    state_ops.py       — apply_section_to_state() shared mutation helper.
    tools/             — LLM-callable BaseTool implementations (one per
                         kind) plus save_scribe_state helper.
    prompt_assembly.py — System prompt builder.
    run_service.py     — Per-run orchestrator wired to echo-sdk.
    resume_store.py    — Redis-backed PausedRunStore.
    storage.py         — S3 path helpers.

Generic AG-UI runtime (state base, runner, event translation, paused-run
protocol) lives in echo-sdk under echo.ag_ui — not here.

Extending the section catalogue: add a SectionKind value + payload model
+ KIND_TO_PAYLOAD entry in payloads.py, then a tool subclass in
tools/generic.py. The system prompt is intentionally kind-agnostic so
adding a kind does not require prompt changes.
"""
