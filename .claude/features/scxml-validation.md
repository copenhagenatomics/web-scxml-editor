# Feature: SCXML Validation Pipeline

## Purpose

Give the user real-time, line/column-precise feedback on both XML syntax and SCXML-semantic/product-specific correctness, so mistakes (including ones that would only surface as opaque failures in the downstream C# code generator) are caught while authoring rather than after deployment.

## User behavior

- Errors/warnings appear automatically ~500ms after the user stops typing or editing.
- The toolbar status dot shows red (errors present) / yellow (warnings only) / green (clean); clicking it opens the Validation Panel.
- Clicking an error jumps to it: if it has a line/column, the code editor scrolls/highlights that location; if it has a `stateId` (from a diagram-relevant check), the diagram instead navigates to and highlights that state (drilling through hierarchy levels as needed).
- A separate "Host Alerts" tab in the same panel shows persistent, host-pushed messages (from the embedding LoopControl host) — entirely independent of this editor's own SCXML validation; only shown as a tab when at least one host alert exists.

## UI behavior

`src/components/ui/validation-panel.tsx` sorts errors before warnings; each item shows message, line/column (if present), a Levenshtein "did you mean" suggestion where applicable (baked into the message text, not a separate field), and an "(error code)" line if `error.code` is set (in practice, `code` is never populated by any validator — see Known limitations).

## Internal architecture

Two fully independent stages, chained but not coupled:
1. **`SCXMLParser.parse(xmlContent)`** (`src/lib/parsers/scxml-parser.ts`) — runs a hand-rolled character-scanning XML syntax checker first (tag-stack matching, CDATA/comment/PI-aware, unescaped-`&` detection, with a heuristic to avoid false "unclosed tag" errors while the user is mid-typing), then `fast-xml-parser`'s own `XMLValidator.validate()` as a second opinion (deduped against the first), then the real parse if no hard errors.
2. **`SCXMLValidator.validate(scxml, xmlContent)`** (`src/lib/validators/scxml-validator.ts`) — only runs if parsing succeeded. **16 ordered passes**, order matters (later passes depend on state built earlier — id sets, hierarchy maps):
   1. Build element-position index + state-id/hierarchy maps.
   2. State reference validation (root `@initial`, every `transition/@target` must resolve).
   3. Root-level `state/@initial` reference validation (dedicated message; does **not** cover nested compound states — see gap below).
   4. Required-attribute walk (missing `id`, missing `target` unless internal, `<initial>` must contain a `<transition>`, etc. — `w3c-validator.ts` + `attribute-schemas.ts`).
   5–6. W3C document compliance (`xmlns`, `version`, `datamodel` enum as warning, `binding` enum as error) + a largely-superseded structural pass.
   7. Semantic checks: unreachable-state BFS from initial (warning), duplicate state ids (error), duplicate `<data>` ids across every nested `<datamodel>` (error, position = **last** occurrence, deliberately), `main_`-prefix portability warning (one warning **per occurrence**, not deduplicated per identifier).
   8. Transition semantics: `type` must be internal/external; internal may only self-target; event-name syntax (comma, not space, separates multi-event lists) as warning.
   9. Transition-slot conflicts (`transition-slot-validator.ts`) — static counterpart of live connect/edit blocking.
   10. Executable-content sanity (`<script>` needs `src` or text).
   11. Unknown-attribute/typo detection against `attribute-schemas.ts` whitelists, Levenshtein "did you mean" (threshold 2).
   12. Cross-hierarchy transition rule (same-parent-only).
   13. Initial-State-group conflicts (`initial-group-validator.ts`).
3. Output: flat `deduplicateErrors(errors)` (`ValidationError[]`, deduped on `message+line+column` composite key).

Consumed by `useContentValidation()` (`src/app/_hooks/use-content-validation.ts`), debounced 500ms, writing into `useEditorStore.errors`.

## Relevant components

`src/components/ui/validation-panel.tsx`, `src/components/layout/two-tab-layout.tsx` (renders the panel + status dot), `src/app/page.tsx` (error-click → editor navigation wiring).

## Relevant state/store

`useEditorStore.errors`, `useEditorStore.focusTarget` (diagram-navigation side effect of a state-scoped error click), `useHostAPIStore.hostErrors` (the unrelated Host Alerts channel).

## Relevant utilities

`src/lib/parsers/scxml-parser.ts`, `src/lib/validators/*` (8 files: `scxml-validator.ts`, `state-validator.ts`, `transition-validator.ts`, `transition-slot-validator.ts`, `initial-group-validator.ts`, `w3c-validator.ts`, `attribute-schemas.ts`, `validator-utils.ts`), `src/lib/utils/resolve-focus-target.ts` (error → diagram navigation).

## SCXML behavior

Validates the parsed object tree, not the raw XML text — position information for messages is recovered via a **separate, approximate** regex-based line index (`parseElementPositions`) rather than tracked through the actual parse (`fast-xml-parser` doesn't retain source positions by default) — see the position-accuracy caveat below.

## Validation rules

Full rule catalogue: `.claude/project/scxml-rules.md`. Confirmed **gaps** (do not assume symmetric coverage across similar cases):
- `validateCompoundStates` only recurses `state → state`, never `state → parallel → state` — a compound state nested inside a `<parallel>` missing `@initial` is not flagged.
- `validateInitialStates`'s dedicated message only fires for **root-level** `state/@initial`; nested levels are only indirectly covered via the unreachable-state BFS, with a generic message, not the parent-aware one.
- `<onentry>`/`<onexit>` unknown-attribute checks read an `.executable[]` shape the real parser does **not** produce for files loaded from disk — effectively dead code for that specific check on real files (required-attribute checks for the same content work fine, since they read differently).
- `validateStateChildren` (onentry/onexit/datamodel/invoke attribute-schema pass) is only invoked for `<state>`, never `<parallel>`.
- Position lookup (`getElementPosition`) is type-and-line based, not identity-based — with multiple same-type elements sharing a violation, the reported line can point at the wrong instance.
- Several of the 7 downstream-C#-generator pitfalls documented in `docs/invalid-event-identifiers.md` (empty `event=""`, C# reserved words, digit-leading event names, wildcard `assign` locations, event-name sanitization collisions) have **no corresponding automated rule yet** — see `.claude/project/scxml-rules.md`.

## Related features

- `initial-state-groups.md`, `transitions-editing.md` — both have a static validator here **and** a live-blocking counterpart sharing the same underlying utility.
- `hierarchy-navigation.md` — the destination of a state-scoped error click.
- `host-api-embedding.md` — the separate Host Alerts channel shown in the same panel.

## Related files

`src/lib/parsers/scxml-parser.ts`, all of `src/lib/validators/*`, `src/app/_hooks/use-content-validation.ts`, `src/components/ui/validation-panel.tsx`.

## Tests

`src/lib/validators/scxml-validator.test.ts`, `state-validator.test.ts`, `transition-validator.test.ts`, `transition-slot-validator.test.ts`, `initial-group-validator.test.ts`. No dedicated test file for `w3c-validator.ts`, `attribute-schemas.ts`, or `validator-utils.ts` individually — their logic is exercised only indirectly through `scxml-validator.test.ts`.

## Known limitations

- `ValidationError.code` is defined in the type but **never populated by any validator** — all classification is message-text-based; don't build new logic that branches on `error.code` without first deciding to actually populate it everywhere.
- Position tracking is approximate (line-and-type based, not a true source map) — can misattribute the reported line for documents with repeated element types sharing a violation.
- `main_`-prefix warnings are emitted **once per textual occurrence**, not deduplicated per identifier — a variable referenced in 5 expressions produces 5 separate warnings.
- Duplicate `<data>` id errors report the position of the **last** occurrence, not the first (a deliberate but easy-to-miss choice, confirmed in code).

## Important edge cases

- Validation runs **even if parsing produced some errors**, as long as a valid `<scxml>` root was extracted (`scxml-parser.ts`'s flow: `hasXMLError` doesn't necessarily stop `validateSCXML`/downstream validation) — so a document with e.g. one malformed tag elsewhere can still surface unrelated semantic errors for the parts that did parse.
- `SCXMLValidator` and the diagram's `SCXMLToXStateConverter` are **fully independent** — validation never blocks or informs rendering, and a document that fails validation still renders normally in the diagram (with whatever partial/best-effort structure the converter can build).

## Things that must NOT be changed

- Do not reorder the 16 validation passes without checking dependencies — several passes rely on state built by earlier ones (the id set and hierarchy maps from pass 1, in particular).
- Do not duplicate transition-slot-conflict or Initial-group-conflict logic directly in `scxml-validator.ts` — always delegate to the shared utility modules (`transition-slot-rules.ts`, `initial-group-utils.ts`) that the live-blocking UI also uses.

## Previous design decisions

`docs/superpowers/plans/2026-05-05-scxml-authoring-validation.md` documents the origin of validation rules specifically motivated by `docs/invalid-event-identifiers.md`'s real-world postmortem (testing `argon_supply.scxml` against the downstream generator) — i.e., several validation rules exist because a real deployment previously failed in an opaque way, and this editor was extended to catch the mistake earlier. Not every documented pitfall from that postmortem has a corresponding rule yet (see gaps above) — closing those gaps is directly traceable, high-value future work.
