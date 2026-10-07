# Feature: State Type Rendering (Simple / Compound / Parallel / Final / Initial / History)

## Purpose

Give the user an at-a-glance visual language for the different kinds of SCXML states, matching the spec's semantic categories, without requiring a separate component (and separate bugs) per type.

## User behavior

- Solid border = simple state (leaf, no children).
- Dashed border = compound state (has `<state>`/`<parallel>`/`<final>`/`<history>` children) — hovering reveals a "navigate into" arrow.
- Overlapping-square icon + "⚡" glyph = parallel state.
- `Target` icon, smallest minimum size = final state.
- Green "Initial" badge = this state is the entry point of its container (no arrow is drawn to it — see UI behavior).
- Oversized dashed purple box drawn around a container = a shallow/deep history marker for that container.
- Changing a state's type (via the State Actions panel's checkbox / a dedicated control) re-renders it with the new visual treatment immediately.

## UI behavior

- **One React component renders every type**: `SCXMLStateNode` (`src/components/diagram/nodes/scxml-state-node.tsx`), discriminated by `data.stateType: 'simple'|'compound'|'parallel'|'final'` plus an orthogonal `data.isInitial: boolean`. There is no `CompoundStateNode`/`ParallelStateNode`/etc. (those types exist in `src/types/hierarchical-node.ts` but are explicitly marked `@deprecated`/unused).
- **History is the one exception**: a separate ReactFlow node type, `scxmlHistory` → `HistoryWrapperNode` (`src/components/diagram/nodes/history-wrapper-node.tsx`) — a purely decorative box with no interactive content, drawn around (not replacing) the container it's associated with.
- A label containing the substring "history" (case-insensitive, anywhere in the id) also adds a small "📜 History" chip to a regular `SCXMLStateNode`, **independent of** whether it's a real `<history>` element — a cosmetic string-match quirk, not the authoritative history indicator.
- The Initial badge widens the node by a fixed amount (+70px, `node-dimension-calculator.ts`); there is deliberately **no arrow drawn into the initial state** — unlike many statechart tools' "black dot → arrow" convention.

## Internal architecture

- Type classification happens once, in the converter (`SCXMLToXStateConverter.createHierarchicalNode`, `src/lib/converters/scxml-to-xstate.ts`): `parallel` element → `stateType: 'parallel'`; has children → `'compound'`; `@_type="final"` → `'final'`; a `<history>` element → a separate `nodeType: 'scxmlHistory'` with `stateType: 'simple'` underneath (the wrapper handles its own visuals).
- `isInitialState()` (`converter-modules/layout-positioning.ts`) is a pure boolean check against the parent's `@initial`/`<initial>` — it does not affect `stateType`, only the `isInitial` flag consumed for the badge and dimension sizing.
- Dimension calculation (`node-dimension-calculator.ts`) is **not based on child count** (only one hierarchy level is ever visible at a time — see `hierarchy-navigation.md`) — it's based on label text width (measured via `measure-label-width.ts`, with a `length*8` fallback), state-type-specific minimum size, +70px if Initial, +20px height per onentry/onexit action.
- History-wrapper sizing/positioning (`positionHistoryStates`, `converter-modules/layout-positioning.ts:22-81`) uses **fixed-margin math**, not ELK — its own doc comment marks it `@deprecated ... kept for fallback only`, but it is in fact the **only implementation ever invoked**; there is no ELK-based alternative currently wired up despite the deprecation note.

## Relevant components

`src/components/diagram/nodes/scxml-state-node.tsx`, `src/components/diagram/nodes/history-wrapper-node.tsx`.

## Relevant state/store

None directly — type/flags flow through the node's `data` object, sourced from the converter's per-render conversion, not a persistent store.

## Relevant utilities

`src/lib/converters/converter-modules/layout-positioning.ts` (`isInitialState`, `positionHistoryStates`), `src/lib/layout/node-dimension-calculator.ts`, `src/lib/layout/measure-label-width.ts`, `src/lib/utils/visual-style-utils.ts` (`computeVisualStyles` — per-type default color/border scheme).

## SCXML behavior

