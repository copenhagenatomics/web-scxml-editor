# Validation Decisions

---

## 1. Validation is organized as 16 ordered, dependency-sensitive passes in one orchestrating method

### Context
SCXML correctness spans many independent concerns: structure, references, attributes, semantics, product-specific rules.

### Decision
`SCXMLValidator.validate()` runs 16 passes in a fixed order, where later passes rely on state built by earlier ones (the id set and hierarchy maps from pass 1, in particular) rather than each pass being fully self-contained.

### Reason
Not documented in a dedicated design note, but building shared lookups (id sets, position index, hierarchy maps) once and reusing them across passes avoids redundant tree-walking for what would otherwise be many independent full-document scans.

### Constraints
Passes cannot be freely reordered or run in isolation — adding a new pass requires understanding what it depends on from earlier passes (see `.claude/workflows/adding-a-validation-rule.md`).

### Alternatives
None found evidenced (e.g., a plugin-style independent-rule-registry architecture was not adopted).

### Evidence
`src/lib/validators/scxml-validator.ts` (`validate()` method, sequential pass structure).

### Status
Accepted.

---

## 2. Structural/syntax validation is architecturally separate from semantic validation

### Context
XML well-formedness (tags, quoting, escaping) and SCXML-semantic correctness (unreachable states, duplicate ids, slot conflicts) are different kinds of problems.

### Decision
`SCXMLParser` (structural/syntax) and `SCXMLValidator` (semantic) are separate classes with separate responsibilities; the parser's own minimal structural check explicitly defers to the validator for "more comprehensive validation."

### Reason
Explicitly stated in code: `scxml-parser.ts`'s `validateSCXML` method comment says "more comprehensive validation is done by SCXMLValidator" — a direct acknowledgment of the intentional division of labor.

### Constraints
A new correctness check should be added to whichever class matches its nature (raw XML well-formedness → parser; SCXML semantics → validator) rather than blurring the line.

### Alternatives
None found evidenced.

### Evidence
`src/lib/parsers/scxml-parser.ts` (`validateSCXML` comment), `src/lib/validators/scxml-validator.ts`.

### Status
Accepted.

---

## 3. Several validation rules exist specifically to catch downstream C#-generator failures, not just W3C non-compliance

### Context
The SCXML authored here is compiled by a separate C# code generator running on Raspberry Pi control hardware. A real deployment (`argon_supply.scxml`) previously failed in ways the SCXML spec itself wouldn't flag as invalid.

### Decision
Validation rules were added in direct response to a documented postmortem of real generator failures: event names that are C# reserved words, event names starting with a digit, empty `event=""`, wildcard `*` in `assign/@location`, undeclared datamodel variables referenced in `<assign>`, and — most subtly — two differently-punctuated event names collapsing to the same generator-sanitized identifier.

### Reason
Directly documented: `docs/invalid-event-identifiers.md` is a first-hand postmortem ("Problems found while testing `argon_supply.scxml`") explicitly written to drive `docs/superpowers/plans/2026-05-05-scxml-authoring-validation.md`.

### Constraints
Not every documented pitfall in the postmortem has a corresponding automated rule yet (verified gap, see `scxml-validation.md` feature doc) — closing these is directly traceable, low-risk, high-value work grounded in a real prior incident.

### Alternatives
None found evidenced — no discussion of instead fixing the generator itself (consistent with the generator being outside this repo's control).

### Evidence
`docs/invalid-event-identifiers.md`, `docs/superpowers/plans/2026-05-05-scxml-authoring-validation.md`.

### Status
Accepted (motivating rationale); implementation coverage of all 7 documented pitfalls is incomplete (see gaps noted in `.claude/features/scxml-validation.md`).

---

## 4. Live UI blocking and static validation for the same rule always share one implementation

### Context
Transition-slot conflicts and Initial-State-group conflicts each need to be both prevented live (blocking an invalid connect/edit gesture before it happens) and caught statically (for hand-edited/pasted XML that bypassed the live UI).

### Decision
Both enforcement points call into the same shared utility module (`transition-slot-rules.ts`, `initial-group-utils.ts`) rather than each having its own independent implementation of the underlying rule.

### Reason
Not documented in a single design note, but this is the only way to guarantee the two enforcement points can never silently diverge — a change to the rule made in only one place would otherwise create an inconsistency between what the UI blocks live and what static validation flags after the fact.

### Constraints
Any change to slot/group semantics must be made in the shared utility, never duplicated inline in a validator or a diagram event handler.

### Alternatives
None found evidenced.

### Evidence
`src/lib/utils/transition-slot-rules.ts` (used by both `visual-diagram.tsx`'s `onConnect` and `transition-slot-validator.ts`), `src/lib/utils/initial-group-utils.ts` (used by both the State Actions panel's Initial checkbox / `onConnect`, and `initial-group-validator.ts`).

### Status
Accepted.

---

## 5. Unknown-attribute detection includes Levenshtein-distance "did you mean" suggestions

### Context
A typo'd attribute name (e.g. `traget` instead of `target`) is a common authoring mistake.

### Decision
`findSimilarAttribute` computes Levenshtein distance (threshold 2) against the element's known-valid attribute set and appends a "Did you mean 'X'?" suggestion to the unknown-attribute error message.

### Reason
Not documented in a dedicated note, but this is a deliberate UX investment beyond the minimum needed to flag an error — spell-check-style suggestions specifically help a user self-correct without needing to consult the SCXML spec.

### Constraints
The threshold (2) and the attribute whitelist source (`attribute-schemas.ts`) must stay in sync — a new legal attribute added to an element's schema without updating call sites correctly would either miss real typos or produce false suggestions.

### Alternatives
None found evidenced (e.g. a full spell-checker library was not used; this is a small custom Levenshtein implementation).

### Evidence
`src/lib/validators/validator-utils.ts` (`levenshteinDistance`, `findSimilarAttribute`), `src/lib/validators/attribute-schemas.ts`.

### Status
Accepted.

---

## 6. `ValidationError.code` exists in the type but is never populated

### Context
The `ValidationError` type includes an optional `code` field, presumably intended for programmatic error classification distinct from the free-text `message`.

### Decision (Inferred behavior)
No validator anywhere in the codebase sets `code` on any error it produces — all classification in practice is done via free-text message matching.

### Reason
No comment or commit explains this — most plausibly the field was added in anticipation of future structured error codes (e.g., for i18n, or for a future API consumer that wants to branch on error type without string-matching) that was never followed through on.

### Constraints
Do not build new logic that assumes `code` is populated without also deciding to actually populate it consistently across all validators — a partial population would be worse than the current all-or-nothing gap.

### Alternatives
N/A.

### Evidence
`src/types/common/index.ts` (`ValidationError.code?: string`), absence of any `code:` assignment across `src/lib/validators/*`.

### Status
Inferred behavior — an unfinished/unused provision, not an active decision.
