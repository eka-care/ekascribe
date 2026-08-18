"""
Markdown structuring for the note template flow (post-AG-UI).

Modules:
    markdown_notes.py — system-prompt builder, SSE frame helper, streaming
                        LLM relay, and the legacy typed-sections→markdown
                        converter.
    run_service.py    — MarkdownRunService: one streaming call per note,
                        persisted to the document blob on completion.
    chat/             — document chat as markdown regenerate-and-replace.

The AG-UI pipeline (typed sections, emit tools, ScribeState, pause/resume)
was removed; see git history for the last AG-UI revision.
"""
