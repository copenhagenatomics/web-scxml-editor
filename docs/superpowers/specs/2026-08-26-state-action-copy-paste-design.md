# State Action Copy/Paste — Design

**Date:** 2026-08-26
**Status:** Approved

## Context

`StateActionsPanel` (`src/components/ui/state-actions-panel.tsx`) shows a state's `onentry`, `onexit`, and event-reaction actions, each editable via an inline form. Today, moving one action's values (e.g. an assign action's Location/Expression) to another state requires: open the source state's panel, click the row to open its inline edit form, read a field, close/switch to the target state, open its panel, click Add, type the value in — then repeat that whole open/close cycle for the second field. There is no copy/paste, clone, or clipboard pattern anywhere in the app to reuse.

This adds a per-row Copy button and a header Paste button so a full action (both fields, or all reaction fields) can be moved to another state — or duplicated within the same state — in one copy and one paste, instead of two round trips per field.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Clipboard mechanism | New in-memory Zustand store (`src/stores/action-clipboard-store.ts`), not `navigator.clipboard` | This runs inside a VSCode webview, where the OS clipboard API is unreliable (iframe sandboxing/permissions). An in-memory store is simple, reactive (so the Paste button's enabled state updates live), and matches the existing `useHostAPIStore` pattern already used in this file. Resets on page reload — acceptable for a same-session copy. |
| Scope | Only `assign` rows (onentry/onexit) and reaction rows | These are the only row types the panel can create or edit today (`handleRowClick` ignores `send`/`cancel`, and the Add form only ever builds an `AssignActionRow` or reaction row). `send`/`cancel` rows have no paste destination, so a copy button on them would be dead-end UI. |
| Copy affordance | New `Copy` icon button per row, next to the existing hover-reveal delete `X` | Consistent placement with the row's only other action button; same hover-reveal treatment. |
| Paste affordance | New `ClipboardPaste` icon button in the sub-header, next to the existing `+` Add button | Header-level because paste isn't about any one row — it targets whichever tab is active. |
| Paste interaction | Appends a new row immediately (no form), same as clicking Add and Apply in one step | Confirmed with user: matches the existing immediate-commit pattern already used by row delete/reorder. User edits the pasted row afterward (click it to open the edit form) if it needs changes. |
| Paste enablement | Disabled (with tooltip) unless the clipboard holds an item whose `kind` matches the active tab | `onentry`/`onexit` accept `kind: 'action'`; `reactions` accepts `kind: 'reaction'`. Prevents pasting a reaction's shape into an assign list or vice versa. |
| Paste button title | Always "Paste action" when enabled, regardless of tab (not "Paste reaction" on the reactions tab) | Simpler implementation, one fewer conditional; "action" reads fine as a generic term for either row kind and the button's disabled/enabled state already carries the compatibility signal. |
| Cross-tab paste | Allowed between `onentry` and `onexit` | Both use the same `AssignActionRow` shape; no reason to restrict which action-tab a copied assign action can land in. |
| Repeated paste | Clipboard is not cleared after pasting | Lets a user paste the same copied action into several states without re-copying each time. |
| Feedback | `showFeedback('Action copied.', 'info')` / `showFeedback('Action pasted.', 'info')` | Matches the existing `useHostAPIStore` feedback-toast convention already used elsewhere in this file (e.g. `'Action saved.'`, `'Reaction saved.'`). |

## Architecture

### New file: `src/stores/action-clipboard-store.ts`

```ts
import { create } from 'zustand';

export type CopiedAction =
  | { kind: 'action'; row: AssignActionRow }
  | { kind: 'reaction'; row: InternalEventActionRow };

interface ActionClipboardState {
  copied: CopiedAction | null;
  copy: (item: CopiedAction) => void;
}

export const useActionClipboardStore = create<ActionClipboardState>((set) => ({
  copied: null,
  copy: (item) => set({ copied: item }),
}));
```

`AssignActionRow`/`InternalEventActionRow` currently live as local (unexported) types inside `state-actions-panel.tsx`. Add `export` to both and have the store `import type { AssignActionRow, InternalEventActionRow } from '@/components/ui/state-actions-panel'` — a type-only import is erased at compile time, so it doesn't create a runtime circular dependency even though the panel also imports the store. `_rowId` is never stored in the clipboard — it's assigned fresh (`uuidv4()`) on paste, same as any other new row.

### Modified file: `src/components/ui/state-actions-panel.tsx`

- Import `useActionClipboardStore` and a `Copy` / `ClipboardPaste` icon from `lucide-react`.
- **`SortableActionRow`**: add an optional `onCopy` prop. When provided, render a `Copy` icon button next to the existing delete `X`, same hover-reveal (`opacity-0 group-hover:opacity-100`) styling, `stopPropagation` on click so it doesn't trigger the row's edit-open handler.
- **Row copy handlers**: `handleCopyRow(row)` for assign rows (only called when `row.type === 'assign'`) and `handleCopyReaction(row)` for reaction rows — each strips `_rowId` and calls `useActionClipboardStore.getState().copy({ kind: ..., row: {...} })`, then `showFeedback('Action copied.', 'info')`.
- **Paste button**: in the sub-header next to the existing Add `+` button. `disabled` when `copied` is `null` or `copied.kind` doesn't match the active tab's expected kind. `title` reads "Paste action" when enabled (always this text, regardless of tab), or "Copy an action first" when disabled.
- **`handlePaste`**: mirrors `handleDelete`'s immediate-commit shape rather than `handleApply`'s form-commit shape:
  - For `onentry`/`onexit`: build `{ ...copied.row, _rowId: uuidv4() }`, append to `currentList`, `setLocalEntry`/`setLocalExit`, call `onApply(toStrings(updated), toStrings(otherList))`.
  - For `reactions`: same append shape into `localReactions`, call `onApplyReactions(updated)`.
  - `showFeedback('Action pasted.', 'info')`.

No changes to `UpdateActionsCommand`, `UpdateInternalEventsCommand`, or `visual-diagram.tsx` — paste flows through the exact same `onApply`/`onApplyReactions` props as every other mutation in this panel.

## UI Behaviour

Row layout, left to right: `[⠿ grip handle] [# badge] [row content] ... [copy] [✕ delete]` — copy sits left of delete, both hover-reveal, both `stopPropagation` so clicking either doesn't open the row for editing.

Sub-header layout: `[stateId] ... [📋 paste] [+ add]` — paste sits left of add, grayed out until something compatible is copied.

## Data Flow

```
User clicks Copy on a row
  → handleCopyRow/handleCopyReaction strips _rowId
  → useActionClipboardStore.copy({ kind, row })
  → showFeedback('Action copied.')

User switches to another state (or another tab) and clicks Paste
  → handlePaste reads useActionClipboardStore.getState().copied
  → builds a new row with a fresh _rowId
  → setLocalEntry/setLocalExit/setLocalReactions(updated)
  → onApply(...) / onApplyReactions(updated)
  → VisualDiagram.handleNodeActionsChange / handleNodeInternalEventsChange
  → UpdateActionsCommand / UpdateInternalEventsCommand rebuilds XML
  → onSCXMLChange fires → undo entry pushed
  → showFeedback('Action pasted.')
```

## Reused Utilities

- `useHostAPIStore`'s `showFeedback` — existing toast convention, unchanged.
- `onApply` / `onApplyReactions` — existing immediate-commit path already used by delete/reorder.
- `SortableActionRow` — extended, not replaced.

## Verification

1. Copy an assign action from state A's onentry, switch to state B, click Paste on onentry → new row appears with identical Location/Expression; undo (Ctrl+Z) removes it.
2. Paste is disabled (with tooltip) on a fresh panel where nothing has been copied yet.
3. Copy an assign action, switch to the `reactions` tab → Paste stays disabled (kind mismatch).
4. Copy a reaction row, switch to `onentry` → Paste stays disabled; switch back to `reactions` → Paste is enabled.
5. Copy an onentry assign action, paste it into `onexit` on the same state → succeeds (cross-tab, same kind).
6. Paste the same copied action twice in a row → two independent rows appear, each removable/editable independently.
7. Copy, then click a row's copy button on a *different* row → clipboard replaces with the new row; pasting produces the second row's values, not the first's.
8. Click a pasted row afterward → opens the normal inline edit form, pre-filled with the pasted values, editable like any other row.
