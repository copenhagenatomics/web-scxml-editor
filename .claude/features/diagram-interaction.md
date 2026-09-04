# Feature: Canvas Interaction (Select / Drag / Resize / Multi-Select / Copy-Paste / Reparent / Delete / Create)

## Purpose

The full set of direct-manipulation gestures on the ReactFlow canvas that let a user build and rearrange a state machine visually without touching XML.

## User behavior

- **Create**: toolbar "S" (New State) button adds a root-level state at a free grid slot; a note button adds a sticky note.
- **Select**: click selects one state and opens the State Actions panel; Ctrl/Cmd+click toggles multi-select membership; dragging a box on empty canvas while holding Ctrl/Meta marquee-selects everything inside.
- **Move**: drag a state (or a multi-selection) to reposition; all simultaneously-dragged nodes commit as a single batched undo step.
- **Resize**: select a single state, drag its resize handles (`NodeResizer`, min size enforced).
- **Reparent**: drag a state onto another to nest it as a child (works for both single-node and multi-node drags).
- **Copy/cut/paste**: Ctrl/Cmd+C copies the selection (states clone with fresh ids, subtree included); Ctrl/Cmd+X cuts (copies, then deletes the selection); Ctrl/Cmd+V pastes with an escalating offset per repeated paste so pasted copies don't stack exactly on top of each other. The Multi-Select Toolbar exposes the same Copy/Cut/Delete actions as buttons.
- **Delete**: Delete/Backspace removes selected state(s) or transition(s); disabled while the Validation panel is open.

## UI behavior

