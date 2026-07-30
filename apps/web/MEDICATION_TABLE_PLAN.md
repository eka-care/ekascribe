# Medication Table — Implementation Plan

## 1. Overview

Build a custom Tiptap medication table that replaces the generic `table` node for medication sections. The table features drug autocomplete, dropdown-based cells, dynamic columns, and Notion-like inline editing.

### How It Works End-to-End

```
AG-UI streams a section
  ↓
section.kind === 'MEDICATION_TABLE' ?
  ├─ YES → medicationMapper() → medicationTable + medicationRow nodes
  └─ NO  → existing paths (TABLE, LIST, KEY_VALUE, NARRATIVE)
  ↓
Tiptap renders medicationTable via custom React NodeView
  ↓
Doctor edits inline (autocomplete, dropdowns, free text)
  ↓
On save → editor.getJSON() produces { type: "medicationTable", ... }
        → serializer produces markdown fallback
        → both sent to backend
  ↓
On reload → JSON loads the interactive table directly
          → if JSON fails → markdown fallback (generic table, no dropdowns)
```

---

## 2. Architecture

### Identification

Backend sends `section.kind = 'MEDICATION_TABLE'` as a distinct kind. No key-matching needed — it's a first-class section kind alongside `LIST`, `TABLE`, `KEY_VALUE`, `NARRATIVE`.

### Tiptap Node Hierarchy

```
sectionBlock (existing — wraps the section with header/status)
  └─ medicationTable (new — the interactive table)
       ├─ medicationRow (new — one per medication)
       ├─ medicationRow
       └─ ...
```

`medicationTable` is a block node with:
- `sectionKey: string` — stable section identifier
- `columns: MedicationColumnDef[]` — active columns (predefined + custom)

`medicationRow` is an atom node (fully React-managed) with:
- Dynamic attrs: one per active column key (e.g., `drug_name`, `dosage`, `frequency`)
- `customFields: Record<string, string>` — values for user-added custom columns

### Column System

Backend always sends these 5 columns in the MEDICATION_TABLE payload:

| Column | Key (from BE) | Always Present |
| --- | --- | --- |
| Medicine | `drug_name` | Yes |
| Dosage | `dosage` | Yes |
| Frequency | `frequency` | Yes |
| Duration | `duration` | Yes |
| Notes | `notes` | Yes |

**Full predefined columns** — the ideal medication table. Columns not sent by the agent can be added by the doctor:

| Column | Key | Kind | Options |
| --- | --- | --- | --- |
| Medicine | `drug_name` | autocomplete | Drug search API |
| Dosage | `dosage` | dropdown | ½ tablet, 1 tablet, 1½ tablets, 2 tablets, 1 capsule, 2 capsules, 5 ml, 10 ml, 15 ml, 1 puff, 2 puffs |
| Frequency | `frequency` | dropdown | Once a day (OD), Twice a day (BD), Thrice a day (TDS), Four times a day (QID), 1-0-0, 0-1-0, 0-0-1, 1-0-1, 1-1-0, 0-1-1, 1-1-1, SOS, Every 4 hours, Every 6 hours, Every 8 hours, Every 12 hours, Once a week, Twice a week, At bedtime (HS) |
| Timing | `timing` | dropdown | Before meal, After meal, With meal, Empty stomach, Before breakfast, After breakfast, Before lunch, After lunch, Before dinner, After dinner, At bedtime, Morning, Evening |
| Duration | `duration` | dropdown | 1 day, 2 days, 3 days, 5 days, 7 days, 10 days, 14 days, 1 week, 2 weeks, 3 weeks, 4 weeks, 1 month, 2 months, 3 months, 6 months, As directed, Until next visit, Ongoing/Lifelong |
| Route | `route` | dropdown | Oral, Topical, IV, IM, Subcutaneous, Inhalation, Sublingual, Rectal, Nasal, Ophthalmic, Otic, Transdermal |
| Quantity | `quantity` | dropdown | 1–30, 1 strip, 2 strips, 1 bottle, 1 tube, 1 packet, 1 box |
| Instructions | `notes` | text | Free text (header displays "Instructions", maps to BE key `notes`) |

All dropdowns support free text input (combobox).

**Dynamic columns:**
- Initial render shows the 5 BE columns (`drug_name`, `dosage`, `frequency`, `duration`, `notes`) + any additional columns the agent sends
- Agent headers are matched against predefined columns by key
- Unmatched agent headers → rendered as free-text columns
- "+" button (existing UI pattern) adds a blank column → header cell has inline dropdown to pick remaining predefined columns (timing, route, quantity, etc.) or type a custom name

---

## 3. Folder Structure

```
src/features/session/ag-ui/editor/medication/
├── medication-columns.ts        ← Column config, dropdown options
├── medication-table.ts          ← Tiptap Node extension for medicationTable
├── medication-row.ts            ← Tiptap Node extension for medicationRow
├── medication-mapper.ts         ← AG-UI TABLE payload → medicationTable/Row Tiptap JSON
├── medication-serializer.ts     ← medicationTable Tiptap JSON → markdown
├── medication-table-view.tsx    ← React NodeView: table shell, headers, add/delete col/row
├── medication-row-view.tsx      ← React NodeView: single row with cells
├── cells/
│   ├── autocomplete-cell.tsx    ← Drug name search (mocked API for now)
│   ├── dropdown-cell.tsx        ← Combobox: predefined options + free text
│   └── text-cell.tsx            ← Plain text input (instructions, custom columns)
└── add-column-header.tsx        ← Inline header dropdown for new column type selection
```

