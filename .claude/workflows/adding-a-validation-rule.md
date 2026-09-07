# Workflow: Adding or Extending a Validation Rule

See `.claude/features/scxml-validation.md` for the full 16-pass pipeline and its confirmed coverage gaps — check that list first, since several plausible "missing rule" ideas are already identified there (some directly traceable to `docs/invalid-event-identifiers.md`'s downstream-generator pitfalls).

## Steps

1. **Decide which file the rule belongs in**, matching existing categorization:
   - Structural / required-attribute → `w3c-validator.ts` + `attribute-schemas.ts` (if it's about a new legal attribute).
   - Reference/target resolution → `transition-validator.ts` (transitions) or `state-validator.ts` (states/hierarchy).
   - A rule that also needs **live UI blocking** (like transition slots or Initial groups) → put the actual rule logic in a shared `src/lib/utils/*.ts` module first, then have both the live-blocking call site (in `visual-diagram.tsx` or a panel) and the static validator import from it. **Never implement the same rule twice independently** — see `.claude/project/coding-rules.md` §3.
   - A one-off document-wide semantic check → `scxml-validator.ts`'s own `validateStateMachineSemanticsInternal`.
2. **Decide where in the 16-pass order it belongs** (`scxml-validator.ts`'s `validate()` method). If your rule needs the id set or hierarchy map built in pass 1, it must run after that — check what state earlier passes build before assuming you can run anywhere.
3. **Write the rule function** returning `ValidationError[]` matching the existing shape: `{message, line?, column?, severity: 'error'|'warning', code?, stateId?, targetStateId?}`. Note `code` is currently never populated anywhere — either follow that (don't populate it) or decide deliberately to start populating it consistently everywhere, not just your new rule.
4. **Get line/column info** via the existing `elementPositions` map / `validator-utils.ts` helpers (`getElementPosition`, `findElementPosition`, `findTransitionPosition`, `findDataIdPositions`, `findIdentifierPositions`) rather than writing new position-lookup logic — be aware these are type-and-line based, not identity-based (a known imprecision, see `.claude/features/scxml-validation.md`'s Known limitations).
5. **If checking attribute legality**: add to the relevant `Set<string>` in `attribute-schemas.ts`, don't hardcode a check inline in the validator.
6. **Decide error vs. warning severity** deliberately — there's no shared severity policy table in this codebase; look at similar existing rules for precedent (structural/reference violations tend to be errors; style/portability/naming issues tend to be warnings).
7. **Recurse through `<parallel>` too, not just `<state>`**, if your rule is about compound/nested structure — this is exactly the kind of gap already found twice in the existing pipeline (`validateCompoundStates`, `validateStateChildren`) and is easy to reproduce accidentally.
8. **Write a test** in `scxml-validator.test.ts` or the specific sub-validator's own test file, as a sibling file (not under `__tests__/`).
9. **Manually verify against a real file loaded from disk**, not just an in-memory-constructed object — this codebase has at least one confirmed case (`<onentry>`/`<onexit>` unknown-attribute checks) where a validator works against the app's own in-memory editing shape but is silently dead against what `fast-xml-parser` actually produces for a file loaded from disk. Don't assume your rule works on real files just because a hand-constructed test object passes.

## If motivated by a downstream-generator constraint

Cross-check against the unclosed items in `docs/invalid-event-identifiers.md` and `.claude/project/scxml-rules.md`'s "Downstream consumer constraints" section — several real, previously-observed C#-generator failure modes (reserved-word event names, digit-leading event names, wildcard `assign` locations, event-name sanitization collisions) don't have a rule yet. Closing one of these is directly traceable, high-value work with a documented real-world failure to cite as motivation.
