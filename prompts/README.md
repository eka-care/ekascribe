# Prompts (file provider)

Consumed by echo's `FilePromptProvider` (`ECHO_PROMPT_PROVIDER=file`,
`ECHO_PROMPT_DIR` pointing here) and by voice2rx's built-in .md fallback.

Naming: Langfuse prompt names with `/` flattened to `_`
(e.g. `voice2rx/summary/agent` → `voice2rx_summary_agent.md`).

Formats:
- `<name>.md` — whole file is the task prompt; `{{var}}` placeholders are
  substituted (Langfuse semantics — literal `{}` JSON braces are untouched).
- `<name>.yaml` — `prompt` plus optional `role` / `goal` / `backstory` /
  `expected_output` / `version` (the fields Langfuse kept in its config blob).
- `<name>/<version>.yaml` + `production` pointer file — versioned layout.

The .md files here are the prompts checked into voice2rx-be. Prompts that
lived ONLY in Langfuse (integration `{template_id}-voice2rx` prompts and
markdown template content) must be exported and dropped in here — see the
plan doc (Langfuse selective export, decision #10).
