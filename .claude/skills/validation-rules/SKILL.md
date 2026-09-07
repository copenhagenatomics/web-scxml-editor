---
name: validation-rules
description: Add or edit an SCXMLValidator rule — a new check, a changed error message, a severity change, or closing one of the documented downstream-C#-generator validation gaps. Use specifically for changes to src/lib/validators/*, as distinct from changes to what's semantically valid (state-machine-semantics) or how documents parse (scxml-representation).
---

# Validation Rule Changes

Specializes `.claude/workflows/development.md` and `.claude/workflows/adding-a-validation-rule.md` for `SCXMLValidator` and its 7 sibling validator files. Read `adding-a-validation-rule.md` first — it's the step-by-step recipe; this skill adds the investigation/context layer around it.

## When to use

Adding a new validation check; changing an existing rule's message, severity, or trigger condition; fixing a validator that misses cases (e.g. doesn't recurse through `<parallel>`); closing one of the documented gaps from `docs/invalid-event-identifiers.md`; adding attribute-schema entries.

## Required investigation steps

1. Read `.claude/features/scxml-validation.md` in full — it lists the exact 16-pass pipeline order and every currently-confirmed coverage gap. Check whether your task is literally one of the already-identified gaps (several are) before treating it as novel.
2. Determine which of the 8 validator files your rule belongs in (structural/attribute → `w3c-validator.ts`; reference/target → `transition-validator.ts`/`state-validator.ts`; a rule needing live UI blocking too → a shared utility consumed by both, following the `transition-slot-rules.ts`/`initial-group-utils.ts` pattern).
3. Determine where in the **16-pass order** the new/changed pass belongs — check what state (id sets, hierarchy maps, position index) earlier passes build that yours might depend on.
4. If motivated by a real generator failure, check `docs/invalid-event-identifiers.md` for whether it's one of the 7 documented pitfalls, and cite it as the rationale.
5. **Test against a real file loaded through the actual parser**, not just a hand-constructed object — this domain has a confirmed case (`.executable[]` shape) where a check passes against synthetic test data but is dead code against real parsed files.

## Relevant knowledge files

`.claude/features/scxml-validation.md`, `.claude/workflows/adding-a-validation-rule.md`, `docs/invalid-event-identifiers.md` (the original postmortem motivating several existing rules).

## Relevant project rules

`.claude/project/project-rules.md` §14 (Validation) in full — every rule there is directly applicable.

## Relevant decision records

`.claude/decisions/validation.md` — all 6 entries are relevant; #1 (pass ordering) and #4 (shared-utility dual enforcement) are the two most likely to matter for any given change.

## Implementation expectations

- Add attribute whitelists to `attribute-schemas.ts` as a `Set<string>` addition — never inline a check in the validator body.
- Use the existing position-lookup helpers (`getElementPosition`, `findElementPosition`, `findTransitionPosition`, etc.) in `validator-utils.ts` for line/column info — be aware they're type-and-line based, not identity-based, so multiple same-type violations can report an imprecise line; don't make this worse with a new ad hoc lookup.
- Follow the existing Levenshtein "Did you mean 'X'?" convention (`findSimilarAttribute`, threshold 2) for any new typo-prone-attribute check.
- Decide error vs. warning severity by precedent (structural/reference violations tend to be errors; style/portability/naming issues tend to be warnings) — there's no shared severity policy table to consult mechanically.
- Do not populate `ValidationError.code` unless you're deliberately fixing the fact that no validator currently does — a half-populated `code` field would be worse than the current all-or-nothing gap.
- If the rule needs live blocking too, put the actual logic in a shared `src/lib/utils/*.ts` module, not directly in the validator file.

## Testing expectations

- New test in the relevant validator's own test file (`scxml-validator.test.ts`, `state-validator.test.ts`, `transition-validator.test.ts`, `transition-slot-validator.test.ts`, `initial-group-validator.test.ts`) — as a sibling file, never under `__tests__/`.
- Include a test case using a **realistically-shaped parsed document** (via `SCXMLParser`, not a hand-built object) for anything touching executable content, per the `.executable[]` shape gap above.
- Verify the rule doesn't fire on documents it shouldn't (false positives are as important to test as true positives, especially for anything touching `<parallel>` nesting given the confirmed gap there).

## Common mistakes to avoid

- Adding the rule only to the validator when the concept also needs live UI blocking (or vice versa) — see the `state-machine-semantics` skill for the dual-enforcement pattern this applies to.
- Assuming your new check will fire on `<parallel>`-nested content the same way it does on `<state>`-nested content — several existing checks (`validateCompoundStates`, `validateStateChildren`) confirmed do not, and a new check copying their traversal pattern would inherit the same gap.
- Reordering the 16 passes without checking what depends on what.
- Writing a check that only works against the in-memory `.executable[]` editing shape rather than the real parser's raw tag-name-property output.
