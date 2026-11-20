# Feature: Sticky Note Annotations

## Purpose

Let a user leave free-text documentation directly on the diagram canvas, at any hierarchy level, without affecting SCXML runtime semantics.

## User behavior

- Add a note via the toolbar's note button; it appears as a 500×250 yellow post-it.
- Type text directly into it; height grows automatically as text is added.
- If text keeps growing past what auto-expansion can accommodate, further growth is blocked and an amber "Note is full — store large documentation externally" banner appears (deletions are always still allowed).
- Notes can be moved, deleted and **resized** like states (yellow `NodeResizer` handles appear when the note is selected and not being edited), but are not connectable (no transition can start/end at a note).
- A note added while drilled into a compound state is scoped to that hierarchy level — it won't appear at the root or in a sibling container.

## UI behavior

- **Base size** = the stored `viz:xywh` width × height (default 500×250 for new notes), user-resizable within `NOTE.MIN_WIDTH/MIN_HEIGHT` (200×100) and `NOTE.MAX_WIDTH/MAX_HEIGHT` (1200×1200), clamped by `clampNoteSize()`. The font-shrink → height-expand (base × 2) → "full" cascade runs relative to that base box; only the base is persisted, never the expanded height.
- During a live resize drag, height expansion is suspended so the note tracks the handles exactly; on release the cascade re-applies (so shrinking below the text's needs makes the note grow back up to 2× the dropped height, or show the "full" banner).
- Excluded from: compound-state/"has children" detection (a note living inside a state does not make that state look/behave like a compound state), edge obstacle-avoidance routing (edges may pass behind/through a note's area), and the single-click "open State Actions panel" gating (clicking a note does not try to open state actions for it).

## Internal architecture

- Identified purely by **id prefix** (`note:`, via `isNoteId()` / `VISUAL_METADATA_CONSTANTS.NOTE.ID_PREFIX`), not a `data` flag — `:` is not a valid character in an SCXML state id, so this cannot collide with a real state id.
- Rendered as a separate ReactFlow node type, `scxmlNote` → `StickyNoteNode` (`src/components/diagram/nodes/sticky-note-node.tsx`), sizing logic factored into `use-note-sizing.ts`.
- **Sizing cascade** (`computeSizing(text, width, baseHeight, allowExpansion)` in `use-note-sizing.ts`): (1) try large font at base height; (2) try small font at base height; (3) try small font at expanded height (`baseHeight × HEIGHT_EXPANSION_FACTOR`, skipped mid-resize); (4) if still overflowing, mark `isFull` and block further growth-causing keystrokes (deletion keystrokes still allowed). Text is measured via a hidden singleton off-screen `<div>` whose width is set per call to the note's content width — the same technique `measure-label-width.ts` uses for state labels.
- **Resize path**: `StickyNoteNode`'s `NodeResizer` → `data.onResize` → `handleNodeResize` in `visual-diagram.tsx` → `UpdatePositionAndDimensionsCommand` (which resolves note ids via `findNoteElement` and clamps). `UpdatePositionCommand`/`BatchUpdatePositionCommand` preserve a note's stored size on move (default size only when none is stored).
- Stored as a **`<viz:note>` XML element** (not just attributes) — a child of either the document root or a specific parent state element, and that placement is what determines its hierarchy-level scoping in the diagram (matches how real child states nest).

## Relevant components

`src/components/diagram/nodes/sticky-note-node.tsx`, `src/components/diagram/nodes/use-note-sizing.ts`.

## Relevant state/store

None dedicated — notes flow through the same node list as states; no separate note store.

## Relevant utilities

`src/lib/converters/converter-modules/note-conversion.ts` (`extractNoteNodes`, `ensureNoteIds`, `notesNeedIds`, `collectNotes` — the object-model traversal order that `BaseCommand.findNoteElement`'s DOM fallback must mirror exactly), `src/lib/commands/note-commands.ts` (`AddNoteCommand`, `UpdateNoteTextCommand`, `DeleteNoteCommand`), `src/lib/commands/base-command.ts` (`findNoteElement`, `isNoteId`).

## SCXML behavior

`<viz:note viz:id="..." viz:xywh="...">text</viz:note>` in the `http://visual-scxml-editor/metadata` namespace — explicitly documented as ignorable by any real SCXML engine (see `src/types/scxml/index.ts`'s `VizNoteElement` doc comment). Text content may be parsed as a number by `fast-xml-parser` if the note contains only digits (`#text?: string | number` in the type) — code consuming note text must handle both.

## Validation rules

None — notes are not SCXML-semantic elements and are not validated by `SCXMLValidator`.

## Related features

- `state-node-types.md` — the "has children" compound-state detection note explicitly excludes.
- `visual-metadata-namespace.md` — notes are stored via the same `viz:` namespace mechanism as layout metadata, but as an element rather than an attribute.
- `auto-layout-elk.md` — notes are appended to the node list **after** layout runs; ELK/dimension calculation never sees or positions them.

## Related files

`src/components/diagram/nodes/sticky-note-node.tsx`, `use-note-sizing.ts`, `src/lib/commands/note-commands.ts`, `src/lib/converters/converter-modules/note-conversion.ts`, `src/types/visual-metadata/index.ts` (`VISUAL_METADATA_CONSTANTS.NOTE`).

## Tests

`src/lib/commands/note-resize.test.ts` covers the resize/move commands, clamping, and `extractNoteNodes` reading the stored size. No test for `sticky-note-node.tsx` or `use-note-sizing.ts` — a gap, especially for the sizing cascade logic (font-shrink → expand → full), which depends on real DOM text measurement.

## Known limitations

- Legacy notes lacking a `viz:id` are handled via a transient `note:idx-N` fallback id (positional, one render cycle only) until `ensureNoteIds` persists a real id — code touching notes by id must be aware this fallback exists and only trust it when the candidate element genuinely has no persisted id yet (see `BaseCommand.findNoteElement`'s guard).

## Important edge cases

- `BaseCommand.findNoteElement`'s DOM-based traversal for the `note:idx-N` fallback **must** use the exact same traversal order as `collectNotes()` in `note-conversion.ts` (own notes first, then state/parallel/final children recursively, in that tag priority) — because that object-model traversal cannot preserve true document order across different tag types, the DOM fallback deliberately matches its *declared* order instead of `getElementsByTagName`'s real DOM order. If you change one traversal order, you must change the other identically or fallback-id lookups will silently resolve to the wrong note.
- A note's `#text` can come back as a JS `number` from `fast-xml-parser` if it happens to contain only digits — don't assume it's always a `string`.

## Things that must NOT be changed

- Do not change `collectNoteElementsInDeclaredOrder` (in `base-command.ts`) or `collectNotes` (in `note-conversion.ts`) independently — they must stay in lockstep, per explicit code comments in both files.
- Do not remove the resize max bounds (`NOTE.MAX_WIDTH/MAX_HEIGHT`) without revisiting the "note is full" cap — unbounded resizing would make that cap meaningless.

## Previous design decisions

The `note:` id-prefix choice is explicitly justified in `VISUAL_METADATA_CONSTANTS.NOTE.ID_PREFIX`'s comment: `':' is not valid in SCXML state ids, so this cannot collide` — a deliberate namespacing trick rather than an arbitrary prefix choice.
