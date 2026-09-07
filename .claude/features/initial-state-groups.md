# Feature: Multiple Independent Initial State Groups

## Purpose

Support authoring multiple, mutually-disconnected sub-state-machines at the same hierarchy level — each with its own entry point — rather than forcing every level to have exactly one Initial state. Originated from a real product requirement to model N parallel/independent state machines side by side (`docs/parallel-states-requirement.md`).

## User behavior

- A user can mark more than one sibling state as "Initial" (via the checkbox in the State Actions panel), **as long as** those states aren't connected to each other by any chain of transitions.
- Attempting to mark a state Initial when it's already reachable (directly or transitively) from another Initial-marked sibling is **blocked** — the checkbox is disabled with a tooltip explaining why.
- Attempting to draw a transition (or otherwise connect) two states that are each the Initial state of their own currently-separate group is **blocked live**, with a dismissible banner, because it would merge two groups into one with two conflicting starts.
- Unmarking an Initial state is **always allowed**, even if it's the only Initial marker in its group — a resulting "compound state has no initial" situation is left to be caught by ordinary validation (see `scxml-validation.md`), not blocked at the point of unmarking, specifically to avoid a deadlock where you can never remove the last marker to reassign it elsewhere.

## UI behavior

Enforced in two places with identical underlying logic (shared utility, not duplicated rules):
- **State Actions panel** — the Initial-State checkbox's `disabled`/tooltip state.
- **Canvas connect gesture** (`onConnect`/`isValidConnection` in `visual-diagram.tsx`) — blocks the connection outright with `connectionBlockedMessage`.

## Internal architecture

- **"Initial State group"** = a connected component (via sibling transitions only — relies on the cross-hierarchy rule, see `.claude/project/scxml-rules.md`) among one container's *direct children* that contains exactly one Initial-marked state.
- `src/lib/utils/initial-group-utils.ts` implements this via a **union-find** over sibling edges:
  - `getDirectChildStates`, `findParentContainer` — scope the analysis to one container's children.
  - `getInitialIds` — unions ids marked Initial via **either** the `@_initial` attribute (space-list) **or** the legacy `<initial><transition target="X"/></initial>` element form (both are read; only the attribute form is written back by `ToggleInitialStateCommand`, normalizing away the legacy form over time — see `.claude/features/state-node-types.md`/command notes).
  - `getSiblingEdges` — collects transitions between direct siblings.
  - `analyzeGroups` — the union-find pass producing group membership.
  - `wouldMergeDistinctGroups(...)` — used by the live connect-gesture check: would adding this specific edge join two groups that each already have their own Initial marker?
  - `wouldConflictIfMarkedInitial(...)` — used by the live Initial-checkbox check: is this state already transitively connected to another Initial-marked state?
- Same logic backs the **static** `initial-group-validator.ts`, which re-checks the whole document (catching violations introduced by hand-edited/pasted XML that never went through the live UI).
- **Toggling Initial** (`ToggleInitialStateCommand`) reads both the attribute and legacy-element forms, merges the referenced ids, then **always writes back using only the attribute form**, deleting any pre-existing `<initial>` element — a one-time normalization eliminating the "two sources of truth" problem for that state going forward. See `.claude/project/coding-rules.md` for why this command's `undo()` deliberately does *not* just re-execute the inverse toggle (multi-value attribute order/whitespace would not be guaranteed to round-trip via re-toggling).

## Relevant components

`src/components/ui/state-actions-panel.tsx` (the checkbox), `src/components/diagram/visual-diagram.tsx` (`onConnect`/`isValidConnection`), `src/components/diagram/initial-group-conflict-banner.tsx` (the blocked-connection message UI — also reused for transition-slot-conflict messages despite the filename).

## Relevant state/store

None dedicated — analysis is recomputed on demand (via a fresh `SCXMLParser().parse()` call inside `ToggleInitialStateCommand`, and via the already-parsed tree inside `onConnect`), not cached in a store.

## Relevant utilities

