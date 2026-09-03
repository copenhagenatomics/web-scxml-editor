# Feature: SCXML Parsing

## Purpose

Turn raw SCXML/XML text into a structured, typed object tree the rest of the app can work with, giving the user precise, friendly line/column error feedback for malformed XML — distinct from `scxml-validation.md`, which covers *semantic* correctness of an already-successfully-parsed document.

## User behavior

Malformed XML (mismatched tags, unquoted attributes, unescaped `&`, duplicate attributes) is caught and reported with a specific line/column, before the document even reaches semantic validation. While actively typing (e.g. a tag not yet closed), the parser tries not to falsely flag "unclosed tag" for what's plausibly just in-progress typing.

## UI behavior

Parse errors appear in the same Validation Panel as semantic validation errors, with the same click-to-navigate behavior — visually indistinguishable to the user from a semantic error, though internally produced by a different stage.

## Internal architecture

`SCXMLParser.parse(xmlContent)` (`src/lib/parsers/scxml-parser.ts`) runs, in strict order:
1. **Visual-namespace pre-check** (`checkForVisualNamespace`) — a regex test for `xmlns:X="http://visual-scxml-editor/metadata"`, run before any real parsing, gating whether `VisualMetadataManager.extractAllVisualMetadata()` is attempted later.
2. **Hand-rolled character-scanning syntax validator** (`validateXMLSyntax`) — this is a genuinely custom implementation, not a wrapper around a library: it walks the raw text character-by-character maintaining a tag stack, tracking whether it's inside a CDATA section, an XML comment, or a processing instruction (so `<`/`>`/`&` inside those contexts aren't misinterpreted as markup), and flags: mismatched/unexpected closing tags, unclosed tags, unquoted attribute values, duplicate attributes (including namespace-prefixed ones, checked separately from unprefixed ones), and unescaped bare `&` not part of a valid entity reference. It explicitly special-cases `viz:`/`xmlns:` attributes to skip strict format checking on them (they may have their own internal formats). It has a specific heuristic to **not** report "unclosed tag" for what looks like a document that's still being actively typed (checks whether the unclosed tag is at the very end of the content and looks incomplete, rather than in the middle of otherwise-complete-looking content).
3. **`fast-xml-parser`'s own `XMLValidator.validate()`** — run as a second, independent opinion; any error it finds that wasn't already caught by step 2 (deduped by matching line+column) is added too.
4. **The real parse** (`fast-xml-parser`'s `XMLParser`, configured with `ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', parseAttributeValue: false, trimValues: true, parseTagValue: true, allowBooleanAttributes: false`) — only attempted if no hard error was found in steps 2–3.
5. **Minimal structural sanity check** (`validateSCXML`) — just confirms the root has a `name`/`initial` attribute or at least one state; explicitly documented in its own comment as a stopgap, deferring "more comprehensive validation" to `SCXMLValidator` (a completely separate class — see `.claude/features/scxml-validation.md`).
6. If a `<scxml>` root was successfully extracted (even alongside some non-fatal errors from earlier steps), `SCXMLValidator.validate()` is invoked on it and its errors appended.

Result: `ParseResult<SCXMLDocument> = {success, data?, errors}` — `success` is `true` iff there are zero `severity: 'error'` entries (warnings don't block success).

## Relevant components

None directly — `SCXMLParser` is invoked from `use-content-validation.ts` and various other places needing a parsed tree (converters, download/export logic).

## Relevant state/store

None — `SCXMLParser` is stateless per call (though it owns one `VisualMetadataManager` instance across its lifetime — see `.claude/features/visual-metadata-namespace.md`).

## Relevant utilities

`src/lib/parsers/scxml-parser.ts` itself is the primary utility; it depends on `fast-xml-parser` (`XMLParser`, `XMLValidator`) and `VisualMetadataManager`.

## SCXML behavior

Produces `SCXMLElement` objects matching `src/types/scxml/index.ts`'s shape (`@_`-prefixed attributes, `#text` for text content) — this is `fast-xml-parser`'s convention, not a custom object model. See `.claude/features/events-and-executable-actions.md` for the important caveat that this real-parse shape does **not** match the `.executable[]`-array shape the app's own in-memory editing code separately constructs.

## Validation rules

Parsing itself enforces only **well-formedness** (steps 2–4 above) — not SCXML semantics. Semantic rules live entirely in the separately-invoked `SCXMLValidator` (step 6), which is a different class with a different, much larger rule set (see `.claude/features/scxml-validation.md`).

## Related features

- `scxml-validation.md` — the semantic-rule engine invoked as the final step of this pipeline, but conceptually and architecturally distinct from parsing itself.
- `scxml-serialization.md` — the inverse operation (object tree → XML string).
- `monaco-code-editor.md` — the consumer that turns this feature's error output into inline editor markers.
- `visual-metadata-namespace.md` — the namespace pre-check that gates metadata extraction.

## Related files

`src/lib/parsers/scxml-parser.ts`, `src/types/scxml/index.ts`, `src/types/common/index.ts` (`ParseResult`, `ValidationError`).

## Tests

No dedicated test file for `scxml-parser.ts` was found in isolation in this pass (its behavior is exercised indirectly via `use-content-validation.ts`'s consumers and other tests that happen to construct/parse SCXML strings) — a gap, given the hand-rolled syntax checker (`validateXMLSyntax`) is genuinely complex, stateful (tag-stack, CDATA/comment/PI tracking), and easy to regress silently.

## Known limitations

- Two independent XML well-formedness checkers run on every parse (the hand-rolled one and `fast-xml-parser`'s own `XMLValidator`) — belt-and-suspenders redundancy that costs some performance on every validation pass (every 500ms debounce tick) for a benefit (catching cases one misses that the other catches) that has not been empirically quantified in this pass; verify whether both are still pulling their weight before assuming either can be safely removed.
- The "don't falsely flag unclosed tag while mid-typing" heuristic is inherently approximate (text-position-based, not a true incremental parser) — it's plausible to construct input that either wrongly suppresses a real unclosed-tag error, or wrongly still shows one for genuinely in-progress typing, though no specific failure case was found in this pass.

## Important edge cases

- The visual-namespace pre-check runs via regex on the **raw text**, before any real XML parsing — a document with a `viz:`-namespace-looking string inside a comment or CDATA section (not actually a real namespace declaration) could produce a false-positive "has visual metadata" detection. Unlikely in practice but worth knowing if debugging an unexpected metadata-extraction attempt on a file that shouldn't have any.

## Things that must NOT be changed

- Do not remove the hand-rolled `validateXMLSyntax` step in favor of relying solely on `fast-xml-parser`'s own validator without first confirming (via a diff of their respective error sets across a range of malformed test inputs) that no error class currently caught by the custom checker would go undetected — the custom checker's specific value (better line/column precision, viz-namespace-aware attribute-format leniency, the mid-typing heuristic) is not necessarily something `fast-xml-parser`'s validator replicates.

## Previous design decisions

The extensive custom-built `validateXMLSyntax` function (rather than relying entirely on `fast-xml-parser`'s validator from the start) suggests `fast-xml-parser`'s own error messages/positions were found insufficiently precise or user-friendly for this app's real-time-as-you-type validation UX — no explicit decision doc confirms this, but the sheer amount of custom logic (CDATA/comment/PI state tracking, the mid-typing heuristic) is hard to explain as anything other than a deliberate response to specific UX shortcomings encountered with the library's own error reporting.
