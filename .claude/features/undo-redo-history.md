# Feature: Undo / Redo History

## Purpose

Let a user reverse any change made through either the code editor or the visual diagram, with sensible grouping so that e.g. rapid typing or a drag gesture becomes one undo step rather than dozens.

## User behavior

- Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y redoes, both also available as toolbar buttons.
- Typing quickly groups into one undo step (500ms debounce); dragging/resizing a node groups into one step per drag/resize gesture (300ms debounce after the pointer stops moving); structural changes (delete, rename, add) are each their own immediate step.
- History persists for the session but is cleared/reinitialized whenever a new file is loaded, a new document is created, or content is pulled from GitHub.

## UI behavior

- `UndoRedoControls` (toolbar buttons) reflect availability via `canUndo()`/`canRedo()` — disabled when there's nothing to undo/redo.
- While the **code editor has keyboard focus**, Ctrl+Z/Y are intercepted by **Monaco's own native undo stack first** — this app's history is not what fires in that moment. This is why pasting a whole replacement document into Monaco is deliberately kept as a single Monaco undo step (see `monaco-code-editor.md`) — so a user hitting Ctrl+Z right after a big paste doesn't have to press it dozens of times to get back their prior document.

## Internal architecture

- **Not a two-stack undo/redo system.** `useHistoryStore` (`src/stores/history-store.ts`) holds one flat array `entries: HistoryEntry[]` plus a single `currentIndex` cursor. `undo()` decrements the index and returns the entry now pointed at; `redo()` increments and returns the entry moved to. Pushing a new entry first truncates everything after `currentIndex` (discards redo future), then trims from the front if `entries.length > maxSize` (default 50).
- Every `HistoryEntry.content` is the **entire SCXML string** at that point in time — there is no diffing, patching, or storage of Command objects. "Undo" = "look up the string at index-1 and set it as current content."
- `HistoryManager` (`src/lib/history/history-manager.ts`, singleton via `getInstance()`) is a **debouncing façade** in front of the store — it does not implement undo/redo logic itself, only decides *when* to actually push an entry:
  - `trackTextEdit(content)` — 500ms debounce, independent timer.
  - `trackNodeMove(nodeId, content)` / `trackNodeResize(nodeId, content)` — 300ms debounce each, independent timers.
  - `trackAction(type, content, description)` / `trackDiagramChange(content, meta, hint)` / `trackNodeOperation(...)` / `trackEdgeOperation(...)` — immediate (no debounce), used for structural changes.
  - `trackDiagramChange`'s `hint` parameter (`'position'|'resize'|'structure'|'property'`) routes to the debounced or immediate path as appropriate.
- `clear()` cancels all pending debounce timers and clears the store — called on new-file-load, not just at app startup.

## Relevant components

- `src/components/ui/undo-redo-controls.tsx` — toolbar buttons.
- `src/app/_hooks/use-history-restore.ts` — `handleHistoryRestore(content, actionType)`, the single function both undo and redo call into; sets the `isUpdatingFromHistory` guard flag for 100ms around `setContent()`.

## Relevant state/store

- `useHistoryStore` (`stores/history-store.ts`) — the actual data.
- `useEditorStore.content` — what gets overwritten on undo/redo.

## Relevant utilities

`src/lib/history/history-manager.ts` (the debouncing façade described above).

## SCXML behavior

None specific — this feature operates on the content string generically, regardless of what SCXML changed.

## Validation rules

None — undoing/redoing does not re-validate synchronously beyond the normal debounced validation effect reacting to the restored `content` like any other content change.

## Related features

- `two-way-sync.md` — every change from either the code or visual side flows through this same history-tracking call.
- `monaco-code-editor.md` — the Monaco-native-undo-takes-priority behavior and the paste-normalization workaround that depends on it.

## Related files

`src/stores/history-store.ts`, `src/lib/history/history-manager.ts`, `src/types/history/index.ts`, `src/app/_hooks/use-history-restore.ts`, `src/components/ui/undo-redo-controls.tsx`.

## Tests

No dedicated test file for `history-manager.ts` or `history-store.ts` was found in this pass — this is a gap; the debouncing timing logic in particular (multiple independent timers with different durations) is currently unverified by automated tests.

## Known limitations

- **History size scales with document size × entry count.** Every entry is a full string copy of the whole document (capped at 50 entries) — for a large SCXML file, this could be a meaningful memory footprint, and there is no compression/diffing to reduce it.
- No "what changed in this step" capability exists — you cannot show a diff for a given undo step, only jump to it.
- History is entirely in-memory (via the Zustand store) — refreshing the page loses all history, even though the current `content` itself may separately persist via other means (it doesn't currently; there's no autosave/localStorage for content itself).

## Important edge cases

- `useHistoryStore.undo()` tags the returned entry with the **outgoing** entry's `actionType` (for UI messaging about what's being undone), not the target entry's own type — do not assume `actionType` on an undo result describes the content you're navigating *to*.
- `redo()`, by contrast, returns the entry being redone **with its own actionType** — the tagging convention differs by direction; this is intentional (confirmed by store code comments), not an inconsistency to fix.
- Undo/redo restoring content sets `isUpdatingFromHistory = true` for exactly 100ms — any new mutation entry point added elsewhere in the app must check this flag before calling `historyManager.track*()`, or undo/redo will start creating new history entries for its own restoration (infinite-loop-adjacent bug).

## Things that must NOT be changed

- Do not change the debounce durations (500ms text, 300ms position/resize) without checking `README.md`'s user-facing description of "Text changes are grouped together (if you type quickly)" and without re-testing rapid drag-then-release interactions — these values are tuned to feel like one gesture = one undo step.
- Do not remove the whole-document-snapshot approach for a "smarter" diff-based history without first fixing the two-mutation-strategy split (Commands vs. direct object-tree edits) described in `.claude/project/architecture.md` — a diff-based history would need every mutation site to produce a consistent diff format, which currently isn't true.

## Previous design decisions

`DEVELOPER_GUIDE.md` describes a completely different (and never-implemented, or since-replaced) design: separate `undoStack`/`redoStack` arrays with `shift()`-based trimming, a `HistoryEntry.actionType` union that matches what's actually implemented, but a `HistoryManager` API surface (`getUndoStack()`, `getRedoStack()`) that doesn't exist on the real singleton. Do not use that doc as a reference for this feature — see `.claude/decisions/state-management.md` #2 for the corrected rationale.
