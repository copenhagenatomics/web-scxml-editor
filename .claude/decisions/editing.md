# Editing Behavior Decisions

Covers how mutations are structured and how specific editing UX was arrived at.

---

## 1. Command pattern (execute/undo/getDescription) as the primary mutation abstraction

### Context
Most SCXML mutations need to be individually undoable and need a human-readable description for history/UI purposes.

### Decision
16 `Command` classes (`src/lib/commands/*`) implement a shared `execute(content) -> {content, success}` / `undo(content) -> {content, success}` / `getDescription()` interface, built on a `BaseCommand` abstract base providing shared DOM-manipulation helpers.

### Reason
`base-command.ts`'s own header comment states the goals directly: "Unified approach to all mutations," "Undo/redo functionality," "Clean separation of business logic from UI."

### Constraints
New mutations with undo requirements should be implemented as a new Command class, not as ad hoc inline DOM manipulation in a component — see `.claude/workflows/adding-a-command.md`.

### Alternatives
None found evidenced as an alternative mutation-abstraction design.

### Evidence
`src/lib/commands/base-command.ts` (header comment), all 16 command files following the identical interface.

### Status
Accepted.

---

## 2. Two different undo strategies within the Command pattern, chosen per-command

### Context
Some mutations (position change, rename) have a cleanly invertible operation; others (delete) don't.

### Decision
Most commands implement `undo()` by constructing the inverse command (old/new values swapped) and re-executing it. `DeleteNodeCommand`/`DeleteNoteCommand` instead snapshot the entire pre-change document string during `execute()` and restore it verbatim on `undo()`.

