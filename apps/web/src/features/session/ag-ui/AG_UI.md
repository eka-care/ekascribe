# AG-UI editor

How streamed clinical notes are rendered, edited, and saved.

## TL;DR — the data direction

1. **JSON in** — AG-UI sends a `ScribeState`. We convert it to Tiptap JSON and push it into the editor.
2. **JSON edit** — every user edit mutates the in-memory ProseMirror Node tree. The editor never holds markdown internally.
3. **Markdown out** — on save we serialize the Tiptap JSON to markdown and upload to the backend (S3).

JSON is the source of truth at every moment the document exists in the editor. Markdown only appears at the input boundary (rare — only as a fallback) and at the output boundary (every save).

## The three-layer model

```
┌────────────────────────────┐
│  Display layer (DOM)       │  ← what the user sees
│  rendered by NodeViews     │     (React components per custom node type)
└────────────────────────────┘
            ▲
            │ React + Tiptap render from
            │
┌────────────────────────────┐
│  Edit layer (JSON tree)    │  ← what edits actually mutate
│  ProseMirror Node tree     │  ← cached in streamJsonCache for tab-switch
└────────────────────────────┘
       ▲             │
       │             │
   setJSON          getMarkdown()
       │             │
       │             ▼
┌──────────────┐  ┌──────────────┐
│ AG-UI state  │  │  Markdown    │  ← saved to backend / S3
│ (incoming)   │  │  (outgoing)  │
└──────────────┘  └──────────────┘
```

## Why JSON, not markdown, is the source of truth

The editor displays clinical-note primitives that markdown can't express losslessly:

- `sectionBlock` carries section metadata (key, kind, status, displayName) as attrs.
- `medicationTable` carries a `columns` config plus per-row data including `customFields`.
- `kvList` / `kvItem` carry key-value pairs with optional inline marks on the value.

Markdown can approximate these (headings, pipe tables, bold-prefixed lines) but cannot store the metadata. So:

- We keep JSON as the in-memory state.
- We cache JSON across tab-switches (`streamJsonCache` in `hooks/use-stream-tab.ts`).
- We only convert to markdown when persisting to the backend, because the backend storage format is markdown.

## Pipeline

### 1. JSON in

`hooks/use-stream-template-run.ts` reads SSE events and builds a `ScribeState`. Every state change triggers:

```ts
const json = scribeStateToTiptap(state);
editorRef.current?.getInstance()?.setJSON(json);
```

`editor/scribe-state-converters.ts` walks `state.sections` ordered by `order` and emits one `sectionBlock` per section. Each section's body shape depends on `section.kind`:

| Kind                | Body                                  |
| ------------------- | ------------------------------------- |
| `NARRATIVE`         | one or more paragraph / heading / list children |
| `LIST`              | one `bulletList`                      |
| `TABLE`             | one `table` (typed cells)             |
| `KEY_VALUE`         | one `kvList`                          |
| `MEDICATION_TABLE`  | one `medicationTable` (custom NodeView) |

ProseMirror validates the JSON against the schema (built from registered extensions in `editor/editor-extensions.ts`). Anything not in that extension list is silently stripped — this is why the streamed editor must use `buildScribeEditorExtensions()`.

### 2. Edit layer (JSON, not markdown)

The user sees the DOM and interacts with it (typing, clicking dropdowns, editing cells). Every interaction goes through a ProseMirror transaction that updates the Node tree.

- Typing a markdown shortcut (`## ` for heading, `- ` for list) — `tiptap-markdown` converts the shortcut into a JSON node immediately. The shortcut is a UX affordance, not the storage format.
- Pasting markdown — `transformPastedText: true` parses pasted text via `markdown-it` and inserts the resulting nodes.
- Editing a medication cell — the cell's `onChange` calls `updateAttributes` on the row's NodeViewProps, which dispatches a transaction that mutates that row's attrs.

If you ever debug "the save lost something I edited", check `editor.getJSON()` first. The edit is either in the tree (then it's a markdown-serializer bug) or not (then it's a NodeView / event bug). Don't try to read the live state via markdown — it's a one-way egress.

### 3. Markdown out

`editor.storage.markdown.getMarkdown()` walks the doc and calls each node's markdown serializer.

