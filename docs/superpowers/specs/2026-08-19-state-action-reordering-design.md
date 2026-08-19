# State Action Reordering — Design

**Date:** 2026-08-19
**Status:** Approved

## Context

`StateActionsPanel` (`src/components/ui/state-actions-panel.tsx`) lists a state's `onentry`, `onexit`, and event-reaction actions as flat lists. Execution order matters — `onentry`/`onexit` actions run sequentially, and `UpdateActionsCommand`/`UpdateInternalEventsCommand` both serialize actions to SCXML in the exact order of the array passed to them (`update-actions-command.ts:65-94`, `update-internal-events-command.ts:50-76`). Today there's no visual indication of that order, and the only way to change it is editing the SCXML source directly.

This adds an order-number badge to each row and lets users drag rows to reorder them, with the new order persisted immediately (same immediate-write pattern the existing delete button already uses).

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | All three tabs: onentry, onexit, event reactions | Requested explicitly; reactions also benefit since drag order affects which event's `<transition>` block is emitted first (see Data Model note below) |
| Numbering | `1`, `2`, `3`… badge left of each row, reflecting array index | Directly answers "what order do these run in" |
| Reorder mechanism | Drag-and-drop via a grab handle icon per row | Chosen over up/down buttons for a more direct feel |
| DnD implementation | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new dependency) | Accessible (keyboard reordering) and touch-capable out of the box; avoids hand-rolling drag events |
| Drag trigger | Only the grip handle is a drag handle | Clicking elsewhere on a row still opens it for editing, unchanged from today |
| Sortable item identity | Row's index in its array, used as the dnd-kit item id | Action rows have no persistent id (they're plain tuples); the array only mutates on drop, never mid-drag, so index-as-id is safe here — each drag session operates on a static snapshot |
| Interaction with edit form | Dragging disabled for the whole list while `formMode !== 'idle'` | Prevents `editingRowIndex` from silently pointing at the wrong row if the list reorders underneath an open edit form |
| Persistence | Reorder on drop calls `onApply`/`onApplyReactions` immediately | Matches the existing immediate-persist pattern used by row delete — no separate "save" step |
| Scope of `DndContext` | One `DndContext`/`SortableContext` around whichever tab's list is currently rendered | Only one tab's rows are mounted at a time, so a single context suffices |

## Data Model Note: Reactions Ordering

`UpdateInternalEventsCommand` groups reaction rows by event name using a `Map`, in order of each event's *first occurrence* in the array (`update-internal-events-command.ts:50-55`), then emits one `<transition>` block per event in that group order. This means dragging a reaction row can do two things simultaneously:
- Reorder `<assign>` elements within the same event's `<transition>` block.
- Change which event's `<transition>` block is emitted first (if a row is dragged above all rows of a different event).

No changes to `UpdateInternalEventsCommand` are needed — passing it a reordered flat array already produces the correct result. This is worth noting because it's why the reaction list's displayed number order (1, 2, 3…) is meaningful across different events, not just within one.

## Architecture

### New dependency: `package.json`

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Modified file: `src/components/ui/state-actions-panel.tsx`

- Add imports: `DndContext`, `closestCenter`, `PointerSensor`, `useSensor`, `useSensors` from `@dnd-kit/core`; `SortableContext`, `verticalListSortingStrategy`, `useSortable`, `arrayMove` from `@dnd-kit/sortable`; `CSS` from `@dnd-kit/utilities`; `GripVertical` from `lucide-react`.
- New small internal component, `SortableRow`, wrapping a row's existing JSX with:
  - The `useSortable({ id, disabled })` hook (`disabled` = `formMode !== 'idle'`)
  - A grip handle button (`GripVertical`, `h-3 w-3`, `cursor-grab`, dimmed → `text-default` on hover, `cursor-not-allowed` + fixed opacity when disabled) with the hook's `listeners`/`attributes` attached only to the handle, not the row
  - A number badge (`text-[10px] text-dimmed font-mono`) showing `index + 1`
  - `transform`/`transition` style from `CSS.Transform.toString(transform)` applied to the row wrapper for drag animation
