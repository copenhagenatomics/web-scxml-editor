# Feature: State Editing (create, rename, retype, delete)

## Purpose

Consolidate the full lifecycle of editing a state's own identity and structural properties — as distinct from `state-actions-panel.md` (its behavioral content: onentry/onexit/reactions) and `state-node-types.md` (how it's rendered). This document is the "CRUD on a state" view: create, rename, change type, delete.

## User behavior

- **Create**: toolbar "S" button (New State) adds a state at the hierarchy level currently being viewed (root, or inside the navigated-into state — see below) at a free grid slot, with a default id, no children, no actions. The "F" button (Add Final State) adds a `<final>` (ids `final_1`, `final_2`, …), but **only while viewing inside a `<parallel>`** (product decision, October 2026) — or a compound state whose regions live in its transparent `{id}__parallel`, or the top level when it has a `__root_parallel`. Since a `<parallel>` can't hold a `<final>` directly, it goes into the region (`<state>` child of the parallel) containing the currently selected state(s), placed just below the selected node. **A region holds at most one `<final>`.** The button is refused with a warning toast at a top level with no `__root_parallel`, inside an ordinary compound state, with nothing selected, with a selection spanning several regions, when that region is itself a `<parallel>`, or when that region already has a `<final>` ("This region already has a final state.") — see `resolveFinalStateRegion` in `scxml-manipulation-utils.ts`. Pasting finals into a parallel uses the same resolver, passing how many finals are being pasted (`adding`), so pasting two finals into one region is refused too, even if it has none yet. A new final is never auto-marked Initial. Finals can still be written anywhere valid by editing the XML; this restriction is on the button only.
- **Rename**: double-click the state, type a new value, Enter/blur to commit (see `labels.md` for the full mechanism — every reference to the old id updates automatically).
- **Change type**: via a control in the State Actions panel / elsewhere in the UI (verify exact UI entry point in current build), switching between simple/compound/parallel/final.
- **Delete**: select and press Delete/Backspace; cascades to remove any transitions elsewhere in the document that targeted the deleted state.

## UI behavior

- New states (and finals) are added at the hierarchy level currently being viewed: `handleAddRootState` adds under `currentParentId` when the user has navigated into a state, and at the document root otherwise. Despite its name, it is not root-only.
- The Initial-State checkbox (hosted in the State Actions panel, not a separate "state editing" control) can be disabled with an explanatory tooltip when checking it would merge two Initial-State groups (see `.claude/features/initial-state-groups.md`).

## Internal architecture

- **Create**: `handleAddRootState` in `visual-diagram.tsx` uses the **direct object-tree edit path** (`scxml-manipulation-utils.ts`'s `createStateElement`/`addStateToDocument`), not a Command — see `.claude/project/architecture.md`. Sets `@_viz:xywh` for initial placement and, for a `<state>` added inside a navigated-into parent that has no `<state>`/`<parallel>` children yet, sets that parent's `@_initial` to it (nothing is set at the document root). Takes a `kind` (`'state' | 'final'`) that picks the element tag passed to `addStateToDocument`.
- **Rename**: `RenameStateCommand` — see `.claude/features/labels.md` for the full cascading-rewrite behavior (transition targets, `initial` attributes, time-event tokens, waypoint invalidation).
- **Change type**: `ChangeStateTypeCommand` — swaps `<state>` ↔ `<final>` for real (keeping valid attributes/children, dropping invalid ones), with whole-document snapshot undo; **not implemented for state→parallel conversion** (logs a `console.warn`). Details in `.claude/features/state-node-types.md` ("SCXML behavior").
- **Delete**: `DeleteNodeCommand` — removes the state element itself and separately scans the **entire document** for any `<transition target="deletedId">` to clean up (not scoped to the deleted subtree — a transition from an unrelated branch pointing at the deleted state is also cleaned up). If the deleted state was the document's `initial` state, reassigns `initial` to the first `<state>` found in document order (not necessarily a sibling) or removes the attribute if none remain. Undo is a **whole-document snapshot restore**, not structural reinsertion (see `.claude/project/coding-rules.md` §2).

## Relevant components

`src/components/diagram/visual-diagram.tsx` (create/delete handlers), `src/components/diagram/nodes/scxml-state-node.tsx` (rename UI, delete button — suppressed for the Initial state), `src/components/ui/state-actions-panel.tsx` (type-related and Initial-toggle UI).

## Relevant state/store

None dedicated to this lifecycle specifically.

## Relevant utilities

`src/lib/utils/scxml-manipulation-utils.ts` (create path), `src/lib/commands/rename-state-command.ts`, `change-state-type-command.ts`, `delete-node-command.ts`.

## SCXML behavior

Create/delete/retype all operate on the `<state>`/`<parallel>`/`<final>` element directly. A newly created state has no `<onentry>`/`<onexit>`/`<transition>` children by default — it is the minimal valid element (`<state id="..."/>`).

## Validation rules

- Duplicate ids: caught by `SCXMLValidator`'s duplicate-state-id check after the fact, not proactively blocked by the create/rename UI itself (verify whether `RenameStateCommand` refuses a colliding rename outright before assuming either behavior — see `.claude/features/labels.md`'s note on this same open question).
- Deleting the sole Initial state of a group: not specifically blocked (contrast with *unmarking* Initial via the checkbox, which is explicitly always-allowed by design — see `.claude/features/initial-state-groups.md`); deleting a state that happens to be Initial reassigns `initial` to an arbitrary first-in-document state, which could produce a confusing result for a document with meaningful multi-group structure — verify current behavior doesn't corrupt Initial-State-group intent when deleting a specific group's Initial marker rather than the whole group.

