# Feature: Selection (states, transitions, multi-select, marquee)

## Purpose

Let a user pick one or more states and/or one transition as the target of subsequent actions (open its editing panel, move it, delete it, copy it), with selection semantics that don't fight ReactFlow's own built-in selection model.

## User behavior

- **Single state**: click selects it and opens the State Actions panel.
- **Multiple states**: Ctrl/Cmd+click toggles a state's membership in the selection; the Multi-Select Toolbar appears once 2+ are selected, offering copy/delete.
- **Marquee (box) select**: hold Ctrl or Meta and drag on empty canvas to select everything inside the box.
- **Transition**: click selects it (shows waypoint handles if any exist, and opens the Transition panel).
- Selecting a new single state/transition replaces the previous selection; Ctrl/Cmd+click is the only way to build a multi-state selection.

## UI behavior

Selected states get a visual highlight (via `node.selected`/style, not ReactFlow's default selection outline necessarily — verify exact styling in `scxml-state-node.tsx` if pixel-perfect behavior matters). Selected transitions show waypoint handles (if any waypoints exist) and highlight their path.

## Internal architecture

- **Selection is intentionally not ReactFlow's native selection model**, except during a genuine marquee drag. Two separate pieces of state track selection:
  - `activeStates: Set<string>` (local state in `visual-diagram.tsx`) — the authoritative multi-select set for states, synced onto each node's `selected` prop via the `nodeEnhancements`/`enhancedNodes` mapping pass.
  - `selectedTransitions: Set<string>` — the equivalent for edges.
- `handleStateClick(nodeId, event, nodeType)` hand-rolls click/double-click/Ctrl-click disambiguation with a **250ms timer** (`clickTimeoutRef`/`clickCountRef`): a single click (no modifier) replaces the whole selection with just this node and opens State Actions; Ctrl/Cmd+click toggles membership without opening any panel; a second click within 250ms is treated as a double-click (enters rename mode — see `labels.md`), not two single-clicks.
- **Marquee selection is the one place ReactFlow's native `'select'`-type node-change events are honored** — gated by a `marqueeStartedRef` flag set between `onSelectionStart`/`onSelectionEnd`. Outside an active marquee drag, native `'select'` change events from ReactFlow are deliberately ignored in `handleNodesChange`, specifically to avoid ReactFlow's built-in box-select overlay fighting with the hand-rolled click-count logic above (documented in an extensive comment block in `visual-diagram.tsx`).
- Transition selection (`selectedEdgeForEdit`) is set on edge click and consumed by both the waypoint-handle rendering (`scxml-transition-edge.tsx`) and the Transition panel's visibility.

## Relevant components

`src/components/diagram/visual-diagram.tsx` (all selection logic), `src/components/diagram/multi-select-toolbar.tsx` (appears at 2+ selected), `src/components/diagram/nodes/scxml-state-node.tsx` (reads `selected` prop to show `NodeResizer`), `src/components/diagram/edges/scxml-transition-edge.tsx` (reads `selected` to show waypoint handles).

## Relevant state/store

None in a Zustand store — `activeStates`/`selectedTransitions`/`selectedEdgeForEdit` are all local component state in `visual-diagram.tsx`, deliberately scoped to the canvas session rather than app-wide (there's no cross-component need to know "what's currently selected on the canvas").

## Relevant utilities

None dedicated — this is pure component-level interaction logic, not delegated to a utility module.

## SCXML behavior

None — selection is purely a UI/editing-session concept, never persisted into the SCXML document (contrast with `viz:` layout/style data, which *is* persisted).

## Validation rules

None.

## Related features

- `diagram-interaction.md` — the broader canvas gesture set selection is one part of (drag, resize, copy/paste, delete all depend on knowing the current selection).
- `state-actions-panel.md` — opened automatically by a single-state selection.
- `transitions-editing.md` — the Transition panel is opened by transition selection.
- `labels.md` — double-click (a variant of the same click-disambiguation logic) triggers inline rename instead of selection.
- `zoom-pan-controls.md` — a "State Path" popover click-outside handler in `two-tab-layout.tsx` uses a capture-phase listener specifically because ReactFlow's canvas stops propagation of its own mousedown handling — a related but distinct event-ordering concern from marquee-select's own event handling.

## Related files

`src/components/diagram/visual-diagram.tsx`, `src/components/diagram/multi-select-toolbar.tsx`.

## Tests

`src/components/diagram/multi-select-toolbar.test.tsx` covers the toolbar's rendering/actions given a selection count, but no test directly exercises the click/double-click/marquee disambiguation logic in `visual-diagram.tsx` itself (would require simulating precisely-timed pointer events, which is difficult without a real browser/e2e setup — this repo has neither).

## Known limitations

- The 250ms click-vs-double-click timing window is a fixed constant, not user-configurable or adaptive — a user with an unusually slow double-click cadence (e.g. due to a motor/accessibility need) could have double-clicks misinterpreted as two separate single-clicks (opening State Actions, closing it, opening it again) rather than triggering rename.
- No "select all" keyboard shortcut (e.g. Ctrl+A) was found — building a full-canvas multi-selection requires either marquee-dragging over everything or many individual Ctrl+clicks.

## Important edge cases

- A marquee drag that starts on empty canvas but happens to end over a node does not accidentally trigger that node's own click handler — `marqueeStartedRef` and ReactFlow's own selection-vs-click event separation prevent this, but it's a genuinely fragile interaction between two different selection mechanisms coexisting in one component.
- Clicking a different single state while a multi-selection is active **replaces** the entire selection with just that one state (does not add to or clear-and-reselect only that one within the existing set) — Ctrl/Cmd must be held to extend an existing multi-selection.

## Things that must NOT be changed

- Do not "simplify" this to rely purely on ReactFlow's native selection model without re-reading the extensive comment block in `visual-diagram.tsx` explaining exactly why that was rejected — the hand-rolled approach exists to solve a real, previously-encountered conflict between RF's built-in box-select and custom click-count logic, not out of a preference for reinventing the wheel.

## Previous design decisions

The comment block accompanying `handleNodesChange`'s selective handling of native `'select'` changes is one of the most detailed self-documented rationale passages in the entire codebase — it explicitly states that ReactFlow's box-select overlay unconditionally emits native selection-change events regardless of whether the app wants to honor them at that moment, and that the `marqueeStartedRef` gate is the fix for the resulting conflict with Ctrl-click's own deferred click-count logic.
