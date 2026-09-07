---
name: state-machine-semantics
description: Change the rules governing what states/transitions are allowed to represent — initial states, compound/parallel nesting, cross-hierarchy restrictions, transition slots, Initial-State groups, time-transition syntax. Use for changes to the state-machine model's own semantics, as opposed to changes to how SCXML text is parsed/serialized (scxml-representation) or which existing rules get flagged (validation-rules).
---

# State-Machine Semantics Changes

Specializes `.claude/workflows/development.md` for the most cross-cutting domain in this codebase. A change here routinely touches a validator, the converter, a Command, and live UI-blocking **simultaneously** — this skill's main job is making sure you find all four before calling the change complete.

## When to use

Changing what counts as a valid Initial-state configuration; changing the cross-hierarchy transition restriction; adding/changing a transition-slot kind (event/timer/cond/always); changing how compound/parallel states nest or are classified; changing the `after X` time-transition shorthand's semantics; anything touching `initial-group-utils.ts` or `transition-slot-rules.ts`.

## Required investigation steps

1. Identify every consumer of the shared rule utility you're touching. This repo deliberately pairs **live UI blocking** with **static validation** through one shared utility for exactly these two concepts:
   - Transition slots → `src/lib/utils/transition-slot-rules.ts`, consumed by `visual-diagram.tsx`'s `onConnect`/`isValidConnection`, the Transition panel's edit handler, **and** `transition-slot-validator.ts`.
   - Initial-State groups → `src/lib/utils/initial-group-utils.ts`, consumed by the State Actions panel's Initial checkbox, `onConnect`, **and** `initial-group-validator.ts`.
   A change to either concept made in only one consumer will silently diverge from the others — this is the single most important thing to get right in this domain.
2. Read `.claude/features/initial-state-groups.md` and/or `transitions-editing.md` for the specific concept, plus `.claude/features/state-hierarchy-tree.md` if nesting/parent-child logic is involved.
3. Confirm the change respects (or deliberately, explicitly changes) the cross-hierarchy transition rule — Initial-group analysis assumes it holds; relaxing it without auditing that analysis will silently break group detection.
4. If touching time-transitions, remember the synthetic event-name token (`{stateId}_t_{N}_timeEvent_{N}`) must only ever be read/rewritten via `findTimeEventToken`/`renameTimeEventTokensInEventList` — never a substring replace.
5. Check `.claude/decisions/scxml.md` for whether the specific rule you're changing has a stated origin (several do: the cross-hierarchy rule cites "Milestone 5 — 1C"; Initial-State groups trace to `docs/parallel-states-requirement.md`) — understand the original requirement before changing its scope.

## Relevant knowledge files

`.claude/features/initial-state-groups.md`, `transitions-editing.md`, `state-node-types.md`, `state-hierarchy-tree.md`, `time-transition-syntax.md`, `state-connections-handles.md`.

## Relevant project rules

`.claude/project/project-rules.md` §6 (SCXML Semantics), §10 (State/Node Relationships), §11 (Transition/Edge Relationships) — read all three fully; this domain is where most of the "[EXPLICIT]" rules in the whole constitution live.

## Relevant decision records

`.claude/decisions/scxml.md` #2 (cross-hierarchy rule), #3 (Initial-State groups), #4 (`<initial>` normalization), #5 (transition slots), #6 (time-transition ms-conversion).

## Implementation expectations

- Any new or changed rule that needs both live-blocking and static enforcement must live in the shared utility, consumed by both sides — never duplicated.
- Preserve "unmarking Initial is always allowed" — this is a deliberate deadlock-avoidance choice, not an inconsistency with "marking Initial can be blocked."
- Preserve "the cross-hierarchy rule applies to every transition, including reconnection/anchor-drag" — this was specifically extended to cover the reconnect gesture after a real bug (`f654aff` in git history), not just transition creation.
- If changing the transition-slot concept, remember it was built incrementally (event → eventless/"always" → timer) and each addition shipped with tests — follow that precedent (one slot kind at a time, tested) rather than a single sweeping rewrite.

## Testing expectations

- Test the shared utility function directly (pure logic, easy to unit test) rather than only testing through the UI or the validator — this gives you confidence both consumers will behave correctly without needing to duplicate the test.
- Update both the live-blocking test coverage (if any exists for the UI path) and the static validator's test file — `transition-slot-validator.test.ts`, `initial-group-validator.test.ts`.
- Sibling test files, not under `__tests__/`.

## Common mistakes to avoid

- Fixing a rule in the validator but not in the live-blocking consumer (or vice versa) — the single most likely mistake in this domain, given the shared-utility pattern exists specifically because this has apparently gone wrong before.
- Assuming compound-state validation recurses through `<parallel>` the same way it does through `<state>` — it currently does not (a confirmed gap), so don't build a new feature on the assumption that gap is fixed.
- Treating the Initial-State-groups concept as something the downstream C# generator/runtime understands natively — per `docs/parallel-states-requirement.md`, it's explicitly a visual-editor-only authoring construct.
- Renaming/rewriting a timer-event token with a plain string replace instead of the dedicated token functions.
