# Feature: SCXML Validation Pipeline

## Purpose

Give the user real-time, line/column-precise feedback on both XML syntax and SCXML-semantic/product-specific correctness, so mistakes (including ones that would only surface as opaque failures in the downstream C# code generator) are caught while authoring rather than after deployment.

## User behavior

- Errors/warnings appear automatically ~500ms after the user stops typing or editing.
- The toolbar validation badge (`ValidationStatusBadge`, issue #82) toggles the Validation Panel:
  - **Errors:** a red pill such as "2 errors · 1 warning".
  - **Warnings only:** an amber pill such as "1 warning".
  - **Clean:** a small green check, with no text.
  - Counts include Host Alerts (error/warning level) as well as this editor's own validation results.
  - It replaced a bare colored dot that users didn't notice or understand. The space came from turning the tips bar into a 💡 button (#93, `tips-popover.md`).
- Clicking an error jumps to it: if it has a line/column, the code editor scrolls/highlights that location; if it has a `stateId` (from a diagram-relevant check), the diagram instead navigates to and highlights that state (drilling through hierarchy levels as needed).
- A separate "Host Alerts" tab in the same panel shows persistent, host-pushed messages (from the embedding LoopControl host) — entirely independent of this editor's own SCXML validation; only shown as a tab when at least one host alert exists. As of `decisions/error-handling.md` #6, this tab can also receive entries the user didn't explicitly push via `showErrors()`: any host `showFeedback(msg, 'error')` call (e.g. a failed "Apply"/"Generate Program" action) is auto-mirrored here too — see `host-api-embedding.md`.

## UI behavior

`src/components/ui/validation-panel.tsx` sorts errors before warnings; each item shows message, line/column (if present), a Levenshtein "did you mean" suggestion where applicable (baked into the message text, not a separate field), and an "(error code)" line if `error.code` is set (in practice, `code` is never populated by any validator — see Known limitations).

## Internal architecture

Two fully independent stages, chained but not coupled:
1. **`SCXMLParser.parse(xmlContent)`** (`src/lib/parsers/scxml-parser.ts`) — runs a hand-rolled character-scanning XML syntax checker first (tag-stack matching, CDATA/comment/PI-aware, unescaped-`&` detection, with a heuristic to avoid false "unclosed tag" errors while the user is mid-typing), then `fast-xml-parser`'s own `XMLValidator.validate()` as a second opinion (deduped against the first), then the real parse if no hard errors.
2. **`SCXMLValidator.validate(scxml, xmlContent)`** (`src/lib/validators/scxml-validator.ts`) — only runs if parsing succeeded. **17 ordered passes**, order matters (later passes depend on state built earlier — id sets, hierarchy maps):
   1. Build element-position index + state-id/hierarchy maps.
   2. State reference validation (root `@initial`, every `transition/@target` must resolve).
   3. Root-level `state/@initial` reference validation (dedicated message; does **not** cover nested compound states — see gap below).
   4. Required-attribute walk (missing `id`, missing `target` unless internal, `<initial>` must contain a `<transition>`, etc. — `w3c-validator.ts` + `attribute-schemas.ts`).
   5–6. W3C document compliance (`xmlns`, `version`, `datamodel` enum as warning, `binding` enum as error) + a largely-superseded structural pass.
   7. Semantic checks: unreachable-state BFS from initial (warning), duplicate state ids (error), duplicate `<data>` ids across every nested `<datamodel>` (error, position = **last** occurrence, deliberately), `main_`-prefix portability warning (one warning **per occurrence**, not deduplicated per identifier).
   7b. Compound states without an initial (`validateCompoundStates`, its own `run` pass): an **error** for every `<state>` with `<state>`/`<parallel>`/`<final>`/`<history>` children but no `@initial` and no `<initial>` child. It covers any depth, through `<parallel>` regions too; a `<parallel>` itself is exempt. The position is exact (path-based) on the `<state` tag. Before Nov 2026 it only walked `state → state`, so regions of a `<parallel>` were never checked.
   8. Transition semantics: `type` must be internal/external; internal may only self-target; event-name syntax (comma, not space, separates multi-event lists) as warning.
   9. Transition-slot conflicts (`transition-slot-validator.ts`) — static counterpart of live connect/edit blocking.
   10. Executable-content sanity (`<script>` needs `src` or text).
   11. Unknown-attribute/typo detection against `attribute-schemas.ts` whitelists (`getElementAttributeSchemas()`), Levenshtein "did you mean" (threshold 2). One generic recursive walk over the real parser shape reaches every schema'd element (root `<datamodel>`, `<parallel>` children, executable content at any depth); unlisted/foreign elements and `<content>` payloads are skipped, namespaced attributes and `xmlns` are allowed, `#text` is content not an attribute, and `confType` is whitelisted on `<data>` (Config panel convention).
   12. Cross-hierarchy transition rule (same-parent-only).
   13. Initial-State-group conflicts (`initial-group-validator.ts`).
   Each pass runs inside a `run(passName, …)` guard in `SCXMLValidator.validate`: a pass that throws on a half-edited document becomes a single "could not run" warning, so it never discards the other passes' diagnostics. (Before this guard, an id-less `<state>` named in `initial` crashed `getInitialIds` → `parseStateIdList`, and the editor showed no errors at all.)
   14. Eventless `_event.data` entry (`event-data-validator.ts`): a **warning** on every transition with no `event` (or `event=""`, not `type="internal"`) whose target reads `_event.data` in its `<onentry>`, or in the `<onentry>` of a descendant entered by default (`@initial` / `<initial>` / first child; all regions of a `<parallel>`). The downstream runtime evaluates `_event.data` to 0 there, which surprised users. `<initial>` transitions are deliberately **not** checked (user decision). Reads in `<onexit>` or inside transitions are not flagged.
   15. `this_` channel types (`this-channel-validator.ts`, logic in `findThisChannelTypeIssues`, `datamodel-extractor.ts`, the same inference `syncThisChannels` uses on Apply). It checks every `cond` and `<assign>`, in any state including `<parallel>` regions:
       - an **error** for a `this_` channel that is referenced but not declared (the host's "Condition identifier(s) not found");
       - a **warning** when its uses disagree, true/false in one place and a number in another (no fix);
       - a **warning** when the declared value's type contradicts a use: a number used as true/false, true/false compared to or assigned a number, or an int assigned a double.

       The undeclared and mismatch entries carry a `fix` (`ValidationFix`: `add-data` / `set-data-expr`). The panel renders it as a **Fix** button, and `page.tsx` applies it via `applyValidationFix` as a discrete edit with its own undo entry. It exists for client feedback (Nov 2026): users couldn't fix host type errors without hand-editing SCXML. The visual panels already auto-fix generated values on Apply, but only for the channels in what was applied. So in practice this surfaces code-editor edits, hand-written values, disagreeing uses, and wrong channels elsewhere in the document. It is also the first rule to populate `ValidationError.fix`.
3. Output: flat `deduplicateErrors(errors)` (`ValidationError[]`, deduped on `message+line+column` composite key).

Consumed by `useContentValidation()` (`src/app/_hooks/use-content-validation.ts`), debounced 500ms, writing into `useEditorStore.errors`.

## Relevant components

`src/components/ui/validation-panel.tsx`, `src/components/ui/validation-status-badge.tsx` (toolbar badge, tested in `validation-status-badge.test.tsx`), `src/components/layout/two-tab-layout.tsx` (renders the panel), `src/app/page.tsx` (renders the badge; error-click → editor navigation wiring).

## Relevant state/store

`useEditorStore.errors`, `useEditorStore.focusTarget` (diagram-navigation side effect of a state-scoped error click), `useHostAPIStore.hostErrors` (the unrelated Host Alerts channel).

## Relevant utilities

`src/lib/parsers/scxml-parser.ts`, `src/lib/validators/*` (8 files: `scxml-validator.ts`, `state-validator.ts`, `transition-validator.ts`, `transition-slot-validator.ts`, `initial-group-validator.ts`, `w3c-validator.ts`, `attribute-schemas.ts`, `validator-utils.ts`), `src/lib/utils/resolve-focus-target.ts` (error → diagram navigation).

## SCXML behavior

Validates the parsed object tree, not the raw XML text. `fast-xml-parser` doesn't retain source positions, so `buildSourceElementIndex` (`validator-utils.ts`) scans the raw XML once and maps each element **path** — `scxml.state[0].datamodel[0].data[1]`, the same shape the required-attribute and unknown-attribute walks build (same-named siblings keep document order in the parser's arrays) — to the exact `<tag` range and each `name="value"` attribute range. `ValidationError.endLine`/`endColumn` carry the range end to the Monaco markers. The older type-and-line index (`parseElementPositions`/`findElementPosition`) remains only as a fallback and for passes not yet migrated — see the position-accuracy caveat below.

## Validation rules

Full rule catalogue: `.claude/project/scxml-rules.md`. Confirmed **gaps** (do not assume symmetric coverage across similar cases):
- `validateInitialStates`'s dedicated message only fires for **root-level** `state/@initial`; nested levels are only indirectly covered via the unreachable-state BFS, with a generic message, not the parent-aware one.
- Position lookup is exact (path-based) only for required-attribute, unknown-attribute and compound-state-initial errors. Other passes (unreachable/duplicate states — which navigate by `stateId` instead — transition semantics, `<script>` content) still have no line or use type-and-line helpers.
- Several of the 7 downstream-C#-generator pitfalls documented in `docs/invalid-event-identifiers.md` (empty `event=""`, C# reserved words, digit-leading event names, wildcard `assign` locations, event-name sanitization collisions) have **no corresponding automated rule yet** — see `.claude/project/scxml-rules.md`.

## Related features

- `initial-state-groups.md`, `transitions-editing.md` — both have a static validator here **and** a live-blocking counterpart sharing the same underlying utility.
- `hierarchy-navigation.md` — the destination of a state-scoped error click.
- `host-api-embedding.md` — the separate Host Alerts channel shown in the same panel.

## Related files

`src/lib/parsers/scxml-parser.ts`, all of `src/lib/validators/*`, `src/app/_hooks/use-content-validation.ts`, `src/components/ui/validation-panel.tsx`.

## Tests

`src/lib/validators/scxml-validator.test.ts` (includes parser-driven unknown-attribute/position regression tests), `state-validator.test.ts`, `transition-validator.test.ts`, `transition-slot-validator.test.ts`, `initial-group-validator.test.ts`, `src/lib/parsers/scxml-parser.test.ts` (syntax diagnostics). No dedicated test file for `w3c-validator.ts`, `attribute-schemas.ts`, or `validator-utils.ts` individually — their logic is exercised only indirectly through `scxml-validator.test.ts`.

## Known limitations

- `ValidationError.code` is defined in the type but **never populated by any validator** — all classification is message-text-based; don't build new logic that branches on `error.code` without first deciding to actually populate it everywhere.
- Position tracking outside the attribute passes is still approximate (line-and-type based) — can misattribute the reported line for documents with repeated element types sharing a violation.
- Parser syntax errors: on a closing tag that matches nothing open, the hand-rolled checker treats it as a misspelled close of the innermost tag (one error, no cascade); on a close of an outer tag, it reports each inner tag as unclosed at its opening position. `fast-xml-parser`'s `InvalidTag` second opinion is suppressed once a tag-nesting error is already reported.
- `main_`-prefix warnings are emitted **once per textual occurrence**, not deduplicated per identifier — a variable referenced in 5 expressions produces 5 separate warnings.
- Duplicate `<data>` id errors report the position of the **last** occurrence, not the first (a deliberate but easy-to-miss choice, confirmed in code).

## Important edge cases

- `SCXMLValidator` runs **only when parsing succeeded** (`useContentValidation` checks `parseResult.success`), so while any XML syntax error exists the user sees only syntax errors; semantic/attribute errors appear once the XML is well-formed. (Inside `SCXMLParser.parse`, the light `validateSCXML` root check still runs whenever an `<scxml>` root was extracted.)
- `SCXMLValidator` and the diagram's `SCXMLToXStateConverter` are **fully independent** — validation never blocks or informs rendering, and a document that fails validation still renders normally in the diagram (with whatever partial/best-effort structure the converter can build).

## Things that must NOT be changed

- Do not reorder the 17 validation passes without checking dependencies — several passes rely on state built by earlier ones (the id set and hierarchy maps from pass 1, in particular).
- Do not duplicate transition-slot-conflict or Initial-group-conflict logic directly in `scxml-validator.ts` — always delegate to the shared utility modules (`transition-slot-rules.ts`, `initial-group-utils.ts`) that the live-blocking UI also uses.

## Previous design decisions

`docs/superpowers/plans/2026-05-05-scxml-authoring-validation.md` documents the origin of validation rules specifically motivated by `docs/invalid-event-identifiers.md`'s real-world postmortem (testing `argon_supply.scxml` against the downstream generator) — i.e., several validation rules exist because a real deployment previously failed in an opaque way, and this editor was extended to catch the mistake earlier. Not every documented pitfall from that postmortem has a corresponding rule yet (see gaps above) — closing those gaps is directly traceable, high-value future work.
