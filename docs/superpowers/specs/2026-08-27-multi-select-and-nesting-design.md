# Multi-Select, Copy/Paste, and Drag-to-Nest States — Design

**Date:** 2026-08-27
**Status:** Approved

## Context

`VisualDiagram` (`src/components/diagram/visual-diagram.tsx`) already has more multi-state plumbing than it looks like at first glance:

- `activeStates: Set<string>` already supports multiple selected states via Ctrl/Cmd+click (`handleStateClick`, lines 1152-1252), and dragging any selected node already moves the whole selection together (React Flow's native behavior) with positions batched and persisted via `BatchUpdatePositionCommand` (`handleNodesChange`, lines 1255-1454).
- Multi-delete already works end-to-end: the `Delete` key handler (lines 2649-2653) already calls `handleNodesChange` with a `remove` change per selected id, and `DeleteNodeCommand` already accepts `string[]`.
- What's genuinely missing: a marquee/box-select gesture, any copy/paste for whole states, and any way to nest a state into another (or pull it back out) via drag-and-drop. The XML/data model already supports arbitrary-depth nesting (`StateElement.state?: StateElement | StateElement[]`), but the canvas only ever shows one hierarchy level at a time via a "drill-down" navigation model (`use-hierarchy-navigation.ts`, `editor-store.ts`'s `HierarchyState`) — there is no nested-box rendering to drop onto.