- Selection is visually indicated per-node (not React Flow's default multi-select box UI, except during an actual marquee drag).
- The Multi-Select Toolbar appears only once 2+ nodes are selected.
- A drop target is highlighted while dragging a node over a potential new parent (reparent affordance).

## Internal architecture

All of this lives in `src/components/diagram/visual-diagram.tsx` (3,347 lines — the largest file in the repo; see `.claude/project/architecture.md`).

- **Selection is not ReactFlow's native model**, except during a real marquee drag. `handleStateClick` hand-rolls click/double-click/Ctrl-click disambiguation using a 250ms timer (`clickTimeoutRef`/`clickCountRef`) to distinguish a plain click (replace selection, open State Actions panel) from a double-click and from a Ctrl-click (toggle membership in `activeStates: Set<string>`). A `marqueeStartedRef` flag gates when RF's own native `'select'`-type node-change events (which fire unconditionally during a real box-drag) are allowed to update `activeStates` — outside of an active marquee, those native events are ignored so they don't fight with `handleStateClick`'s own logic.
- **Drag**: `handleNodesChange` filters RF's native change events, tracks `isDraggingRef`, and distinguishes an actual drag from a mere click or arrow-key nudge (`dragging === true` OR ≥1px position delta — RF's own keyboard-nudge changes never set `dragging: true`). Position commits are debounced 150ms and, for a multi-selection, **all simultaneously-moved nodes are batched into one `BatchUpdatePositionCommand`** rather than one command per node.
- **Resize**: live preview during drag mutates `setNodes` directly (visual only); on `onResizeEnd`, `handleNodeResize` commits via `UpdatePositionAndDimensionsCommand`.
- **Reparent**: two separate ReactFlow drag-event families — `onNodeDrag*` (single node) and `onSelectionDragStart/Drag/DragStop` (multi-selection, since RF renders a group drag through a distinct `.react-flow__nodesselection-rect` overlay) — both funnel into the same `computeDropTarget` logic. There is no drag-to-unnest gesture (the "Back to parent" drop zone was removed); moving a state back out to its grandparent requires editing the SCXML directly.
- **Copy/paste**: uses the **direct object-tree manipulation path** (`scxml-manipulation-utils.ts`'s `cloneStateSubtreeWithFreshIds`), not a Command — see `.claude/project/architecture.md` §Two mutation strategies. Buffered in `useStateClipboardStore`.
- **Create/Connect**: `handleAddRootState`/`onConnect` also use the direct object-tree path, not Commands.
- **Delete**: `handleNodeDelete` routes to `DeleteNoteCommand` or `DeleteNodeCommand` based on `isNoteId(id)`.

## Relevant components

`src/components/diagram/visual-diagram.tsx` (owns essentially everything above), `src/components/diagram/multi-select-toolbar.tsx`, `src/components/diagram/nodes/scxml-state-node.tsx` (renders the `NodeResizer` when selected+resizable).

## Relevant state/store

- `useStateClipboardStore` (`stores/state-clipboard-store.ts`) — copy/paste buffer for state subtrees.
- Local component state in `visual-diagram.tsx` (`activeStates`, `selectedTransitions`, `dropTargetId`, various refs) — not in a Zustand store, since it's all canvas-session-scoped, not app-wide.

## Relevant utilities

`src/lib/utils/scxml-manipulation-utils.ts` (`findStateById`, `addStateToDocument`, `createStateElement`, `cloneStateSubtreeWithFreshIds`, `rewriteOrDropTransitions`, `detachStateFromParent`, `isDescendantOf`), `src/lib/utils/initial-group-utils.ts` and `src/lib/utils/transition-slot-rules.ts` (both consulted by `onConnect` to block invalid new connections before they're created).

## SCXML behavior

Create/paste/reparent mutate the parsed object tree directly (not via Commands, not via DOM). Reparenting a state changes its actual XML nesting position (moving the `<state>` element under a new parent element), which can change its Initial-State-group membership and its dimension-calculation context.

## Validation rules

`onConnect` and `isValidConnection` proactively call `checkNewConnectionSlotConflict` (transition slots) and `wouldMergeDistinctGroups` (Initial State groups) to **block** an invalid connection at creation time, showing a dismissible banner (`connectionBlockedMessage`, rendered by `initial-group-conflict-banner.tsx` — reused for both kinds of block despite the filename). This is separate from, but consistent with, the static validators that catch the same violations if introduced via hand-edited XML (`scxml-validation.md`).

## Related features

- `state-node-types.md` — what a node actually renders as depending on `stateType`.
- `transitions-editing.md` — the `onConnect` gesture's target feature.
- `initial-state-groups.md` — the specific rule `onConnect`/reparent can trip.
- `undo-redo-history.md` — every one of these gestures eventually reaches `onSCXMLChange`, which tracks into history with a `changeType` hint.

## Related files

`src/components/diagram/visual-diagram.tsx`, `src/components/diagram/multi-select-toolbar.tsx`, `src/lib/commands/batch-update-position-command.ts`, `update-position-and-dimensions-command.ts`, `delete-node-command.ts`, `note-commands.ts`, `src/lib/utils/scxml-manipulation-utils.ts`.

## Tests

`src/components/diagram/multi-select-toolbar.test.tsx` covers the toolbar component. `src/lib/utils/scxml-manipulation-utils.test.ts` covers the underlying clone/reparent/detach logic. No test directly drives the full drag/drop/marquee interaction inside `visual-diagram.tsx` itself (would require e2e, which this repo doesn't have).

## Known limitations

- New-connection, add-root-state, copy/paste, and reparent are **not** independently undoable Command objects — see `.claude/project/architecture.md`. They only become undoable because the resulting content string still gets pushed into the same linear history as everything else; there's no per-operation undo metadata beyond a generic description.
- Two browser-specific workarounds live directly in this file: a Windows trackpad pinch-zoom scaling fix patched onto the d3-zoom instance, and a scroll-drift correction after clicking a `ControlButton` (both would otherwise silently misalign hit-testing for marquee-select). Don't delete these thinking they're unused dead code — they fix real, previously-observed bugs.

## Important edge cases

- A marquee-select drag and a Ctrl-click on a node use *different* selection code paths that must not fight each other — `marqueeStartedRef` exists specifically to arbitrate which one "owns" a given `'select'`-type change event from ReactFlow.
- Multi-node drag goes through a visually and structurally different ReactFlow event family (`onSelectionDrag*`) than single-node drag (`onNodeDrag*`) — a fix to one path does not automatically apply to the other; both call sites need to be checked together.

## Things that must NOT be changed

- Do not "clean up" the Windows pinch-zoom or scroll-drift workarounds without confirming (on real hardware/OS) that the underlying ReactFlow/browser bug they patch has actually been fixed upstream.
- Do not merge the single-node and multi-node drag-to-reparent code paths without preserving both entry points' current behavior — the long comment block in the file explicitly explains why both are needed.

## Previous design decisions

A long comment block in `visual-diagram.tsx` (around the `handleNodesChange` implementation) explains that ordinary Ctrl/Cmd-click multi-select is driven by the app's own `activeStates` set specifically because ReactFlow's built-in box-select overlay unconditionally emits native `'select'` changes that would otherwise fight with the hand-rolled click-count logic in `handleStateClick` — this is a deliberate, documented workaround for a real conflict between two selection models, not an accidental complexity.