### Reason
Not documented in one place, but the pattern makes sense pragmatically: reconstructing exactly where a deleted subtree and its cascaded transition removals should be re-inserted is significantly harder than a full-string restore, so the snapshot approach trades undo-implementation complexity for a slightly heavier per-command memory cost (already effectively "free" given the app already keeps full-string history snapshots — see `state-management.md` #2).

### Constraints
A command using the snapshot-restore pattern must capture the snapshot **before** mutating, and its `undo()` must not attempt partial/structural reinsertion — mixing the two strategies within one command has led to bugs (see `ChangeStateTypeCommand`, next entry).

### Alternatives
None found evidenced as a third strategy.

### Evidence
`src/lib/commands/delete-node-command.ts`, `note-commands.ts` (`DeleteNoteCommand`) vs. e.g. `src/lib/commands/rename-state-command.ts`, `update-position-command.ts` (inverse-execute).

### Status
Accepted as a pattern; note the specific defect below is not evidence against the pattern itself.

---

## 3. `ChangeStateTypeCommand`'s undo is confirmed broken for the state→final conversion path

### Context
Converting a state to `final` requires stripping its outgoing transitions and substates (a `<final>` element cannot have either).

### Decision (Inferred behavior — a defect, not an intended design)
`execute()` snapshots the stripped transitions/substates into `oldTransitions`/`oldSubstates` fields, but `undo()` never reads or restores them — it performs a bare inverse-command re-execute (old type name), which does not bring back what was deleted.

### Reason
No comment or commit indicates this was a deliberate scope decision ("undo doesn't need to restore children for this conversion") — the presence of the unused snapshot fields (captured but never consumed) is itself strong evidence this was intended to work and does not.

### Constraints
Do not rely on undo to recover deleted content after a state→final conversion until this is fixed.

### Alternatives
N/A — not a deliberate decision.

### Evidence
`src/lib/commands/change-state-type-command.ts` (`oldTransitions`/`oldSubstates` fields set in `execute()`, never read in `undo()`).

### Status
Inferred behavior — confirmed defect, not an accepted or intended design.

---

## 4. Renaming a state cascades to rewrite every reference automatically

### Context
A state's id is referenced from many places: transition targets, `initial` attributes, and embedded timer-event tokens.

### Decision
`RenameStateCommand` rewrites the state's own id, every `transition[target]` referencing the old id anywhere in the document, every `initial` attribute (token-aware, preserving multi-value lists), and any timer-event tokens (`{oldId}_t_N_timeEvent_N`) — all as part of one rename operation.

### Reason
Explicitly a headline, user-facing product promise, not an implementation detail: `README.md` §"Renaming a State" states "All transitions that reference this state update automatically!" as a called-out feature.

### Constraints
Any future change to how state ids are referenced elsewhere in the document (a new attribute type that can hold a state id, for instance) must be added to this cascade, or renaming would silently leave a dangling reference.

### Alternatives
None found evidenced — no sign a "rename doesn't cascade, user must fix references manually" mode was ever considered.

### Evidence
`src/lib/commands/rename-state-command.ts`, `README.md` §"Renaming a State", commit `2f89613 feat(rename-state): add time-event token renaming for state transitions` (a later extension of the cascade to cover the timer-token case specifically).

### Status
Accepted.

---

## 5. Any size-changing command must proactively clear stale transition waypoints

### Context
The edge renderer always prefers a persisted `viz:waypoints` path over dynamic routing. A command that changes a state's rendered width/height (rename, type change, actions edit, initial toggle) can leave old waypoints visually cutting through the resized node.

### Decision
A shared utility, `clearWaypointsForTouchingTransitions`, is called by every size-affecting command before it returns, clearing `viz:waypoints` on any transition touching the affected state.

### Reason
Explicitly reasoned in the utility's own doc comment: any command changing a state's rendered size can leave edges' persisted paths stale, and since the edge renderer always prefers a persisted path, a stale path would otherwise visually cut through the resized node.

### Constraints
Any **new** command that can change a state's dimensions must also call this utility — it is not automatic/hooked in at a lower shared layer, it's an opt-in call each affected command must make individually.

### Alternatives
None found evidenced (e.g. making the edge renderer itself detect and ignore obviously-stale waypoints was not implemented).

### Evidence
`src/lib/commands/waypoint-invalidation.ts` (doc comment, `clearWaypointsForTouchingTransitions`), called from `rename-state-command.ts`, `change-state-type-command.ts`, `update-actions-command.ts`, `toggle-initial-state-command.ts`.

### Status
Accepted.

---

## 6. Explicit Event/Condition switch replaced an earlier "inferred" selection mode

### Context
The Transition panel needed to let a user specify either an event name or a condition expression for a transition.

### Decision
The panel now uses an explicit, user-controlled Event/Condition mode switch.

### Reason
**This directly replaced a prior design that tried to infer which mode was intended from the typed text.** The refactor commit is explicit about this: `cb4437b refactor(transition-panel): replace inferred selection mode with explicit Event/Condition switch`. This indicates the auto-detection approach (also referenced by the undated plan doc `docs/superpowers/plans/Auto-Detect-Event-vs-Condition.md`) was tried and found insufficiently reliable or clear for users, and was deliberately replaced with an explicit toggle.

### Constraints
Do not reintroduce inferred/auto-detected event-vs-condition mode without addressing whatever made the explicit switch necessary — no specific failure mode is documented in the commit message itself, but the fact that a working explicit alternative replaced it is strong evidence the inference was unreliable enough in practice to abandon.

### Alternatives
**Directly evidenced**: automatic inference of event-vs-condition from typed text was the prior, superseded approach.

### Evidence
Commit `cb4437b`; `docs/superpowers/plans/Auto-Detect-Event-vs-Condition.md` (the original auto-detect proposal); current `src/components/diagram/transition-panel.tsx` (explicit mode switch).

### Status
Accepted (explicit switch); inferred/auto-detected mode is Superseded.

---

## 7. Duplicate transitions are normalized on load and on whole-document paste, not just prevented going forward

### Context
Older or hand-edited SCXML files can contain multiple transitions that are semantically duplicates (same target/type, differing only in an event or condition that could be merged).

### Decision
`mergeDuplicateTransitionsInDocument` (OR-combines `cond` for same target+type+actions) and `mergeDuplicateTransitionsByEventInDocument` (comma-combines `event` lists for same target+type+cond+actions) run automatically on every file load, GitHub pull, and whole-document Monaco paste — in that specific order (event-merge before cond-merge, or event names can be silently dropped per the modules' own comments).

### Reason
This normalization is what allows the static `transition-slot-validator` to only need to catch violations introduced *after* load, per that validator's own docstring — merge-on-load already cleans up legacy duplicates from older files so they don't spam validation errors on documents the user didn't just create.

### Constraints
The two merge functions must run in the documented order; reversing them causes silent event-name loss per their own comments.

### Alternatives
None found evidenced (e.g., flagging duplicates as validation errors instead of silently merging them was not the chosen approach).

### Evidence
`src/lib/utils/transition-merge-utils.ts`, commits `72134d7 feat: implement merging of duplicate transitions`, `003d1ef feat(transitions): merge same-target transitions into comma-separated event lists`, `ebf625a feat(editor): normalize duplicate transitions on whole-document paste`.

### Status
Accepted.

---

## 8. State Actions panel only edits assign/send/cancel rows — narrower than the full executable-content model

### Context
SCXML executable content also includes `raise`, `log`, `script`, `if`/`elseif`/`else`, `foreach` — all structurally supported by the type system and validators.

### Decision (Inferred behavior / gap, not a documented scope decision)
The State Actions panel's `ActionRow` union only supports `assign`/`send`/`cancel`. Opening the panel for a state with other executable-content types in its onentry/onexit and applying any edit silently discards them, since the panel rebuilds the entire onentry/onexit content from only what it understands.

### Reason
No plan/spec document (`docs/superpowers/plans/2026-06-05-state-actions-side-panel.md`, `2026-06-17-reactions-tab.md`) mentions `raise`/`log`/`script`/`if`/`foreach` support being explicitly deferred or out of scope — this appears to be an unrecognized gap rather than a deliberate, documented product decision.

### Constraints
Anyone hand-authoring XML with these executable-content types should avoid subsequently opening/editing that state through the State Actions panel until this is addressed.

### Alternatives
N/A — no evidence of a considered-and-rejected alternative; this reads as an incremental feature (assign/send/cancel shipped first) that was never extended, not a deliberate restriction.

### Evidence
`src/components/ui/state-actions-panel.tsx` (`ActionRow` union), `src/lib/commands/update-actions-command.ts` (rebuilds onentry/onexit from only `ActionRow[]`), absence of `raise`/`log`/`script`/`if`/`foreach` mention in the relevant plan docs.

### Status
Inferred behavior — a real gap, not a stated design decision.
