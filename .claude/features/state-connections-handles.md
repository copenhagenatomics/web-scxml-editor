# Feature: State Connection Points (ReactFlow Handles)

## Purpose

Give every state node physical connection points on all four sides so a user can drag out a transition from (or into) any side, and so the layout engine has a defined vocabulary of "handle sides" to reason about when auto-assigning connections. A side can also carry more than one connection point (anchors) so transitions that would otherwise converge on the same pixel can be spread out.

## User behavior

- Every state has small circular connection points on all four edges (top/bottom/left/right) — a user drags from one to another state (or the same state's own handle, for a self-loop) to create a transition.
- Hovering a handle highlights it (color change) to confirm it's a valid drag origin/target.
- Both source **and** target are supported on **every** side — a transition can be dragged out of or into any of the four sides of any state; there is no fixed "outputs only exit the bottom" convention.
- **Anchor points**: shift-clicking within ~14px of one of a state's four borders adds another connection point to that side (up to 20 per side). All connection points on that side re-space evenly (fraction `(index+1)/(count+1)` along the side) — adding a 2nd anchor to a side slides the original point from the midpoint to 1/3, and the new one sits at 2/3, etc. Existing transitions on that side visually slide to their new evenly-spaced position automatically; nothing about them needs to be edited. Undo (Ctrl+Z) removes the anchor.
- **Removing an anchor**: Alt-clicking a connection point removes it; the remaining points on that side re-space evenly. Refused with a warning toast when it's the side's only point (`LAST_ANCHOR_MESSAGE`) or a transition is attached to it (`ANCHOR_IN_USE_MESSAGE`) — the user must move/delete those transitions first. Transitions on other anchors of the same side keep their physical point (their saved handle ids are renumbered, see below).

## UI behavior

Handles render at `z-index: 10` inside the node, styled as small squares/circles (`!w-4 !h-4`) that turn blue on hover; the node's own content area is `z-index: 9999999` so hover targets don't visually conflict. Both gestures are also listed in the Visual tab's Tips popover (`editorTips` in `src/components/layout/two-tab-layout.tsx`). When `onAddAnchor` is wired, the node's outer div carries a `title` hint ("Shift-click near an edge to add a connection point") for discoverability, and the cursor switches to `crosshair` while the pointer is within the add-anchor zone with Shift held (tracked via `onMouseMove`/`onMouseLeave` plus a window `keyup` listener so releasing Shift over a stationary pointer still clears it — see `nearestBorderSide`/`nearAddableBorder` in `scxml-state-node.tsx`).

## Internal architecture

- `src/components/diagram/nodes/scxml-state-node.tsx` renders one `type='target'`/`type='source'` `<Handle>` pair per anchor on each of the four sides (`anchors?.[side] ?? 1` pairs, default 1 — the original behavior). Each pair on the same anchor shares the same `id`, since ReactFlow disambiguates by `type` + `id` together, not `id` alone.
- **Handle id scheme**: for a side with `count` anchors, index 0 keeps the bare side name (`'top'`) and indices `1..count-1` are `'top-1'`, `'top-2'`, etc. This is the key backward-compatibility trick — existing documents/tests that reference bare `'top'`/`'bottom'`/`'left'`/`'right'` keep meaning exactly what they always meant ("index 0 of that side"), and going from 1→2+ anchors needs no migration of existing transitions' `viz:sourceHandle`/`viz:targetHandle` values. `parseHandleId` (`src/lib/layout/edge-obstacle-utils.ts`) splits a handle id back into `{ side, index }`.
- **`viz:anchors` attribute** (on `<state>`/`<parallel>`/`<final>`/`<history>`): format `"side:count;side:count"`, e.g. `viz:anchors="bottom:3;right:2"`. Sides at the default count of 1 are omitted, so a diagram nobody has touched with this feature serializes identically to before this feature existed. Parsed/formatted by `parseAnchorsAttribute`/`formatAnchorsAttribute` in `src/lib/converters/converter-modules/visual-metadata.ts`, read into node data (`node.data.anchors`) by `createHierarchicalNode` in `scxml-to-xstate.ts`. `parseAnchorsAttribute` rejects non-integer counts (no `parseInt`-style truncation of trailing junk like `"2junk"`) and silently drops any count above `MAX_ANCHORS_PER_SIDE` (also exported from `visual-metadata.ts`) — since `viz:anchors` is read from user-editable XML, a hand-edited or corrupted file can't force an oversized anchor count into `scxml-state-node.tsx`'s `Array.from({ length: count })` render.
- **`AddAnchorPointCommand`** (`src/lib/commands/add-anchor-point-command.ts`) is one of the two writers of `viz:anchors` (with `RemoveAnchorPointCommand`, below) — a normal undoable Command, invoked by `handleAddAnchor` in `visual-diagram.tsx` (wired into node data as `onAddAnchor`, called by the node's own shift-click handler). Caps at `MAX_ANCHORS_PER_SIDE` (20) anchors per side; no-ops past that. The node itself also checks the cap (`sideHasRoom` in `scxml-state-node.tsx`): a full side shows no crosshair and its shift-click never reaches the command, so hitting the limit doesn't log a `console.error` (which the Next.js dev overlay would surface as an error). Instead the click shows a `warning` toast via `warnAnchorLimitReached` (host-api-store `showFeedback`), deduped so repeated clicks don't stack identical toasts. Imports the constant from `visual-metadata.ts` rather than defining its own, so the UI-side cap and the XML-parse-side cap can't drift apart.
- **`RemoveAnchorPointCommand`** (`src/lib/commands/remove-anchor-point-command.ts`, takes `stateId, side, index`) is the other writer of `viz:anchors`, invoked by `handleRemoveAnchor` in `visual-diagram.tsx` (node data `onRemoveAnchor`). It scans every `<transition>` for saved handles on this state (`viz:sourceHandle` where the transition's parent is the state, `viz:targetHandle` where `target` names it); fails if any is on the removed index, otherwise renames same-side handles with a higher index down by one (`bottom-2` → `bottom-1`; removing index 0 promotes `bottom-1` → bare `bottom`). Undo restores the count and each renamed attribute (transitions located by document-order index). The node's Alt-click handler runs in the **capture phase** (`onClickCapture`/`onMouseDownCapture`) so ReactFlow's handle listeners (click-to-connect is on by default, drag-to-connect) and node drag never see the event; it pre-checks the side count and the *rendered* edges (covers auto-assigned handles, which have no saved value) and shows the toast itself. The command's own refusal (e.g. a saved handle on a transition not drawn at this level) is surfaced by `handleRemoveAnchor` as a warning toast, not `console.error`.
- These four side strings (`'top'|'bottom'|'left'|'right'`) are the exact vocabulary used throughout the rest of the app wherever a "handle side" is referenced: `viz:sourceHandle`/`viz:targetHandle` XML attribute values (`.claude/features/visual-metadata-namespace.md`), the traffic-aware auto-handle-assignment cost model in the converter (`.claude/features/auto-layout-elk.md`), and `UpdateTransitionHandlesCommand`'s stored values. That cost model always assigns bare side ids to edges lacking a saved handle — it needed no changes for multi-anchor sides, since a bare id always resolves to index 0.
- `onConnect`/`isValidConnection` (in `visual-diagram.tsx`) intercept the drag-to-connect gesture: before creating anything, they check `wouldMergeDistinctGroups` (Initial-State-groups) and `checkNewConnectionSlotConflict` (transition slots) — see `.claude/features/initial-state-groups.md`, `.claude/features/transitions-editing.md` — and only if both pass does the connection get created via the direct object-tree edit path (not a Command — see `.claude/project/architecture.md`). Neither check is handle-aware, so an indexed handle id (`'top-1'`) passes through unchanged.
- Dragging an **existing** transition's endpoint onto a different handle/node triggers `ReconnectTransitionCommand` instead of `onConnect` (a genuinely different ReactFlow event/code path — reconnection, not creation).
- The parallel-edge label-offset axis logic in `visual-diagram.tsx` (`isVerticalConnection`) uses `parseHandleId(...).side` rather than a raw string-equality check against `edge.sourceHandle`, so it stays correct for edges anchored on an indexed handle.

## Relevant components

`src/components/diagram/nodes/scxml-state-node.tsx` (the Handle elements themselves).

## Relevant state/store

None dedicated — handle interaction is transient ReactFlow drag state, not app state.

## Relevant utilities

`src/lib/layout/edge-obstacle-utils.ts` (`getHandleAnchor` — converts a handle-side id, plus an optional anchor index/count, into an actual pixel anchor point on a node's rect at fraction `(index+1)/(count+1)` along that side; defaults to the original midpoint. `parseHandleId` splits a handle id string into `{ side, index }`). `src/lib/converters/converter-modules/visual-metadata.ts` (`parseAnchorsAttribute`/`formatAnchorsAttribute`).

## SCXML behavior

Handle-side choice is stored as `viz:sourceHandle`/`viz:targetHandle` attribute values on the `<transition>` element — purely visual/routing metadata, never affects SCXML runtime semantics (any real SCXML engine ignores these attributes entirely). Per-side anchor counts are stored as `viz:anchors` on the state element itself (not the transition) — also purely visual metadata.

## Validation rules

None — handle assignment is never validated as correct/incorrect; any handle-side value is accepted.

## Related features

- `transitions-editing.md` — what happens after a connection is made (editing event/cond/etc.).
- `initial-state-groups.md`, and the slot-conflict logic in `transitions-editing.md` — both proactively block `onConnect` before a new handle-to-handle connection is committed.
- `auto-layout-elk.md` — the traffic-aware algorithm that picks handle sides automatically for edges lacking a saved value.
- `diagram-interaction.md` — the broader canvas interaction model this connection gesture is one part of.

## Related files

`src/components/diagram/nodes/scxml-state-node.tsx`, `src/components/diagram/visual-diagram.tsx` (`onConnect`, `isValidConnection`, `handleAddAnchor`), `src/lib/commands/update-transition-handles-command.ts`, `reconnect-transition-command.ts`, `add-anchor-point-command.ts`, `remove-anchor-point-command.ts`, `src/lib/layout/edge-obstacle-utils.ts`, `src/lib/converters/converter-modules/visual-metadata.ts`, `src/lib/converters/scxml-to-xstate.ts` (`createHierarchicalNode`).

## Tests

`src/lib/commands/add-anchor-point-command.test.ts` (execute/undo, cap behavior), `remove-anchor-point-command.test.ts` (in-use/last-point refusal, renumbering, undo), `src/components/diagram/nodes/scxml-state-node.test.tsx` (shift-click add, Alt-click remove + toasts), `src/lib/layout/edge-obstacle-utils.test.ts` (`getHandleAnchor` index/count spacing, `parseHandleId`), `src/lib/converters/converter-modules/visual-metadata.test.ts` (`parseAnchorsAttribute`/`formatAnchorsAttribute`). No dedicated test file for handle *rendering*/selection itself — connection-creation logic is covered indirectly through the slot-conflict and initial-group utility tests it delegates to before allowing a connection.

## Known limitations

- Because both source and target handles share an id per anchor, and ReactFlow disambiguates purely by `(type, id)`, any code that queries "the handle with id 'top'" without also filtering by type could ambiguously match either the incoming or outgoing handle on that anchor — always specify both when working with handle DOM elements directly.
- There is no visual indication on the node of *which* side(s) already have connections before a drag starts — a user must start dragging to discover valid drop targets, there's no "available connection points" preview.
- Removing an anchor that a transition uses is refused rather than re-homing the transition to a neighbor — a deliberate safety choice. Alt (not Shift) was chosen for removal because handles on a dense side cover most of the border, so a shift-click toggle would make further adds unreachable.
- Saved `viz:waypoints` on transitions touching the state are not cleared when anchors shift (same as on add).
- The auto-layout traffic-aware handle assignment (`scxml-to-xstate.ts`) is not anchor-count-aware — it always assigns bare side ids (index 0) to edges lacking a saved handle, even on a side that has spare higher-index anchors available. Only a manually-dragged connection (or a manually shift-clicked anchor) ever lands on index ≥1.

## Important edge cases

- A self-loop (dragging from a node's handle back onto the same node) is explicitly allowed (a comment in `reconnect-transition-command.ts` notes this was previously blocked and has since been permitted) — don't reintroduce a same-node block without checking why it was removed.
- The same four-string vocabulary (`'top'|'bottom'|'left'|'right'`) must stay consistent across the node's Handle `id`s (via `parseHandleId`'s side token), the `viz:sourceHandle`/`viz:targetHandle` attribute values, and `getHandleAnchor`'s switch cases — introducing a fifth side or renaming one of these four strings requires updating all of these call sites together, or a saved/computed handle value will fail to resolve to an actual anchor point.
- Increasing a side's anchor count changes where index 0's handle sits (e.g. 50% → 33%) — any transition already attached to that bare-id handle visually slides to the new position with no attribute change of its own. This is the intended "existing connections redistribute evenly" behavior, not a bug, but it does mean a transition's rendered attachment point is not fully determined by its own `viz:sourceHandle`/`viz:targetHandle` value alone — it also depends on the current `viz:anchors` count on that state.

## Things that must NOT be changed

- Do not change the shared-id-per-anchor convention (separate ids per source/target on the same anchor) without auditing every place that constructs a handle id string, since several places assume exactly these four literal side strings plus the `-N` index suffix format.
- Do not migrate existing transitions' bare `viz:sourceHandle`/`viz:targetHandle` values to indexed ids when a side's anchor count changes — the "bare id always means index 0" rule is what makes multi-anchor sides backward compatible with every pre-existing document; migrating away from it would require a real, riskier one-time rewrite instead.

## Previous design decisions

No dedicated plan/spec document addresses the original handle model directly — "all 4 sides support both incoming and outgoing" is stated as an inline code comment in `scxml-state-node.tsx` itself, suggesting this was a deliberate design choice (maximum connection flexibility) made during initial implementation rather than a later addition. The multi-anchor extension (shift-click to add, evenly spaced, manual rather than fully automatic) was a deliberate choice confirmed with the user over a simpler "fully automatic even spacing with no anchor metadata" alternative — the user preferred explicit manual control.
