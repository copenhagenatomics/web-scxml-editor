# Feature: SCXML Serialization (object/DOM → XML string)

## Purpose

Turn an in-memory representation of an SCXML document back into a well-formed XML string — the inverse of `scxml-parsing.md` — and do so via **two genuinely different mechanisms**, one per mutation strategy (see `.claude/project/architecture.md`).

## User behavior

Invisible — every edit the user makes eventually needs to become a new XML string for the code editor to display and for export/GitHub-push to use; this document is about how that string is actually produced.

## UI behavior

N/A directly, though formatting quality (indentation, attribute ordering) affects what the user sees in the Code tab after any diagram edit.

## Internal architecture — two independent serializers

### 1. `fast-xml-parser`'s `XMLBuilder` (used by `VisualMetadataManager`)

`VisualMetadataManager.serializeWithVisualMetadata(scxmlDoc, config)` (`src/lib/metadata/visual-metadata-manager.ts`) builds an `XMLBuilder` instance and serializes the full parsed-object tree. Notable specifics:
- **Boolean-attribute-preservation workaround**: `XMLBuilder` coerces a string attribute value of `"true"`/`"false"` into a bare XML boolean attribute (e.g. dropping the `="true"` entirely) — undesirable for this app's data, which needs those exact string values preserved. `preserveBooleanAttributes`/`cleanupPreservationMarkers` wrap such values in `__PRESERVE__...__PRESERVE__` markers before building, then strip the markers via regex after — a real, working hack around a library formatting default that doesn't suit this app's needs.
- Used at parse/serialize boundaries: called from `SCXMLParser.serialize()` (the method actually invoked by clean-export, per `.claude/features/file-import-export.md`) and from `transition-merge-utils.ts` after a load-time merge pass.
- Clean (metadata-stripped) output takes a **different internal path** (`serializeCleanSCXML`) that recursively rebuilds the object tree first, dropping any key containing `viz:` or the `xmlns:viz` declaration, before handing off to the same `XMLBuilder`.

### 2. Browser-native `DOMParser`/`XMLSerializer` (used by every `Command`)

`BaseCommand.serializeXML(doc)` (`src/lib/commands/base-command.ts`) calls the browser's native `XMLSerializer.serializeToString(doc)`, then pipes the result through `formatXML()` (`src/lib/utils/format-utils.ts`) — a **custom, regex/line-based pretty-printer**, not a full XML formatter, that re-indents the serializer's typically-unindented single-line-ish output into something readable.
- Every one of the 16 Command classes uses this path exclusively — see `.claude/project/coding-rules.md` §1 for why this must never be mixed with the `fast-xml-parser`-based path within one mutation.
- `formatXML`'s counterpart `minifyXML` also exists in the same utility file (collapses whitespace) — check current call sites before assuming it's wired into any live feature; it may be a utility kept for potential future use (e.g. minified export) rather than actively invoked today.

## Relevant components

None directly — this is pure `src/lib/` infrastructure invoked from many places.

## Relevant state/store

None — purely functional, no state of its own beyond `VisualMetadataManager`'s already-documented metadata cache (see `.claude/features/visual-metadata-namespace.md`).

## Relevant utilities

`src/lib/metadata/visual-metadata-manager.ts` (`serializeWithVisualMetadata`, `serializeCleanSCXML`, `preserveBooleanAttributes`, `cleanupPreservationMarkers`), `src/lib/commands/base-command.ts` (`serializeXML`), `src/lib/utils/format-utils.ts` (`formatXML`, `minifyXML`, `escapeXML`/`unescapeXML`).

## SCXML behavior

Both serializers must produce valid, well-formed XML the parser can round-trip — but they are **not guaranteed to produce byte-identical output for the same logical document** (different libraries, different formatting conventions). A document that has been edited via both Commands (DOM-based) and clean-exported (fast-xml-parser-based) at different points in its lifecycle could show subtly different whitespace/formatting conventions across those edits — cosmetic, not semantic, but worth knowing if a diff ever looks larger than the actual logical change.

## Validation rules

None — serialization doesn't validate, it only formats already-mutated content. Any validation happens separately, before or after, never during serialization itself.

## Related features

- `scxml-parsing.md` — the inverse operation.
- `visual-metadata-namespace.md` — clean-export's `serializeCleanSCXML` path is one of this feature's two serializers.
- `file-import-export.md` — the ultimate consumer of clean-export serialization.
- All Command-based features (`state-editing.md`, `transitions-editing.md`, `node-positioning.md`, etc.) — every one of them ends in a call to `BaseCommand.serializeXML`.

## Related files

`src/lib/metadata/visual-metadata-manager.ts`, `src/lib/commands/base-command.ts`, `src/lib/utils/format-utils.ts`.

## Tests

No dedicated test file for `format-utils.ts`'s `formatXML`/`minifyXML` was found in this pass — given this function runs on the output of literally every Command, a lack of direct test coverage on its formatting edge cases (self-closing tags, mixed content, attribute ordering) is a real gap.

## Known limitations

- Two independent serializers with potentially different output conventions for logically-identical content — see SCXML behavior above.
- `formatXML` is a **custom regex/line-based formatter**, not a real XML pretty-printer built on a parse tree — it's inherently more fragile against unusual input shapes (deeply nested mixed content, unusual whitespace-significant text nodes) than a tree-based formatter would be. No specific failure case was found in this pass, but this is a structurally riskier implementation choice than using an established formatting library.
- `minifyXML`'s actual live usage is unconfirmed — verify before assuming it's part of any user-facing export path.

## Important edge cases

- The `__PRESERVE__` marker workaround for boolean-looking attribute values assumes that exact marker string never legitimately appears as real content elsewhere in the document — an extremely unlikely but theoretically possible collision (e.g. a user's own datamodel expression literally containing the string `__PRESERVE__`) would corrupt serialization output in a hard-to-diagnose way.

## Things that must NOT be changed

- Do not mix the two serialization paths within a single mutation — a Command must always end with `this.serializeXML(doc)` (DOM-based), never `VisualMetadataManager`'s `XMLBuilder`-based path, or the resulting content could have inconsistent formatting conventions partway through a single logical operation.
- Do not remove the `__PRESERVE__` boolean-attribute workaround without confirming `fast-xml-parser`'s `XMLBuilder` no longer coerces `"true"`/`"false"` string attributes into bare booleans (check the library's changelog/behavior on any version upgrade) — this is a real, currently-necessary hack, not defensive-but-unneeded code.

## Previous design decisions

The existence of two independent, technology-different serializers is a direct consequence of the two-mutation-strategy split documented in `.claude/project/architecture.md` and `.claude/decisions/architecture.md` #2 — see also `.claude/decisions/scxml.md` #9, which records this duality explicitly as **Inferred behavior** rather than a standalone decision; it inherits its shape entirely from that earlier architectural split.