| Node              | Source of serializer                                  |
| ----------------- | ----------------------------------------------------- |
| `paragraph`, `heading`, `bulletList`, `listItem`, `table`, `tableCell`, `tableHeader` | `tiptap-markdown` built-ins |
| `sectionBlock`    | `editor/section-block.ts` `addStorage().markdown.serialize` |
| `medicationTable` | `editor/medication/medication-table.ts` `addStorage()` |
| `medicationRow`   | No-op (parent table emits the row)                    |
| `kvList`, `kvItem`| `editor/kv-list.ts` `addStorage()`                    |
| `typedTableCell`, `typedTableHeader` | Inherits from `tiptap-markdown`'s table handling |

The output is concatenated, then uploaded via `services/document-service.ts` → presigned S3 URL.

### Two save paths

`hooks/use-stream-tab.ts` has two distinct paths for emitting markdown:

| Path                       | Source                          | When                                   |
| -------------------------- | ------------------------------- | -------------------------------------- |
| Auto-save on stream finish | `scribeStateToMarkdown(state)`  | First save after agent finishes; uses the raw ScribeState |
| Manual save / blur / unmount | `editor.getMarkdown()`        | After any user edit                    |

Both produce markdown. The first uses the agent payload directly; the second uses the live JSON tree. The two paths should converge on the same shape; if they diverge for a given section kind, it's a bug in one of the serializers.

## Persistence mental model

```
   ┌─────────────────────────────────────────┐
   │              Backend / S3               │
   │                                         │
   │  ┌───────────────┐    ┌──────────────┐  │
   │  │  Markdown     │    │ Tiptap JSON  │  │
   │  │ (downstream   │    │ (reload      │  │
   │  │  consumers)   │    │   payload)   │  │
   │  └───────┬───────┘    └──────┬───────┘  │
   └──────────┼───────────────────┼──────────┘
              │                   │
              ▼                   ▼
   ┌─────────────────────────────────────────┐
   │                                         │
   │            Tiptap editor                │
   │                                         │
   │       JSON (in-memory Node tree)        │
   │              ▲              │           │
   │              │              │           │
   │   AG-UI ScribeState (initial load only) │
   │              ▲                          │
   └──────────────┼──────────────────────────┘
                  │
              Agent stream
```

**Three persistence layers, two save formats:**

- **Markdown** — public, lossy, for any downstream consumer (mobile app, print, exports). Built via Tiptap's markdown serializer on each save.
- **Tiptap JSON** — internal, lossless. The reload format. Persists all doctor edits (custom column options, added rows, custom field values) that markdown can't express.
- **AG-UI ScribeState** — only ever produced by the agent. Used as the initial seed for a fresh streaming session. We do **not** convert back to ScribeState from the editor.

The in-memory Tiptap JSON tree is the single source of truth while the document is open. Markdown is a one-way egress for backend consumers. The saved Tiptap JSON is what we read back to re-hydrate the editor losslessly on a future visit.

## Loading saved JSON — how rendering happens

Loading from saved JSON is the same as the streaming path after the first conversion. One line:

```ts
editor.commands.setContent(json)   // or: editorRef.getInstance().setJSON(json)
```

Internally:

1. **Validate** — `schema.nodeFromJSON(json)` walks the tree. For each node, it looks up `json.type` in the schema's nodes table:

   ```
   json.type === 'medicationTable'
                 │
                 ▼
   schema.nodes['medicationTable']   ← built from extensions registered in
                 │                      editor/editor-extensions.ts
                 ▼
        NodeSpec from Node.create({
          name: 'medicationTable',
          addAttributes: ...,
          addNodeView: () => ReactNodeViewRenderer(MedicationTableView),
          ...
        })
   ```

   Unknown types are dropped silently. Validated nodes get a real `Node` instance with attrs filled in (defaults applied for missing fields).

2. **Replace doc** — a transaction swaps the editor's current document with the new tree.

3. **Render** — the view layer walks the doc. For each node, it asks "does this `type` have an `addNodeView`?":

   - **Yes** → mount the React component via `ReactNodeViewRenderer`. The component reads `node.attrs` (and `node.content` for non-atom nodes) and draws itself. This is how `sectionBlock`, `medicationTable`, `medicationRow`, `kvList`, `kvItem` get their interactive UI.
   - **No** → ProseMirror calls the static `renderHTML()` on the spec and inserts the resulting DOM. This is how `paragraph`, `heading`, `bulletList`, the standard `table`, etc. get rendered.

