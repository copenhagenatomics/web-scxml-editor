---
name: scxml-representation
description: Change how SCXML is parsed, serialized, or how the viz: visual-metadata namespace works — new element/attribute support, spec-compliance fixes, namespace schema changes, clean-export behavior. Use for changes to the SCXML document model itself, as opposed to changes to what a valid document is allowed to contain (that's state-machine-semantics or validation-rules).
---

# SCXML Representation Changes

Specializes `.claude/workflows/development.md` for the document-model layer: how SCXML text becomes an in-memory structure and back, and how this app's own non-standard `viz:` data rides alongside it. This is one of the two domain-specific skills (the other is `state-machine-semantics`) because this layer has its own file set, its own two-serializer duality, and its own backward-compatibility obligations that a generic feature-development pass would likely miss.

## When to use

Adding support for an SCXML element/attribute this app doesn't yet parse or preserve correctly; changing how `viz:` data is read/written; fixing a round-trip bug (something gets lost or mangled between load and save); changing the clean-export (metadata-stripping) behavior; anything involving `fast-xml-parser` configuration or the hand-rolled XML syntax checker.

## Required investigation steps

1. Determine whether you're touching the **parsing** side (`SCXMLParser`), the **serialization** side (`BaseCommand.serializeXML` or `VisualMetadataManager`), or the **`viz:` namespace** itself — these are three related but distinct concerns with different files.
2. Read `.claude/features/scxml-parsing.md`, `scxml-serialization.md`, and `visual-metadata-namespace.md` for whichever apply.
3. Confirm which of the **two independent serializers** you're in: native `DOMParser`/`XMLSerializer` (Commands) or `fast-xml-parser`'s `XMLBuilder` (`VisualMetadataManager`, clean export). Never write code that mixes them.
4. Check whether your change needs a **backward-compatibility path** for documents created before it — this repo has three live precedents (legacy `viz:` namespace URI/prefix migration, `annotateLegacyConfTypes` backfill, dual `<initial>` element/attribute reading) to follow the shape of.
5. Confirm the type shape in `src/types/scxml/index.ts` actually matches what `fast-xml-parser` produces for your case — this repo has a **confirmed, live mismatch** (the `.executable[]` array shape doesn't match real parsed output) that's easy to reproduce accidentally in a new feature if you copy that pattern without checking.

## Relevant knowledge files

`.claude/features/scxml-parsing.md`, `scxml-serialization.md`, `visual-metadata-namespace.md`, `file-import-export.md` (for load/export-path implications).

## Relevant project rules

`.claude/project/project-rules.md` §7 (SCXML Parsing), §8 (SCXML Serialization), §18 (Backward Compatibility) — read all three in full before starting; they're short and every rule in them is directly load-bearing for this domain.

## Relevant decision records

`.claude/decisions/scxml.md` #1, #7, #8, #9 and `.claude/decisions/backward-compatibility.md` in full.

## Implementation expectations

- `viz:xywh` must be written comma-separated. Do not copy the known-buggy space-separated write path in `scxml-manipulation-utils.ts` — that's a confirmed defect, not a second valid format.
- Any new `viz:` attribute/element must be fully optional — a document must remain valid, meaningful SCXML with it stripped entirely.
- If introducing a new namespace URI or prefix (extremely unlikely to be warranted, but if so), add a migration case to `writeLayoutToSCXML` following the existing two-migration pattern — never require users to manually fix old files.
- If touching the hand-rolled `validateXMLSyntax` checker, preserve its CDATA/comment/processing-instruction-awareness and its mid-typing "don't falsely flag unclosed tag" heuristic — these are deliberate, not incidental complexity.

## Testing expectations

- Add round-trip tests: parse → mutate → serialize → parse again, confirming the data survives. This is the class of bug most likely in this domain (something silently lost or reformatted).
- Test against a **file loaded fresh from disk** (via the real parser), not only against a hand-constructed in-memory object — this is exactly where the `.executable[]` mismatch bug lives undetected.
- Sibling test file, not under `__tests__/`.

## Common mistakes to avoid

- Mixing `DOMParser`/`XMLSerializer` output with `fast-xml-parser`'s `XMLBuilder` output in one code path.
- Writing `viz:xywh` space-separated.
- Forgetting the `__PRESERVE__` boolean-attribute workaround in `VisualMetadataManager` — removing it would let `fast-xml-parser`'s `XMLBuilder` silently mangle `"true"`/`"false"` string attribute values into bare XML booleans.
- Assuming the `.executable[]` shape in `src/types/scxml/index.ts` reflects what the real parser produces — it doesn't, for onentry/onexit executable content specifically.
- Skipping a backward-compatibility path for a schema change, on the assumption "no one has old files" — this app has multiple confirmed instances of exactly that assumption being wrong in the past.