## Related features

- `labels.md` — the rename mechanism in full detail.
- `state-node-types.md` — the visual consequence of a type change.
- `state-hierarchy-tree.md` — deletion's document-wide transition cleanup interacts with the hierarchy the deleted state was part of.
- `initial-state-groups.md` — interactions between delete/retype and Initial-marker validity.
- `undo-redo-history.md` — delete's and retype's snapshot-based undo vs. rename's inverse-command undo (two different Command undo strategies both represented in this one feature).

## Related files

`src/lib/commands/rename-state-command.ts`, `change-state-type-command.ts`, `delete-node-command.ts`, `src/lib/utils/scxml-manipulation-utils.ts`, `src/components/diagram/visual-diagram.tsx`.

## Tests

`src/lib/commands/rename-state-command.test.ts`, `change-state-type-command.test.ts`. No dedicated test file confirmed for `delete-node-command.ts` in this pass — check for one before assuming its document-wide transition-cleanup and initial-reassignment logic is covered.

## Known limitations

- `ChangeStateTypeCommand` can't convert to `<parallel>` (see `.claude/features/state-node-types.md`).
- Delete's initial-reassignment picks the first `<state>` in raw document order, which may not be a meaningful choice for a document using multiple Initial-State groups (see Validation rules above) — worth manual verification if you're deleting a group's Initial state deliberately.
- No confirmation/undo-prompt before delete beyond the general Ctrl+Z availability — a multi-state delete removes everything selected immediately.
- The one-`<final>`-per-region rule is only enforced by `resolveFinalStateRegion` (the "F" button and paste). These paths don't check it: drag-to-nest (`handleReparent`) of several finals at once onto an empty region (shown as its own node); `ChangeStateTypeCommand` converting a region's state to `final` (it only refuses when the region itself would become one); and hand-written XML. No validator flags a region with 2+ finals either.

## Important edge cases

- Deleting a state also implicitly deletes any transitions **originating from** it (they're children of the element being removed) but transitions **targeting** it from elsewhere require the separate whole-document scan in `DeleteNodeCommand` — these are two different removal mechanisms operating in the same command, not one uniform "remove everything related" pass.

## Things that must NOT be changed

- Do not "fix" `DeleteNodeCommand`'s undo to attempt structural reinsertion without also fixing its whole-document-scan transition cleanup to be reversible — currently the snapshot-restore approach is internally consistent (everything reverts via one string swap); a partial structural-undo change could leave the two halves of the delete operation inconsistently undone.

## Previous design decisions

`README.md`'s "Deleting States" section documents the current cascade-delete + Ctrl+Z-recovery UX as intended end-user behavior. No plan/spec document specifically addresses the state→parallel incomplete-implementation — it appears to be an unrecognized issue rather than a deliberate, accepted limitation. (The former state→final undo gap is fixed — `decisions/editing.md` #3.)