The join key from JSON to React is the `type` string — the exact same string that was passed as `name` to `Node.create({...})` when the extension was defined. The schema, the JSON, and the NodeView registry are all keyed by it.

> The editor that loads the saved JSON must have the **same extension list** as the editor that produced it. Without `MedicationTable` registered, `medicationTable` nodes get stripped during validation. That's why `streamed-template-output.tsx` passes `customExtensions={buildScribeEditorExtensions()}` — the same list applies to both first-stream and reload paths.

## Two JSON shapes — don't conflate them

The JSON that AG-UI gives us is **not** the same as the JSON `editor.getJSON()` returns.

| Shape | Defined by | Looks like |
| ----- | ---------- | ---------- |
| **AG-UI ScribeState** | Backend / agent contract; `features/session/ag-ui/types.ts` | `{ sections: [{ key, kind, display_name, order, payload }, ...] }` — a flat list of typed sections, each carrying a backend-shaped payload. |
| **Tiptap JSON** | The editor's schema, built from registered extensions | `{ type: 'doc', content: [{ type: 'sectionBlock', attrs: {...}, content: [{ type: 'medicationTable', ... }] }, ...] }` — a tree of nodes whose `type` strings are extension names. |

`scribeStateToTiptap()` is the one-way bridge from AG-UI shape → Tiptap shape. There's intentionally no reverse converter. Once content is in the editor, it lives in the editor's JSON shape; we save that shape for reload, and serialize to markdown for downstream consumers.

## Adding a new custom node — checklist

To make a new node like `vitalsCard` work end-to-end:

1. **Schema** — `Node.create({ name: 'vitalsCard', group: 'block', atom: true, addAttributes: ... })`.
2. **Register** — add to `buildScribeEditorExtensions()` in `editor/editor-extensions.ts`.
3. **React view** — `addNodeView() { return ReactNodeViewRenderer(VitalsCardView) }`.
4. **Markdown serializer** — `addStorage()` returning `{ markdown: { serialize(state, node) { … } } }`. Without this, the node is dropped (or HTML-stubbed) in markdown output.
5. **HTML render/parse** — `renderHTML` + `parseHTML` if you want HTML round-trip (paste/clipboard). Optional if JSON is the only persistence path.
6. **AG-UI mapper** — if streamed from backend, add to `SectionKind` and add a `case` in `sectionToBlock()` in `editor/scribe-state-converters.ts`.
7. **Input safety** — for nodes containing form inputs (like medication cells):
   - `atom: true`, `selectable: false`
   - `addNodeView(View, { stopEvent: (e) => isInsideInput })` to prevent ProseMirror from swallowing input events
   - `contentEditable={false}` on the NodeViewWrapper so the browser doesn't treat the inputs as part of the editor's contenteditable region

If you skip step 4, edits to that node will silently vanish on the next markdown save. If you skip step 2, `setJSON` will strip the node on load. If you skip step 7 for an input-bearing node, focus jumps out and typing breaks.

## Key files

- `hooks/use-stream-template-run.ts` — SSE → `ScribeState`
- `hooks/use-stream-tab.ts` — wires the stream into the editor, manages caches and saves
- `editor/scribe-state-converters.ts` — `ScribeState` ↔ Tiptap JSON / markdown
- `editor/editor-extensions.ts` — single source of truth for the extension list
- `editor/section-block.ts` — section wrapper node + markdown serializer
- `editor/medication/medication-table.ts` — medication table node + markdown serializer
- `editor/medication/medication-row.ts` — row atom node
- `editor/kv-list.ts` — KV list/item nodes + markdown serializers
- `streamed-template-output.tsx` — the React component that mounts the editor, passes `initialJSON` + `customExtensions`
- `../components/editor/tiptap-wysiwyg-editor.tsx` — generic editor shell, exposes `setJSON` / `getJSON` / `getMarkdown` via the ref

## What's intentionally simple

- **No JSON → ScribeState** conversion. Once content is in the editor, we save markdown only. If the agent re-streams, it produces fresh JSON via `setJSON`, replacing the doc.
- **No editor-side markdown parsing for load.** We load from cached JSON (tab-switch) or rebuild from `ScribeState` (fresh stream). The markdown that backend stores is for downstream consumers, not for re-hydrating the editor.
- **No two-way sync between cached JSON and saved markdown.** They're snapshots taken at the same moment; the JSON is authoritative for re-render, markdown is authoritative for storage.