- `stateType` is derived, never itself stored — it's computed fresh from the element's tag (`<parallel>`, `@_type="final"`), presence of children, on every conversion.
- Changing a state's type via the UI goes through `ChangeStateTypeCommand` (`src/lib/commands/change-state-type-command.ts`), which is limited: it can rewrite attributes for a `final` conversion (stripping outgoing transitions and substates, since `<final>` can't have either) but **does not actually change the underlying XML element tag name** for a state→parallel conversion — that's an unimplemented case (logs a `console.warn`), so "changing to parallel" via this command may not do what the UI implies for every source type. Check the command's actual behavior before relying on it for a parallel conversion.

## Validation rules

`validateCompoundStates` requires any state with children to declare `@initial` or an `<initial>` element — but **only recurses through `state → state`, not through `<parallel>`**, so a compound state nested inside a parallel region missing this can go unflagged (see `.claude/project/scxml-rules.md`).

## Related features

- `hierarchy-navigation.md` — the "navigate into" affordance on compound states, and why children never render nested inside the parent box.
- `initial-state-groups.md` — the business rules around marking/unmarking the Initial badge.
- `state-actions-panel.md` — where onentry/onexit editing (which affects node height) and the Initial toggle both live.

## Related files

`src/components/diagram/nodes/scxml-state-node.tsx`, `history-wrapper-node.tsx`, `src/lib/converters/scxml-to-xstate.ts`, `src/lib/converters/converter-modules/layout-positioning.ts`, `src/lib/layout/node-dimension-calculator.ts`, `src/lib/commands/change-state-type-command.ts`, `src/types/hierarchical-node.ts` (deprecated type definitions).

## Tests

`src/lib/commands/change-state-type-command.test.ts`. No direct render test exists for `scxml-state-node.tsx` or `history-wrapper-node.tsx` (no RTL test files for either).

## Known limitations

- **`ChangeStateTypeCommand.undo()` is broken for the state→final conversion path.** `execute()` snapshots the transitions/substates it strips (into `oldTransitions`/`oldSubstates`) before deleting them, but `undo()` never uses those snapshots — it just re-executes the inverse type change, which does not bring back the deleted content. If you touch this command, this is a real bug to fix, not intended behavior to preserve.
- State→parallel conversion (and likely other non-final conversions) is not fully implemented — verify actual behavior against the current code before trusting the UI's type-selector implies a full structural conversion.
- History-wrapper positioning uses generous fixed margins (`wrapMargin=150`) regardless of actual content — can look oversized relative to a small container, and there's no configurable/ELK-based sizing despite the deprecation comment suggesting one was planned.

## Important edge cases

- A node can be both "compound" (has children) and have its label happen to contain "history" — it will show *both* the dashed border/navigate-in arrow *and* the cosmetic "📜 History" chip, even if it has no actual `<history>` child. This is a real, reachable visual quirk from ordinary naming, not a hypothetical.
- Width is **never allowed to shrink** on a content-only reparse — `Math.max(storedVizWidth, calculatedMinimum)` — so a node can only get narrower via an explicit manual `NodeResizer` drag, never automatically (e.g. after un-marking Initial or shortening a label via rename).

## Things that must NOT be changed

- Do not introduce a per-type node component without first checking every place that currently assumes "there is exactly one state node component, `SCXMLStateNode`" (the enhancement pass in `visual-diagram.tsx`, `nodeTypes` registration, dimension calculation) — this is a structural assumption throughout the diagram code, not a superficial styling choice.
- Do not remove the width-floor-never-shrinks behavior without checking `RenameStateCommand`'s reliance on it (a rename to a longer id must not clip; see `undo-redo-history.md`/`.claude/project/coding-rules.md`'s waypoint-invalidation note, which exists specifically because size-changing commands need this floor to stay correct alongside stale-waypoint clearing).

## Previous design decisions

`src/types/hierarchical-node.ts` explicitly documents its own supersession: `CompoundStateNodeData`/`ParallelStateNodeData` are marked `@deprecated - removed - use SCXMLStateNode with data.stateType instead` — direct evidence that this codebase used to have per-type node components and was deliberately consolidated into the single-component-plus-discriminator design described above.