`src/lib/utils/initial-group-utils.ts` (core logic), `src/lib/commands/toggle-initial-state-command.ts` (the mutation), `src/lib/validators/initial-group-validator.ts` (static counterpart).

## SCXML behavior

Multiple sibling states with `@_initial` markers pointing at each other's group is legal, standard-compliant SCXML in isolation — the "group" concept and its conflict rules are **entirely a product-level authoring constraint**, not an SCXML spec requirement. A generated file with two connected Initial-marked siblings would still parse as valid SCXML; this product simply refuses to let the user author that state through its own UI/validation.

## Validation rules

`validateInitialStateGroups` (`initial-group-validator.ts`) recurses into **every** compound state's own children independently — a conflict in one container does not leak into or get confused with an unrelated container's own Initial-group analysis (verified by `initial-group-validator.test.ts`). Error message: `"States 'A' and 'B' are both marked as Initial States but are connected by a transition (directly or indirectly), which merges two Initial State groups. Remove one of the Initial markers, or remove the transition(s) connecting them."`

## Related features

- `transitions-editing.md` — the same `onConnect` gesture also checks transition-slot conflicts; both checks can independently block a new connection.
- `state-actions-panel.md` — hosts the Initial-State checkbox.
- `state-node-types.md` — the visual "Initial" badge this feature's state controls.
- `scxml-validation.md` — the static validation pass 13 in the overall pipeline.

## Related files

`src/lib/utils/initial-group-utils.ts`, `src/lib/commands/toggle-initial-state-command.ts`, `src/lib/validators/initial-group-validator.ts`, `src/components/diagram/initial-group-conflict-banner.tsx`, `docs/parallel-states-requirement.md`.

## Tests

`src/lib/utils/initial-group-utils.test.ts`, `src/lib/commands/toggle-initial-state-command.test.ts`, `src/lib/validators/initial-group-validator.test.ts`.

## Known limitations

- Correctness of this whole feature **depends on** the cross-hierarchy transition rule already being enforced elsewhere (the union-find only looks at direct-sibling edges, on the assumption no transition can exist between non-siblings) — if that rule is ever relaxed, this feature's analysis would become incomplete without a corresponding update.
- `initial-group-utils.ts` contains a leftover `debugger;` statement (per source analysis) that executes on every connection attempt this logic guards — see `.claude/project/coding-rules.md` §8.

## Important edge cases

- Unmarking the sole Initial state in a group is always allowed, deliberately leaving the group with **zero** Initial states temporarily — this is by design (avoids a reassignment deadlock) and will surface as a *different* validation error (`validateCompoundStates`, "must have either an initial attribute or an initial child element") rather than being prevented at the unmark step.
- A state can be Initial-marked via the legacy `<initial>` element in an existing file; `getInitialIds` reads it, but any subsequent toggle on *that same state* through this app's UI will silently normalize it away to the attribute form — a user hand-authoring `<initial>` elements outside this app and expecting them preserved verbatim through a round-trip should be aware of this normalization.

## Things that must NOT be changed

- Do not implement group-conflict checking anywhere new using ad hoc logic — always call into `initial-group-utils.ts`'s shared functions, so live blocking and static validation can never disagree (same principle as transition slots — see `.claude/project/coding-rules.md` §3).
- Do not change "unmarking Initial is always allowed" to a blocking check — this was a deliberate deadlock-avoidance decision (see Known/Important sections above), not an oversight.

## Previous design decisions

`docs/parallel-states-requirement.md` is the **original informal product requirement** for this entire feature — a 5-phase plan explicitly calling for: "Enable Multiple Initial States," "Support for N-Parallel Machines," and "Connectivity Checks... to ensure that parallel state machines remain entirely disconnected." `docs/superpowers/plans/2026-07-17-multiple-initial-state-groups.md` is the corresponding implementation plan. The requirement doc explicitly frames this as a **visual-editor-only** concern ("Visual-Only Focus... rather than the backend execution code") deferred from actual runtime/hardware execution semantics — meaning the "group" concept may not correspond to anything the downstream C# generator/runtime itself understands as a first-class idea; it's purely an authoring-time correctness constraint invented by this editor.
