# Workflow: Adding a New Command (undoable SCXML mutation)

Use this for any new diagram or panel interaction that mutates SCXML content and should participate in undo/redo. See `.claude/project/coding-rules.md` §1–2 for when to choose a Command vs. the direct object-tree edit path — default to a Command unless you have a specific reason to follow the connect/paste/reparent precedent.

## Steps

1. **Create the file**: `src/lib/commands/<verb>-<noun>-command.ts`, exporting a class extending `BaseCommand` (`src/lib/commands/base-command.ts`).
2. **Constructor**: take whatever old+new values are needed to both apply the change and reconstruct its inverse. Look at `update-position-command.ts` (simple) or `rename-state-command.ts` (complex, cascading) as references depending on your command's scope.
3. **`execute(scxmlContent)`**:
   - Call `this.parseXML(scxmlContent)` to get a `Document`; bail out with `this.createFailureResult(error, scxmlContent)` if parsing failed.
   - Locate the target element via `this.findStateElement(doc, id)` (matches state/parallel/final) or `this.findNoteElement(doc, noteId)` (viz-namespace-aware) — don't hand-roll a `querySelector`.
   - If you're setting any `viz:*` attribute for the first time, call `this.ensureVizNamespace(doc)` first.
   - Mutate the DOM element(s) directly.
   - **If your change can alter the state's rendered width/height** (label length, min-size-per-type, action count, badge presence), call `clearWaypointsForTouchingTransitions(doc, stateId)` from `waypoint-invalidation.ts` before returning — otherwise stale persisted edge waypoints can visually cut through the resized node (see `.claude/project/coding-rules.md` §2).
   - Return `this.createSuccessResult(this.serializeXML(doc), affectedElementIds)`.
4. **`undo(scxmlContent)`**: pick one of the two established patterns:
   - **Inverse re-execute** (preferred, most commands use this): construct a new instance of the same class with old/new values swapped, call `.execute()` on it, return its result.
   - **Snapshot restore** (only when structural re-insertion is genuinely harder than a string diff, e.g. delete operations): capture the full pre-change content string during `execute()`, return it verbatim from `undo()`. Be aware this means your `undo()` won't do fine-grained reinsertion — verify that's acceptable for your case (see the known `ChangeStateTypeCommand` gap in `.claude/features/state-node-types.md` as a cautionary example of getting this pattern wrong).
5. **`getDescription()`**: a short human string for history/undo UI (e.g. `` `Rename state "${old}" to "${new}"` ``).
6. **Export** from `src/lib/commands/index.ts`.
7. **Wire it into `visual-diagram.tsx`** (or wherever it's invoked from): follow the existing pattern of lazy `require('@/lib/commands/...')` inside the handler, matching the rest of that file (see `.claude/project/coding-rules.md` §7) — call `.execute(scxmlContent)`, check `.success`, then call `onSCXMLChange(result.newContent, changeType)` with the appropriate `changeType` hint (`'position'|'resize'` for debounced tracking, `'structure'|'property'` for immediate).
8. **Write a test**: `<same-name>.test.ts` **as a sibling file**, not under a `__tests__/` subdirectory (that directory is excluded from `npm test` — see `.claude/workflows/running-and-writing-tests.md`). Test both `execute()` and `undo()` round-tripping back to the original content, plus any cascading side effects (reference rewrites, waypoint clearing).

## Checklist before considering it done

- [ ] Does it use `DOMParser`/`XMLSerializer` (via `BaseCommand` helpers), not `fast-xml-parser`? (Don't mix the two mutation strategies within one command.)
- [ ] Does `undo()` actually restore prior state correctly, including any cascading changes `execute()` made?
- [ ] If size-affecting: does it call `clearWaypointsForTouchingTransitions`?
- [ ] If it sets a new `viz:*` attribute: does it call `ensureVizNamespace`?
- [ ] Test file is a sibling, not under `__tests__/`.
- [ ] Exported from `commands/index.ts`.