- New handler `handleDragEnd(list, setList, onApplyFn, event)`:
  - Resolves `active.id` / `over.id` (both are string indices) to numbers
  - Computes `arrayMove(list, oldIndex, newIndex)`
  - Updates local state and calls `onApply`/`onApplyReactions` immediately, mirroring `handleDelete`
- Wrap the row-mapping block for whichever tab is active in a `DndContext` (`collisionDetection={closestCenter}`, `sensors={useSensors(useSensor(PointerSensor))}`, `onDragEnd`) and a `SortableContext` (`items` = row indices as strings, `strategy={verticalListSortingStrategy}`)
- The in-progress "adding" row (rendered after the mapped rows when `formMode === 'adding'`) is not part of the `SortableContext` items and has no handle/number — it isn't part of the persisted array yet
- A row currently swapped for its inline edit form (`formMode === 'editing' && editingRowIndex === index`) renders the form only, same as today — no handle/number for that row while it's open

No other files change. `onApply` / `onApplyReactions` props and `UpdateActionsCommand` / `UpdateInternalEventsCommand` are unchanged — reordering is just another array mutation flowing through the same existing path.

## UI Behaviour

Row layout, left to right: `[⠿ grip handle] [# badge] [row content] ... [✕ delete, on hover]` — matches the existing row's hover-reveal delete button pattern.

- Grip handle is always visible (low-opacity), not hover-only, so users can discover drag affordance without hovering the whole row first.
- While any row in the tab is being added or edited, all grip handles in that tab show a disabled state (dimmer, `cursor-not-allowed`) and don't respond to drag gestures.
- Dragging a row to a new position reorders it, immediately persists via the existing `onApply`/`onApplyReactions` path, and pushes an undo entry exactly like any other action edit (delete/apply already go through `UpdateActionsCommand`/`UpdateInternalEventsCommand`, both of which support undo).
- Keyboard users can Tab to a grip handle and use Space to pick up, Arrow keys to move, Space to drop (dnd-kit's built-in keyboard sensor behavior).

## Data Flow

```
User drags a row's grip handle to a new position
  → dnd-kit fires onDragEnd(event) with active/over indices
  → handleDragEnd computes arrayMove(currentList, oldIndex, newIndex)
  → setLocalEntry/setLocalExit/setLocalReactions(reordered)
  → onApply(toStrings(reordered), ...) / onApplyReactions(reordered)
  → VisualDiagram.handleNodeActionsChange / handleNodeInternalEventsChange
  → UpdateActionsCommand / UpdateInternalEventsCommand rebuilds XML in new order
  → onSCXMLChange(newContent, 'property') fires
  → useHistoryStore.pushEntry(newContent) — undo available
```

## Reused Utilities

- `UpdateActionsCommand` / `UpdateInternalEventsCommand` — unchanged, already order-preserving
- `Panel` primitive layout — unchanged
- Existing hover-delete button pattern — kept, unchanged

## Verification

1. Add three `onentry` actions → badges show `1`, `2`, `3` in the order added.
2. Drag row 3 to position 1 → badges update to reflect new order; switching to the code view (or re-opening the panel) shows the `<onentry>` element's children reordered to match.
3. Undo (Ctrl+Z) after a drag reorder → order reverts to pre-drag state.
4. Repeat steps 1–3 for `onexit`.
5. In event reactions, add rows for two different events interleaved, then drag a row from event B above all rows of event A → resulting SCXML emits event B's `<transition>` block before event A's.
6. Click "+ Add action" (or click a row to edit it) → grip handles in that tab become disabled/non-interactive until the form is closed (Apply or Discard).
7. Drag-reorder using only the keyboard (Tab to handle, Space, Arrow keys, Space) → row moves, same as mouse drag.
8. Single-row list → dragging is a no-op, no errors.
9. Delete a row after reordering → remaining rows renumber correctly and the deleted row's data doesn't reappear.
