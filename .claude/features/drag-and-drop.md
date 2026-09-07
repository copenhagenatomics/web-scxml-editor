# Feature: Drag and Drop (cross-cutting — three distinct mechanisms)

## Purpose

Consolidate the three genuinely distinct drag-and-drop implementations in this codebase into one place, since a search for "drag and drop" would otherwise land on only one of them. This document is a map/cross-reference, not a replacement for the detailed docs on each.

## The three mechanisms — verified as structurally distinct, not one shared implementation

### 1. Canvas node dragging (ReactFlow's own drag system)

- **What**: moving/resizing states and notes, dragging to reparent, multi-node group drag, marquee-select drag.
- **Technology**: ReactFlow's built-in `onNodeDrag*`/`onSelectionDrag*` event families — not a third-party DnD library.
- **Full detail**: `.claude/features/diagram-interaction.md`, `.claude/features/node-positioning.md`, `.claude/features/selection.md` (marquee).

### 2. File upload drag-and-drop (native HTML5 DnD)

- **What**: dragging a `.scxml`/`.xml` file from the OS file system onto the upload widget on the Welcome screen.
- **Technology**: native browser `dragover`/`drop` events (`onDrop`/`onDragOver` props on a plain `<div>` in `src/components/file-operations/file-upload.tsx`) — no library, just `event.preventDefault()`/`event.dataTransfer.files`.
- **Full detail**: `.claude/features/file-import-export.md`.
- Only available on the initial Welcome screen (`WelcomeScreen` renders `FileUpload`) — the toolbar's "Load New File" action (once a document is already open) triggers a hidden `<input type="file">` via `fileInputRef.current?.click()` instead, with no drag-and-drop affordance at that point in the flow.

### 3. List-item reordering (`@dnd-kit`)

- **What**: dragging entry/exit action rows (and internal-event reaction rows) to reorder them within the State Actions panel.
- **Technology**: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (the only third-party DnD library this app actually depends on — confirmed in `package.json`; ReactFlow's canvas drag and the native file-drop mechanism above don't use it at all).
- **Full detail**: `.claude/features/state-actions-panel.md`.
- Uses a `PointerSensor` with a 4px activation-distance constraint (avoids accidentally starting a drag on a simple click), `closestCenter` collision detection, and `verticalListSortingStrategy`.
- Row identity for drag tracking uses a client-only generated `_rowId` (uuid), **not array index** — deliberately, per an explicit code comment, because index-based identity previously caused a visual snap-back glitch (dnd-kit had no way to tell that "slot 0" now holds a different logical row after a reorder).

## Why this matters as a consolidated doc

Someone asked to "add drag-and-drop to X" needs to know **which** of these three patterns is the right one to extend or follow, since they use entirely different underlying technology and would not transfer cleanly:
- Reordering more lists in this app (e.g. a hypothetical future "reorder transitions" feature) → follow pattern 3 (`@dnd-kit`), matching `state-actions-panel.tsx`'s existing implementation and its `reorder-by-drag-event.ts` helper.
- Any new canvas manipulation gesture → must work within ReactFlow's own event model (pattern 1); introducing `@dnd-kit` or native HTML5 DnD onto the canvas itself would conflict with ReactFlow's own pointer-event handling.
- Any new "drop a file here" surface → follow pattern 2's plain native-event approach; no library needed.

## Related files

`src/components/diagram/visual-diagram.tsx` (pattern 1), `src/components/file-operations/file-upload.tsx` (pattern 2), `src/components/ui/state-actions-panel.tsx` + `src/lib/utils/reorder-by-drag-event.ts` (pattern 3).

## Tests

`src/lib/utils/reorder-by-drag-event.test.ts` (pattern 3's underlying array-move logic). No test for pattern 2's drag-and-drop handlers specifically (only the resulting file-read path is tested, per `.claude/features/file-import-export.md`). Pattern 1 has no dedicated drag-simulation test (see `.claude/features/diagram-interaction.md`'s Tests section).

## Known limitations

- `@dnd-kit` is an added dependency used for exactly one UI pattern (action-row reordering) — if a future feature needs list reordering elsewhere (e.g. reordering config fields, or a list of transitions), reusing this existing dependency/pattern is preferable to introducing a second reordering library.
