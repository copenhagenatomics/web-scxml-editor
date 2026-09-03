# Feature: Transition Editing, Edge Rendering, and Transition Slots

## Purpose

Let a user create, edit, and visually understand transitions (SCXML's core control-flow primitive) both as diagram edges and through a structured side panel, while preventing structurally-invalid combinations (e.g. two conflicting transitions between the same two states) before they're ever saved.

## User behavior

- Drag from one state's connection handle to another to create a transition.
- Click a transition to select it and open the Transition panel: switch between Event mode and Condition mode, type an event name or condition expression with autocomplete (channels/events/datamodel variables), or use `after 2s` / `after 714ms` / `after (expr) s` shorthand for a timed transition (see `time-transition-syntax.md`).
- Attempting to create a second transition that would conflict with an existing one between the same two states (see "Transition slots" below) is **blocked immediately** with a dismissible banner explaining why — the user cannot create the invalid state even temporarily.
- Shift+Click on an already-selected edge inserts a new waypoint at the nearest point on its current path, for manual routing. Double-click a waypoint to delete it. Drag a waypoint circle to reroute.
- Dragging an edge's endpoint onto a different state reconnects it.

## UI behavior

- Edge labels are colored pills: gray = eventless, blue = plain event, amber = conditional (a source comment mislabels this color "purple" — the actual rendered color is amber, don't "fix" it to match the comment).
- Multiple transitions landing on the same physical handle pair between two states ("slots" in the geometric sense, distinct from but related to the business-rule "slot" concept below) are automatically fanned out with distinct curvature/offset so they don't visually overlap.
- Internal-event reactions (targetless transitions used as event handlers — see `.claude/project/terminology.md`) never render as edges — only as a "reaction:N" count badge on the source state node.
- Path rendering follows a strict priority chain: (1) persisted waypoints → smooth curve through them; (2) self-loop (source===target) → routed rectangular loop past the node; (3) a persisted parallel-edge offset → offset smoothstep; (4) obstacle collision detected against sibling nodes → real A* orthogonal pathfinding, simplified into long runs + corners; (5) otherwise plain smoothstep.

## Internal architecture

- **Business-rule "transition slot" concept** (`src/lib/utils/transition-slot-rules.ts`, `classifyTransitionSlot`): every transition between a given (source, target, type) triple is classified as `'event'` | `'timer'` | `'cond'` | `'always'` | `'invalid-both'`. `'timer'` is distinguished from plain `'event'` purely by whether the event name matches the auto-generated timer-event pattern (`isTimeEventName`, `time-transition.ts`). At most one transition may occupy each slot for a given (source, target, type) — this rule is shared, not duplicated, between:
  - **Live blocking**: `checkNewConnectionSlotConflict` (on `onConnect`/`isValidConnection`) and `checkTransitionEditSlotConflict` (in the Transition panel's apply handler).
  - **Static validation**: `transition-slot-validator.ts` (document-wide sweep, catches violations from hand-edited/pasted XML that never went through the live UI).
- Editing a transition's event/cond/handles/waypoints goes through dedicated **Commands** (`UpdateTransitionCommand`, `UpdateTransitionHandlesCommand`, `UpdateWaypointsCommand`, `ReconnectTransitionCommand`) — all DOM-based, all find the target transition either by a stable index (`transitionIndex`) with a target-id safety check, or by matching (target, event, cond) attributes.
- Creating a **brand-new** transition (`onConnect`) uses the **direct object-tree path** (`scxml-manipulation-utils.ts`), not a Command — see `.claude/project/architecture.md`.
- Edge geometry (self-loop routing, A* obstacle avoidance, offset fan-out, smooth-bezier-through-waypoints) is computed at render time in `src/components/diagram/edges/scxml-transition-edge.tsx`, backed by shared geometry helpers in `src/lib/layout/edge-obstacle-utils.ts` and `path-builders.ts`.

## Relevant components

`src/components/diagram/transition-panel.tsx` (the live editing UI), `src/components/diagram/edges/scxml-transition-edge.tsx` (rendering). **Dead code, do not extend**: `src/components/diagram/transition-edit-bar.tsx` — superseded by `transition-panel.tsx`, not imported anywhere outside itself.

## Relevant state/store

Selection state (`selectedTransitions`, `selectedEdgeForEdit`) lives locally in `visual-diagram.tsx`, not a Zustand store. `useHostAPIStore.channels`/`events` feed the Transition panel's autocomplete.

## Relevant utilities

`src/lib/utils/transition-slot-rules.ts`, `src/lib/utils/time-transition.ts` (`parseAfterSyntax`, `formatAfterSyntax`, `resolveTimeEventDisplay`), `src/lib/utils/transition-merge-utils.ts` (load-time normalization — see `.claude/project/scxml-rules.md`), `src/lib/consts/transition-colors.ts` (`getTransitionColor`), `src/lib/layout/edge-obstacle-utils.ts`, `path-builders.ts`.

## SCXML behavior

A plain transition is `<transition event="..." cond="..." target="..."/>`. `type="internal"` transitions may only self-target (validated). A targetless `type="internal"|"external"` transition with `<assign>` children is an "internal event reaction," not a state-change transition (see `state-actions-panel.md`). "after X" transitions are native `<send>`/`<cancel>` pairs, not a distinct SCXML construct (see `time-transition-syntax.md`).

## Validation rules

- **Cross-hierarchy rule**: source and target must share the same parent (error) — see `.claude/project/scxml-rules.md`.
- **Transition-slot conflicts**: both `event` and `cond` set on one transition is always an error; more than one transition in the same slot to the same target+type is an error with a slot-specific message (e.g. "Only one timer-based transition is allowed from 'A' to 'B'.").
- Event-name syntax: `^[a-zA-Z_][a-zA-Z0-9_\-\. ]*(\.\*)?$`, warning severity. **Comma, not space, is the multi-event separator** — a space-containing string is treated as one event name (confirmed by `transition-validator.test.ts`).
- Target must resolve to a real state id (error, with Levenshtein-based "did you mean" suggestion).

## Related features

- `initial-state-groups.md` — a new/edited transition can also be blocked for merging two Initial groups, via the same live-blocking mechanism.
- `time-transition-syntax.md` — the "after X" authoring shortcut, tightly coupled to slot classification (`'timer'` slot) and to `RenameStateCommand` (must rewrite the timer token on rename).
- `auto-layout-elk.md` — the traffic-aware handle-assignment cost model that decides which side of a node a *newly laid out* (not manually routed) edge connects to.
- `scxml-validation.md` — the static counterpart of the live slot-conflict/cross-hierarchy blocking.

## Related files

`src/components/diagram/transition-panel.tsx`, `src/components/diagram/edges/scxml-transition-edge.tsx`, `src/lib/commands/update-transition-command.ts`, `update-transition-handles-command.ts`, `update-waypoints-command.ts`, `reconnect-transition-command.ts`, `src/lib/utils/transition-slot-rules.ts`, `src/lib/validators/transition-slot-validator.ts`, `transition-validator.ts`.

## Tests

`src/components/diagram/transition-panel.test.tsx`, `src/lib/commands/update-transition-command.test.ts`, `src/lib/utils/transition-slot-rules.test.ts`, `src/lib/validators/transition-slot-validator.test.ts`, `transition-validator.test.ts`.

## Known limitations

- A transition edit is located either by a stable index (preferred, verified against target as a safety check) or by attribute-matching (`target`+`event`/`cond`) as a backward-compatible fallback — the fallback can misidentify the wrong transition if two transitions from the same source happen to share identical target+event+cond (shouldn't normally happen given slot-conflict blocking, but hand-edited XML could produce it).
- Self-loop and parallel-offset edge paths are computed **independently of the A*/obstacle-avoidance system** — a self-loop's bulge can visually cross a sibling node even when the general obstacle-avoidance logic would otherwise route around it; this is a strict priority-chain design, not a bug, but it means "make edges never cross nodes" is not actually a universal guarantee.

## Important edge cases

- A comma-merged multi-event transition (`event="a,b,c"`) containing a synthesized timer token must have that token resolved back to "after X" display *per token*, not for the whole string — `resolveTimeEventDisplay`/`findTimeEventToken` handle this, and `renameTimeEventTokensInEventList` must only rewrite the matching token on rename, leaving the others untouched.
- Both `event` and `cond` empty (a fully eventless/unconditional transition, the `'always'` slot) is legal SCXML (an automatic/always-taken transition) — don't conflate this with the `'invalid-both'` slot (both set), which is always an error.

## Things that must NOT be changed

- Do not implement a second, independent "is this connection valid" check anywhere else in the codebase — always route through `transition-slot-rules.ts`'s shared functions so live blocking and static validation can never drift apart (this is the explicit reason the shared module exists — see `.claude/project/coding-rules.md` §3).
- Do not change the edge-path-selection priority order (waypoints > self-loop > parallel-offset > obstacle-avoidance > plain smoothstep) without checking all five branches together — they're mutually exclusive by design in `scxml-transition-edge.tsx`.

## Previous design decisions

`docs/superpowers/plans/2026-07-25-transition-slot-validation.md` and its paired spec document the origin of the transition-slot concept as a dedicated feature (not something that was always part of the SCXML model). `docs/superpowers/plans/2026-06-16.../2026-06-17-reactions-tab.md` documents internal-event-transitions as a later addition surfaced via a dedicated "reactions" tab, explaining why they're modeled as targetless transitions rather than a wholly separate SCXML construct — reusing `<transition>` kept them representable in standard SCXML while giving them distinct product-level treatment (no edge, dedicated tab, own slot classification input).
