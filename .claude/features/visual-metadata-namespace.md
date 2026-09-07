# Feature: Visual Metadata (`viz:`) Namespace System

## Purpose

Persist this editor's layout, styling, and connection-routing information *inside* the SCXML file itself, using a custom XML namespace, so a `.scxml` file remains a single portable artifact — no sidecar file to lose track of — while staying fully ignorable/harmless to any real SCXML runtime.

## User behavior

- Reopening a previously-edited file restores exact node positions, sizes, and edge routing — nothing "jumps" back to an auto-layout default.
- Exporting offers a choice: keep this metadata ("Download," for continuing to edit here later) or strip it entirely ("Clean SCXML," for handing the file to something else, e.g. the downstream C# generator or another SCXML tool).

## UI behavior

The "Download" (with-metadata) option is only shown when the current document actually has `viz:` data (`hasVisualMetadata(content)`); a document with none only shows "Clean SCXML"-equivalent behavior via a single button.

## Internal architecture — two separate, only loosely-coordinated read/write layers

1. **Live editing path** (the one used during normal drag/resize/rename/etc.): Commands (`src/lib/commands/*`) read/write `viz:*` attributes directly via `Element.getAttribute`/`setAttribute` (DOM), and the converter's `converter-modules/visual-metadata.ts` / `src/lib/utils/visual-metadata-utils.ts` read/write the same attributes via `fast-xml-parser`'s object tree. Neither of these goes through `VisualMetadataManager`.
2. **`VisualMetadataManager`** (`src/lib/metadata/visual-metadata-manager.ts`, 740 lines) — an **instance-based** (not static — `DEVELOPER_GUIDE.md` is wrong about this) reader/validator/serializer, used mainly at **parse and serialize/clean-export boundaries**: `SCXMLParser` owns one instance; `visual-diagram.tsx` holds a ref to one; `transition-merge-utils.ts` uses one after a load-time merge pass. Its own class doc comment states it is explicitly **read-only for mutation purposes** — "all mutations to visual metadata must be done through SCXML commands," confirming by design that this class is not meant to be the live-editing path.

Because of this split, a new attribute added only to `VisualMetadataManager`'s vocabulary will not automatically be respected by the live editing path, and vice versa — check both if you're adding a new kind of visual metadata.

## Confirmed `viz:` attribute/element vocabulary

See `.claude/project/scxml-rules.md` for the full table. Highlights: `viz:xywh` (comma-separated `x,y,w,h` — a couple of legacy write paths in `scxml-manipulation-utils.ts` write it space-separated instead, a known bug, comma is canonical), `viz:rgb` (fill color hex), `viz:sourceHandle`/`viz:targetHandle` (connection sides — note `DEVELOPER_GUIDE.md`'s claimed single JSON `viz:handles` attribute does **not** exist), `viz:waypoints` (semicolon-separated points), `viz:note` (an element, not an attribute — see `sticky-notes.md`).

`writeLayoutToSCXML` (`converter-modules/visual-metadata.ts`) actively **migrates legacy namespace URIs/prefixes** (`http://scxml-viz.github.io/ns`, `urn:x-thingm:viz`, an `ns1:` prefix) to the canonical `http://visual-scxml-editor/metadata` / `viz:` on every write-back — evidence the scheme changed at least twice historically. If you see one of these old forms while debugging, it's expected on an older file, not corruption.

## Relevant components

None own this directly — every feature that persists layout/style touches it (diagram interaction, transitions, sticky notes).

## Relevant state/store

None — `viz:` data lives only in the SCXML string itself, re-extracted fresh on every parse (no cached/separate store of visual metadata).

## Relevant utilities

`src/lib/metadata/visual-metadata-manager.ts`, `src/lib/converters/converter-modules/visual-metadata.ts`, `src/lib/utils/visual-metadata-utils.ts` (`removeVisualMetadataFromXML` — the regex-based clean-export fallback, and `hasVisualMetadata`), `src/lib/utils/visual-style-utils.ts` (`computeVisualStyles`, `visualStylesToCSS`).

## SCXML behavior

All `viz:*` attributes/elements are fully additive and must never be required for a document to remain valid, runnable SCXML — this is the entire point of the namespace approach (see `.claude/decisions/scxml.md` #1).

## Validation rules

`VisualMetadataManager.validateMetadata`/`validateAllMetadata` do only shallow numeric sanity checks (finite x/y, positive width/height) — no color-format or handle-value validation despite what the type comments might suggest. `SCXMLValidator` (the main validation pipeline) does not validate `viz:` data at all — it's out of scope for SCXML-semantic validation.

## Related features

- `auto-layout-elk.md` — the primary writer of `viz:xywh`/handle attributes.
- `transitions-editing.md` — the primary writer/reader of `viz:waypoints`/`viz:sourceHandle`/`viz:targetHandle` for manual routing.
- `sticky-notes.md` — uses the namespace for a whole element, not just attributes.
- `file-import-export.md` — clean export is entirely about stripping this data.

## Related files

`src/lib/metadata/visual-metadata-manager.ts`, `src/lib/converters/converter-modules/visual-metadata.ts`, `src/lib/utils/visual-metadata-utils.ts`, `src/types/visual-metadata/index.ts` (`VISUAL_METADATA_CONSTANTS`).

## Tests

No dedicated test file for `visual-metadata-manager.ts` was found in this pass. `src/lib/converters/converter-modules/layout-positioning.test.ts` exercises some of the write-back behavior indirectly.

## Known limitations

- Two independent read/write implementations for the same conceptual data (see Internal architecture) is itself a maintenance risk — a bug fix or new attribute added to one may silently not apply to the other.
- **`viz:xywh` separator inconsistency**: some `scxml-manipulation-utils.ts` write paths use spaces, every known reader expects commas — this is a latent parse-failure bug for content produced by those specific call sites, not just a style inconsistency.
- **Likely double-`#` bug**: `visual-style-utils.ts:22` does `'#' + style.fill` when `style.fill` (sourced from `viz:rgb`) may already include its own `#`.
- Clean export's regex fallback strips known patterns textually; a hand-crafted or unusually-formatted `viz:` attribute that doesn't match its regex could survive a "clean" export undetected.

## Important edge cases

- A document with a **legacy namespace URI/prefix** parses fine and gets silently migrated to canonical form the next time layout is written back — but until that next write, `checkForVisualNamespace`-style detection logic keyed on the canonical URI string could miss it. Check `VisualMetadataManager`'s legacy-attribute fallback (`getVisualAttribute`, also checks a `visual:` prefix) if you're debugging a file that seems to have metadata the app isn't picking up.

## Things that must NOT be changed

- Do not make any `viz:*` attribute required for the document to parse or render meaningfully as plain SCXML — the entire design assumes graceful degradation to computed defaults (ELK layout, default colors) when metadata is absent.
- Do not change the canonical namespace URI/prefix again without also adding a migration path in `writeLayoutToSCXML`, matching the precedent of the last two migrations already baked into that function.

## Previous design decisions

See `.claude/decisions/scxml.md` #1. In short: storing layout data as a custom namespace inside the same file (rather than a sidecar `.json`/`.layout` file) was chosen so the SCXML file remains the single source of truth and portable artifact; the two namespace migrations found in `writeLayoutToSCXML` (also recorded in `.claude/decisions/backward-compatibility.md` #1) are direct evidence this approach was iterated on at least twice before settling on `http://visual-scxml-editor/metadata` / `viz:`.