**Modified existing files:**
- `editor-extensions.ts` — register MedicationTable + MedicationRow
- `scribe-state-converters.ts` — add medication branch in TABLE handling
- `table-add-buttons.tsx` — reuse existing UI for medication table add row/column

---

## 4. Dual Storage (design now, integrate later)

### Save Payload

```ts
type DocumentSavePayload = {
  tiptap_json: JSONContent | null;   // editor.getJSON() — source of truth
  markdown: string | null;           // regenerated fallback
};
```

### Load Fallback

```
1. Try tiptap_json → validate → setContent → render (full fidelity)
2. If fails → parse markdown → setContent → render (degraded, no dropdowns)
3. If fails → show raw markdown read-only + error banner
```

---

## 5. Tasks

### Task 1 — Column config & types
**Files:** `medication-columns.ts`, modify `streaming/types.ts`
**What:**
- Add `'MEDICATION_TABLE'` to `SectionKind` union in `types.ts`
- Define `MedicationColumnKind` type (`'autocomplete' | 'dropdown' | 'text'`)
- Define `MedicationColumnDef` type (`{ key, label, kind, options? }`)
- Export `PREDEFINED_MEDICATION_COLUMNS` array with all predefined columns and their dropdown options (keyed as `drug_name`, `dosage`, `frequency`, `timing`, `duration`, `route`, `quantity`, `notes`)
- Export helper: `getColumnDef(key: string) → MedicationColumnDef | undefined`

**No dependencies.**

---

### Task 2 — Tiptap extensions
**Files:** `medication-table.ts`, `medication-row.ts`, `editor-extensions.ts`
**What:**
- `medicationTable` node: `group: 'block'`, `content: 'medicationRow+'`, attrs for `sectionKey` and `columns`
- `medicationRow` node: `group: 'block'`, `atom: true`, dynamic attrs for cell values + `customFields`
- Register both in `buildScribeEditorExtensions()`

**Depends on:** Task 1 (types)

---

### Task 3 — Section mapper
**Files:** `medication-mapper.ts`, modify `scribe-state-converters.ts`
**What:**
- `mapMedicationPayload(section)` → `{ medicationTable node with medicationRow children }`
- Match agent headers against predefined columns by key
- Unmatched headers → custom free-text columns
- In `scribe-state-converters.ts`, add `case 'MEDICATION_TABLE'` branch in `sectionToBlock` that calls the medication mapper

**Depends on:** Task 1, Task 2

---

### Task 4 — MedicationTableView (table shell)
**Files:** `medication-table-view.tsx`
**What:**
- React NodeView rendering: header row with column labels, slot for child rows
- Drag handle (visual ≡, no reorder) per row
- Delete row (trash icon) per row
- Reuse existing add row/column button pattern from `table-add-buttons.tsx`
- Delete column on header hover

**Depends on:** Task 2

---

### Task 5 — Cell components
**Files:** `cells/dropdown-cell.tsx`, `cells/autocomplete-cell.tsx`, `cells/text-cell.tsx`
**What:**
- `DropdownCell` — combobox: filterable option list + free text input. Used by dose, frequency, timing, duration, route, quantity
- `AutocompleteCell` — text input with popover showing mocked drug search results
- `TextCell` — plain text input for instructions and custom columns

**Depends on:** Task 1 (options)

---

### Task 6 — MedicationRowView (row rendering)
**Files:** `medication-row-view.tsx`
**What:**
- Reads active columns from parent `medicationTable`
- Renders one cell per column using the appropriate cell component (based on column kind)
- Updates row attrs on cell change
- Tab navigation between cells

**Depends on:** Task 4, Task 5

---

### Task 7 — Add column (inline header)
**Files:** `add-column-header.tsx`
**What:**
- Clicking existing "+" button adds blank column to medication table
- New header cell shows inline dropdown: remaining predefined columns + type custom name
- Selecting predefined column → activates its kind + options
- Typing custom name → free-text column
- Updates `columns` attr on medicationTable + adds default empty value to all rows

**Depends on:** Task 4, Task 6

---

### Task 8 — Markdown serializer
**Files:** `medication-serializer.ts`, modify `scribe-state-converters.ts`
**What:**
- `medicationTableToMarkdown(node)` → pipe-delimited markdown table
- Add branch in markdown serialization path for `medicationTable` nodes

**Depends on:** Task 2

---

### Task 9 — Dual storage payload & load fallback
**Files:** new types file or in existing types, modify save/load hooks
**What:**
- Define `DocumentSavePayload` type
- Implement `loadDocument()` with try JSON → try markdown → raw text fallback
- Stub integration points (backend wiring later)
- Degraded mode banner component

**Depends on:** Task 8

---

## 6. Execution Order

```
Task 1 (config & types)
  ↓
Task 2 (tiptap extensions)
  ↓
Task 3 (section mapper)      Task 5 (cell components)
  ↓                             ↓
Task 4 (table view)  ←──────────┘
  ↓
Task 6 (row view)
  ↓
Task 7 (add column)
  ↓
Task 8 (markdown serializer)
  ↓
Task 9 (dual storage)
```

Each task is a self-contained unit. Get approval → implement → review → next task.