This design adds: (1) marquee select, (2) a small multi-select toolbar, (3) copy/paste for one or more states (including nested subtrees), and (4) drag-and-drop nesting/un-nesting that works within the existing drill-down model.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Marquee select gesture | Ctrl/Cmd+drag on empty canvas (`selectionKeyCode={['Control', 'Meta']}`) | Plain drag already pans the canvas (`panOnDrag={true}`); changing that would break existing muscle memory. Started as Shift+drag (React Flow's `selectionKeyCode` default) since box-select was already mechanically active on Shift, but was changed to Ctrl/Cmd to match the modifier already used for click-based multi-select (`handleStateClick`'s `event.ctrlKey \|\| event.metaKey`), so drag-based and click-based multi-select share one consistent modifier. React Flow calls `onNodesChange` with `'select'`-type changes during box-select rather than mutating node state internally — those are filtered out everywhere else (`handleNodesChange`, `change.type !== 'select'`) but specifically consumed when `marqueeStartedRef` is set, to drive `activeStates`. |
| How marquee reaches `activeStates` | New `onSelectionChange` prop on `<ReactFlow>`, not the filtered `onNodesChange` path | `onSelectionChange` fires with the exact `{ nodes, edges }` React Flow considers selected (from box-select or otherwise) independent of the `onNodesChange` change-list, so we can sync it into `activeStates` without touching the existing structural-change filtering. |
| Marquee replace vs. additive | Replaces `activeStates` with the box's contents | No modifier-stacking needed — Ctrl/Cmd+click remains the way to fine-tune a selection after a marquee. |
| Marquee scope | Only nodes in the current drill-down level, excludes `scxmlNote` | Matches existing Ctrl+click selection semantics; notes don't have an actions panel today either. |
| Multi-select toolbar | New floating pill, shown when `activeStates.size >= 2`, with a count and Copy/Delete buttons | Single-selection behavior (opens `StateActionsPanel`) is unchanged. Discoverable entry point for group actions; Delete just calls the already-working multi-delete path, Copy triggers the new clipboard action below. |
| Keyboard shortcuts | Ctrl/Cmd+C copies the current `activeStates`, Ctrl/Cmd+V pastes | Guarded by checking `document.activeElement` isn't an `input`/`textarea`/`contenteditable`, so it doesn't shadow normal text-field copy/paste elsewhere in the app. |
| Clipboard mechanism | New in-memory store `src/stores/state-clipboard-store.ts` (Zustand), not `navigator.clipboard` | Same reasoning as the existing `action-clipboard-store.ts`: this runs in a VSCode webview where the OS clipboard is unreliable. Session-local is fine for a same-session copy/paste. |
| What copy captures | Full XML subtree of each selected state (via `findStateById`, deep-cloned) plus any transition where both source and target are in the copied set | A compound state's descendants are already inside its XML subtree, so "copy the whole subtree" falls out for free — no separate shallow/deep logic needed. Cross-boundary transitions (to a state outside the copied set) are dropped rather than dangling. |
| Paste id handling | `<original-id>_copy`, bumping to `_copy2`, `_copy3`, ... on collision, checked against the whole document | Deterministic and debuggable; matches the existing id-uniquification style used elsewhere (e.g. `handleAddRootState`'s `state_1`, `state_2`, ...). |
| Paste position | Original `viz:xywh` + fixed offset (e.g. +40px/+40px), stacking further on repeated pastes of the same clipboard | Keeps the pasted group's relative layout intact; avoids exact overlap on repeat paste. Matches common diagram-tool behavior (Visio/Figma/draw.io). |
| Paste target parent | Whatever parent is currently active in the drill-down view (root, or the compound state you're drilled into) | Lets copy/paste double as a way to move a group of states into a different compound state, by copying in one view and pasting in another. |
| Paste transitions | Internal (copied-to-copied) transitions are recreated between the new ids | Keeps the pasted group functional as a self-contained mini-graph, per copy-time capture above. |
| Post-paste selection | Newly created states become the new `activeStates` | Lets the user immediately drag the pasted group into place. |
| Nesting drop gesture | Drop a dragged state (or multi-selection) onto another (non-selected) state's body | Continuously highlighted during drag via `onNodeDrag` bounding-box containment against the pointer; on `onNodeDragStop`, if the drop lands on a highlighted target, reparent instead of just moving. |
| Multi-select nesting | Dragging a 2+ selection onto a target nests the whole selection under it in one action | Consistent with how multi-move already treats the selection as one unit. |
| Un-nesting gesture | Drag a child state onto a small new "Back to parent" drop-zone overlay rendered inside the canvas itself (only visible while drilled into a compound state) | The app's actual breadcrumb/"up" control lives in `two-tab-layout.tsx`, an unrelated layout component that reads navigation state from the global `editor-store` — it has no access to canvas drag internals (`activeStates`, drag position). Wiring real drag-and-drop onto it would require threading drag state across that component boundary into an unrelated file. A small dedicated drop-zone rendered inside `VisualDiagram` itself (e.g. a `<Panel position="top-left">` shown only when `currentParentId` is set) achieves the same UX — a clear target to drag a child onto to pop it up a level — without that cross-component coupling. |
| Reparent validation | Disallow dropping a state onto itself, one of its own descendants, or a `final`/`history` node | Prevents cycles and invalid SCXML containers. Invalid targets simply never highlight during drag. |
| Reparent XML mechanics | New `detachStateFromParent(scxmlDoc, stateId): StateElement` helper — NOT `removeStateFromDocument` | `removeStateFromDocument` also strips every transition elsewhere in the document that *targets* the removed state (correct for delete, wrong for a move/reparent, where all transitions must survive). The new helper only extracts the `StateElement` from its current parent's `state` array/object, with `initial`-attribute bookkeeping on the *old* parent (same cleanup `removeStateFromDocument` already does, minus the transition-stripping), leaving the extracted subtree and every transition untouched for re-insertion via `addStateToDocument`. |
| New parent's `initial` attribute | Reparent ensures the new parent has a valid `@_initial` after gaining its first child (compound states require one) | Same invariant `removeStateFromDocument`'s `stripInitialTokenRecursive` already enforces on removal; reparenting needs the mirror-image fix-up on the receiving parent. |
| Mutation architecture | Plain handler functions (parse → mutate the fast-xml-parser object model → serialize → `onSCXMLChange(content, 'structure')`), not new `BaseCommand` subclasses | Investigated the existing command classes (`RenameStateCommand`, `DeleteNodeCommand` in `src/lib/commands/`) and found they parse to a DOM `Document` and mutate via `querySelector`/`setAttribute` — a different representation from the fast-xml-parser object model (`StateElement`, `@_id`) that `scxml-manipulation-utils.ts` and the hierarchy/rendering code use. Undo/redo is a full-content snapshot stack (`history-store.ts`) driven purely by each `onSCXMLChange` call — `Command.undo()` methods are never actually invoked anywhere in the app. `handleAddRootState` (`visual-diagram.tsx:2237`) already establishes the exact pattern needed here: `parserRef.current.parse()` → mutate via `scxml-manipulation-utils.ts` helpers → `parserRef.current.serialize()` → `onSCXMLChange(updated, 'structure')`. Paste and reparent follow that same shape instead of introducing a second, parallel mutation mechanism. |
| `viz:xywh` format | Comma-separated `"x,y,width,height"`, set directly as a string | Confirmed as the canonical/live format (`visual-metadata-manager.ts:362`, all position commands' `split(',')`, and `handleAddRootState`'s own direct assignment). `scxml-manipulation-utils.ts`'s `createStateElement`/`updateStatePosition` space-separated branches are dead code paths (never hit with the arguments any current caller actually passes) — new code must not follow that format. |
| Undo/redo | No special handling needed — each paste/reparent action is one `onSCXMLChange` call, which is automatically one undo step via the existing snapshot history | Consistent with `handleAddRootState` and every other structural mutation in this file. |

## Architecture

### New file: `src/stores/state-clipboard-store.ts`

```ts
interface CopiedStateGroup {
  states: StateElement[];        // deep-cloned subtrees, as copied
  internalTransitions: TransitionElement[]; // transitions between two copied states
}

interface StateClipboardState {
  copied: CopiedStateGroup | null;
  copy: (group: CopiedStateGroup) => void;
}
```

Mirrors `action-clipboard-store.ts`'s shape (single `copied` slot, replaced on each copy, not cleared on paste so repeated pastes work).

### New file additions to `src/lib/utils/scxml-manipulation-utils.ts`

- `detachStateFromParent(scxmlDoc, stateId): StateElement | null` — locates and removes the state's `StateElement` from wherever it currently sits (root or nested), fixing up the *old* parent's `@_initial` if it was pointing at the removed child, but leaving transitions untouched. Returns the detached subtree for re-insertion.
- `isDescendantOf(scxmlDoc, candidateId, ancestorId): boolean` — used by drag-to-nest validation to block dropping a state onto its own descendant.
- `cloneStateSubtreeWithFreshIds(state, existingIds, idOffset): { clone: StateElement; idMap: Map<string,string> }` — deep-clones a state and every descendant, assigning each a fresh unique id (`_copy`/`_copyN` suffix, checked against `existingIds`), rewriting the clone's own `@_initial` via the id map, and offsetting each cloned state's `@_viz:xywh` x/y by `idOffset`. Building block for paste.
- `rewriteOrDropTransitions(state, idMap): void` — walks a cloned subtree's `transition` lists (at every depth) and rewrites `@_target` through `idMap` where present, deleting the transition entirely where the target isn't in `idMap` (points outside the copied set).

### Modified: `src/components/diagram/visual-diagram.tsx`

Both new mutation flows follow `handleAddRootState`'s existing shape exactly: `parserRef.current.parse(scxmlContent)` → mutate the resulting `SCXMLDocument` via the utilities above → `parserRef.current.serialize(doc, true)` → `onSCXMLChange(updated, 'structure')`. No new `BaseCommand` subclasses — undo/redo is already automatic per `onSCXMLChange` call via the full-content snapshot history (`history-store.ts`), the same as every other structural mutation in this file.

- **`handleCopySelection`**: reads `activeStates`, deep-clones each selected state's `StateElement` (via `findStateById` on the parsed doc) into the clipboard store, unmodified (no id/position changes at copy time — those happen at paste time).
- **`handlePasteClipboard`**: reads the clipboard, parses current content, runs `cloneStateSubtreeWithFreshIds` per copied state (accumulating one combined id map across all copied states so cross-state transitions resolve), then `rewriteOrDropTransitions`, then `addStateToDocument(doc, clone, currentParentId)` per clone, serializes, calls `onSCXMLChange`, and sets `activeStates` to the new top-level ids.
- **`handleReparent(stateIds, targetParentId)`**: parses current content, validates each id via `isDescendantOf` (skips/no-ops invalid ones), `detachStateFromParent` + `addStateToDocument(doc, detached, targetParentId)` per id, fixes the new parent's `@_initial` if it just gained its first child, serializes, calls `onSCXMLChange`.
- Add `onSelectionChange={(params) => syncMarqueeSelection(params.nodes)}` to `<ReactFlow>` — merges box-selected node ids into `activeStates` (excluding `scxmlNote` nodes), replacing the previous selection.
- Add `onNodeDrag`/`onNodeDragStop` handlers: during drag, compute whether the pointer/dragged-node bounds overlap another node's bounds (excluding nodes currently in `activeStates`) and track a `dropTargetId` in state for highlighting; on drag stop, if `dropTargetId` is set and valid, call `handleReparent` instead of the normal position-persist path; otherwise fall through to today's `BatchUpdatePositionCommand` flow unchanged.
- New small "Back to parent" drop-zone, rendered as a `<Panel position="top-left">` inside the existing `<ReactFlow>` tree, shown only when `currentParentId` is set; tracks drag-over the same way as a nesting target and calls `handleReparent(draggedIds, grandparentId)` on drop, where `grandparentId` is looked up from `parsedData.nodes` (the dragged state's current parent's own `parentId`).
- New small `MultiSelectToolbar` component (or inline JSX), rendered when `activeStates.size >= 2`, wired to the same `handleNodesChange`-based delete path and `handleCopySelection`/`handlePasteClipboard`.
- New `useEffect` keydown handler alongside the existing Delete-key effect (lines 2642-2658) for Ctrl/Cmd+C / Ctrl/Cmd+V, guarded against text-input focus.

### Modified: `scxml-state-node.tsx`

- Accept an optional `isDropTarget` flag (from node `data`) to render the highlight ring/glow while a valid drag-to-nest target is hovered.

## Data Flow

```
Ctrl/Cmd+drag on empty canvas
  → React Flow's built-in box-select (selectionKeyCode=['Control', 'Meta'])
  → onSelectionChange({ nodes }) fires
  → syncMarqueeSelection replaces activeStates with the box's node ids (minus notes)

Ctrl/Cmd+C with activeStates non-empty
  → handleCopySelection parses scxmlContent, reads each state's XML subtree via findStateById (deep clone)
  → useStateClipboardStore.copy({ states: clones })

Ctrl/Cmd+V (or toolbar Paste)
  → handlePasteClipboard reads clipboard + current drill-down parent id (currentParentId)
  → parses scxmlContent
  → cloneStateSubtreeWithFreshIds per copied state → combined idMap + position-offset clones
  → rewriteOrDropTransitions per clone using the combined idMap
  → addStateToDocument(doc, clone, currentParentId) per clone
  → serialize + onSCXMLChange(updated, 'structure') → undo entry pushed via full-content snapshot
  → activeStates set to the new top-level ids

Drag a (multi-)selection onto another state's body
  → onNodeDrag computes overlap each frame → sets dropTargetId (if isDescendantOf allows it) → target node highlights
  → onNodeDragStop: dropTargetId valid
      → handleReparent(selectedIds, dropTargetId)
      → parses scxmlContent; per id: detachStateFromParent (old-parent initial fixup, transitions untouched) + addStateToDocument under dropTargetId + new-parent initial fixup
      → serialize + onSCXMLChange(updated, 'structure')
      → moved nodes disappear from the current (now-stale) drill-down view

Drag a child state onto the in-canvas "Back to parent" drop-zone
  → same handleReparent path, targetParentId = grandparent id (or undefined for root)
```

## Reused Utilities

- `findStateById`, `addStateToDocument` — existing, unchanged.
- `parserRef.current.parse`/`.serialize`, `onSCXMLChange(content, 'structure')` — existing mutation shape, same as `handleAddRootState`.
- `activeStates` (`Set<string>`) — existing selection state, extended by marquee/paste/reparent instead of only Ctrl+click.
- `DeleteNodeCommand`, `BatchUpdatePositionCommand` — existing multi-node support, unchanged, just wired to the new toolbar.
- History/undo (`history-store.ts` full-content snapshot stack) — existing pattern; new mutations get undo for free by calling `onSCXMLChange` once per user action, same as every other structural change in this file.

## Verification

1. Ctrl/Cmd+drag a box over 3 states → all 3 become selected (highlighted); plain drag elsewhere still pans the canvas.
2. Ctrl+click to remove one of the 3 from the marquee selection → toolbar count updates to 2.
3. With 2+ states selected, click the toolbar's Delete → both removed in one undo step.
4. Select 2 connected states (A → B transition), Ctrl+C, drill into a different compound state, Ctrl+V → two new states appear offset from nothing (pasted relative to each other), with a transition between the pasted pair; undo removes both states and the transition in one step.
5. Copy a compound state with 2 children → paste → pasted compound state has both children intact, with fresh but internally-consistent ids.
6. Paste twice in a row without re-copying → second paste's states are offset further and get `_copy2` ids.
7. Drag a state onto another state's body → target highlights during drag; on drop, dragged state vanishes from the current view; drilling into the target reveals it as a new child.
8. Attempt to drag a compound state onto its own child → target never highlights (blocked).
9. While drilled into a parent, drag one of its children onto the in-canvas "Back to parent" drop-zone → child vanishes from the current view; navigating up shows it as a sibling of the former parent.
10. Multi-select 2 sibling states and drag both onto a third state's body → both become children of the target in one undo step.
