# Feature: State Connection Points (ReactFlow Handles)

## Purpose

Give every state node physical connection points on all four sides so a user can drag out a transition from (or into) any side, and so the layout engine has a defined vocabulary of "handle sides" to reason about when auto-assigning connections.

## User behavior

- Every state has small circular connection points on all four edges (top/bottom/left/right) — a user drags from one to another state (or the same state's own handle, for a self-loop) to create a transition.
- Hovering a handle highlights it (color change) to confirm it's a valid drag origin/target.
- Both source **and** target are supported on **every** side — a transition can be dragged out of or into any of the four sides of any state; there is no fixed "outputs only exit the bottom" convention.

## UI behavior

Handles render at `z-index: 10` inside the node, styled as small squares/circles (`!w-4 !h-4`) that turn blue on hover; the node's own content area is `z-index: 9999999` so hover targets don't visually conflict.

## Internal architecture

- `src/components/diagram/nodes/scxml-state-node.tsx` renders **8 `<Handle>` elements per node** — one `type='target'` and one `type='source'` for each of `Position.Top`/`Bottom`/`Left`/`Right`, each pair sharing the **same `id`** (`'top'`, `'bottom'`, `'left'`, `'right'`) since ReactFlow disambiguates by `type` + `id` together, not `id` alone.
- These four id strings (`'top'|'bottom'|'left'|'right'`) are the exact vocabulary used throughout the rest of the app wherever a "handle side" is referenced: `viz:sourceHandle`/`viz:targetHandle` XML attribute values (`.claude/features/visual-metadata-namespace.md`), the traffic-aware auto-handle-assignment cost model in the converter (`.claude/features/auto-layout-elk.md`), and `UpdateTransitionHandlesCommand`'s stored values.
- `onConnect`/`isValidConnection` (in `visual-diagram.tsx`) intercept the drag-to-connect gesture: before creating anything, they check `wouldMergeDistinctGroups` (Initial-State-groups) and `checkNewConnectionSlotConflict` (transition slots) — see `.claude/features/initial-state-groups.md`, `.claude/features/transitions-editing.md` — and only if both pass does the connection get created via the direct object-tree edit path (not a Command — see `.claude/project/architecture.md`).
- Dragging an **existing** transition's endpoint onto a different handle/node triggers `ReconnectTransitionCommand` instead of `onConnect` (a genuinely different ReactFlow event/code path — reconnection, not creation).

## Relevant components

`src/components/diagram/nodes/scxml-state-node.tsx` (the Handle elements themselves).

## Relevant state/store

None dedicated — handle interaction is transient ReactFlow drag state, not app state.

## Relevant utilities

`src/lib/layout/edge-obstacle-utils.ts` (`getHandleAnchor` — converts a handle-side id into an actual pixel anchor point on a node's rect, used both by the layout cost model and the edge renderer).

## SCXML behavior

Handle-side choice is stored as `viz:sourceHandle`/`viz:targetHandle` attribute values on the `<transition>` element — purely visual/routing metadata, never affects SCXML runtime semantics (any real SCXML engine ignores these attributes entirely).

## Validation rules

None — handle assignment is never validated as correct/incorrect; any handle-side value is accepted.

## Related features

- `transitions-editing.md` — what happens after a connection is made (editing event/cond/etc.).
- `initial-state-groups.md`, and the slot-conflict logic in `transitions-editing.md` — both proactively block `onConnect` before a new handle-to-handle connection is committed.
- `auto-layout-elk.md` — the traffic-aware algorithm that picks handle sides automatically for edges lacking a saved value.
- `diagram-interaction.md` — the broader canvas interaction model this connection gesture is one part of.

## Related files

`src/components/diagram/nodes/scxml-state-node.tsx`, `src/components/diagram/visual-diagram.tsx` (`onConnect`, `isValidConnection`), `src/lib/commands/update-transition-handles-command.ts`, `reconnect-transition-command.ts`, `src/lib/layout/edge-obstacle-utils.ts`.

## Tests

No dedicated test file specifically for handle rendering/selection was found — connection-creation logic is covered indirectly through the slot-conflict and initial-group utility tests it delegates to before allowing a connection.

## Known limitations

- Because both source and target handles share an id per side, and ReactFlow disambiguates purely by `(type, id)`, any code that queries "the handle with id 'top'" without also filtering by type could ambiguously match either the incoming or outgoing handle on that side — always specify both when working with handle DOM elements directly.
- There is no visual indication on the node of *which* side(s) already have connections before a drag starts — a user must start dragging to discover valid drop targets, there's no "available connection points" preview.

## Important edge cases

- A self-loop (dragging from a node's handle back onto the same node) is explicitly allowed (a comment in `reconnect-transition-command.ts` notes this was previously blocked and has since been permitted) — don't reintroduce a same-node block without checking why it was removed.
- The same four-string vocabulary (`'top'|'bottom'|'left'|'right'`) must stay consistent across the node's Handle `id`s, the `viz:sourceHandle`/`viz:targetHandle` attribute values, and `getHandleAnchor`'s switch cases — introducing a fifth side or renaming one of these four strings requires updating all of these call sites together, or a saved/computed handle value will fail to resolve to an actual anchor point.

## Things that must NOT be changed

- Do not change the shared-id-per-side convention (separate ids per source/target on the same side) without auditing every place that constructs a handle id string, since several places assume exactly these four literal string values.

## Previous design decisions

No dedicated plan/spec document addresses the handle model directly — "all 4 sides support both incoming and outgoing" is stated as an inline code comment in `scxml-state-node.tsx` itself, suggesting this was a deliberate design choice (maximum connection flexibility) made during initial implementation rather than a later addition.
