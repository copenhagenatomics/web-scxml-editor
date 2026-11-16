# Feature: File Import / Create / Export

## Purpose

Get an SCXML document into the editor (upload, create new, or receive from an embedding host) and get it back out (download, with or without this editor's own visual metadata).

## User behavior

- On first load with no content, the Welcome screen offers "Upload SCXML File" (click or drag-and-drop) or "create a new one" (starts from a minimal template).
- Once a document is loaded, "Load New File" replaces the current document (via the toolbar's "more" menu).
- Export offers two choices: **"Download"** (preserves this editor's `viz:` layout/style metadata, round-trips cleanly if reopened here) and **"Clean SCXML"** (strips all `viz:` data, produces plain W3C-compliant SCXML for use outside this editor — filename gets a `-clean` suffix).
- **"Export PDF"** exports the **visual diagram only** (no SCXML text — explicit product requirement) as `<name>.pdf`, covering **every hierarchy level**: the top level first, then each state with children, depth-first. **Exactly one A4 page per level — a level is never split** (explicit product requirement): the whole level is scaled to fit, centered, on whichever orientation (portrait/landscape, chosen per page) lets it be drawn largest; small levels are enlarged up to 1.5×. Each page header shows only the level path (`Top level`, `A / A1`) — no file name, by user request; footer is `Page X of N`. Pages follow the **current theme** (dark mode → dark pages — explicit user choice). Works from either tab: from the Code tab it briefly switches to Visual, steps through every level on the canvas, then restores the tab and the level the user was on. A full-screen "Exporting PDF — level i of n" overlay covers the app meanwhile; if a level doesn't finish rendering within 4s it's still exported, and a warning toast names it afterwards.

## UI behavior

- Upload accepts only `.scxml`/`.xml`, max **10MB** — both checks happen client-side before the file is read; violations show as validation-panel errors, not a toast.
- The "Download" (with-metadata) button is only shown in the "more" menu if `hasVisualMetadata(content)` is true — i.e. it's hidden entirely for a document that has no `viz:` data to preserve, since it would be identical to "Clean SCXML" in that case.

## Internal architecture

Three independent load paths converge on the same normalization + store update:

```
Upload (file-utils.ts validate + read)  ─┐
Create new (DEFAULT_SCXML_TEMPLATE)      ├─> annotateLegacyConfTypes()
GitHub pull (see github-integration.md)  │      -> mergeDuplicateTransitionsByEventInDocument()
                                          │           -> mergeDuplicateTransitionsInDocument()
                                          └─> setFileInfo() / setContent() + historyManager.initialize(...)
```

Export has **two independent implementations** of "clean" stripping that do the same thing but live in different places:
1. `src/app/_hooks/use-download.ts` (`handleDownloadClean`) — the one actually wired to the toolbar's "more" menu. Tries `SCXMLParser.parse()` → `parser.serialize(data, false)` (structural strip via `VisualMetadataManager.serializeCleanSCXML`); falls back to `removeVisualMetadataFromXML` (regex-based) if parsing fails; falls back to the **original unmodified content** if even that throws (a silent worst case — see Known limitations).
2. `src/components/file-operations/visual-metadata-export.tsx` (`VisualMetadataExport` component) — implements the identical two-tier fallback logic as a **standalone, currently-unused component**. Confirmed via repo-wide search: nothing imports this component outside its own file. Do not assume it's part of the live export flow; if you need to change export behavior, change `use-download.ts`.

PDF export (diagram):
- `visual-diagram.tsx` registers a `DiagramExportSource` (readiness, viewport element, all-level nodes, edge count, live parallel divider xs, theme, clear-selection) in `src/stores/diagram-export-store.ts` while mounted — needed because the toolbar lives outside the `ReactFlowProvider` and the canvas only exists on the Visual tab. The same store holds the export `progress` that drives `src/app/_components/pdf-export-overlay.tsx`.
- `isReady()` matters: a freshly mounted diagram (export started from the Code tab) has **no nodes until its first async parse/ELK layout commits**. Without waiting for it, the export captured an empty top level and found no sub-levels (a real bug, caught in browser testing).
- `handleDownloadPdf(activeTab, setActiveTab)` in `use-download.ts` switches to Visual if needed, waits for the source, and drives level changes by writing `useEditorStore.hierarchyState` directly (navigation is pure filtering — it never writes SCXML or history). It restores the saved `hierarchyState`, tab and overlay in `finally`.
- `src/lib/utils/diagram-pdf.ts` (`buildDiagramPdf`) waits per level until exactly that level's nodes and all edges are in the DOM, measures node/edge rects (flow coords), captures the level **once** with `html-to-image`'s `toCanvas` on `.react-flow__viewport` (overriding the clone's transform, so the live fitView animation doesn't matter) and places it as a PNG with `jspdf`. Both are lazy-imported. `html-to-image` is **pinned to 1.11.11** — the version ReactFlow's own export example pins.
- **Capture performance — `suppressEditorCssVariables`**: html-to-image copies each element's full computed `cssText`, which in current Chrome includes every inherited custom property. Monaco's codicon CSS defines ~1,250 `--vscode-icon-*` variables on `:root`, so every captured element carried ~70 KB of them (a 64-state level → 221 MB SVG, >60s). During capture a temporary `<style>` resets every `--vscode-*` variable to `initial` on `.react-flow__viewport` (drops them from computed style; the diagram never uses them) — 3–5× faster. Upgrading html-to-image does **not** fix this: 1.11.13's `includeStyleProperties` is bypassed whenever computed `cssText` is non-empty, which it is in Chrome.
- Parallel-region dividers are drawn by `ParallelRegionDividerOverlay` *outside* the viewport, so they're not in the capture — they're redrawn as vector dashed lines in the PDF instead.
- `src/lib/utils/diagram-pdf-layout.ts` holds the pure math: `planLevelPage` (orientation with the larger fit — accounts for header/footer, unlike a raw aspect-ratio check — scale capped at `MAX_SCALE` 1.5, centered) and `capturePixelRatio` (≥ 300 dpi on paper and ≥ 2 image px per canvas px so zooming in the PDF stays sharp, capped at 16384 px/side and 32 MP).

## Relevant components

- `src/app/_components/welcome-screen.tsx` — first-load UI.
- `src/components/file-operations/file-upload.tsx` — drag-and-drop/click upload widget (used by the Welcome screen).
- `src/components/file-operations/visual-metadata-export.tsx` — **dead/orphaned**, not rendered anywhere.

## Relevant state/store

`useEditorStore.fileInfo`/`content`/`isDirty` (`stores/editor-store.ts`) — `setFileInfo()` resets `isDirty` to false and clears `errors`.

## Relevant utilities

- `src/lib/utils/file-utils.ts` — `validateFile`/`validateFileContent` (size/extension/encoding checks), `readFileAsText`, `downloadFile`, `detectFileEncoding`, `sanitizeFileName`.
- `src/lib/utils/datamodel-extractor.ts` (`annotateLegacyConfTypes`) — backfills `@_confType` on older `conf_` fields that predate that attribute.
- `src/lib/utils/transition-merge-utils.ts` — collapses semantically-duplicate transitions from older/hand-edited files; **must run in this exact order** (`mergeDuplicateTransitionsByEventInDocument` before `mergeDuplicateTransitionsInDocument`) or event names can be silently dropped, per that module's own comments.
- `src/lib/consts/default_scxml_template.ts` — the "create new" starting document.
- `src/lib/utils/visual-metadata-utils.ts` (`removeVisualMetadataFromXML`) — the regex-based clean-export fallback.

## SCXML behavior

Load-time normalization (`annotateLegacyConfTypes` + the two transition-merge passes) is applied to **every** load path (upload, create-new — trivially a no-op on the fresh template, GitHub pull) so that the rest of the app (in particular `transition-slot-validator.ts`) can assume duplicate/legacy patterns have already been cleaned up.

## Validation rules

File-level validation (size/extension) happens before content ever reaches the SCXML parser/validator; a rejected file never becomes `content` at all. Once loaded, normal SCXML validation applies like any other content (see `scxml-validation.md`).

## Related features

- `visual-metadata-namespace.md` — what "clean" strips.
- `github-integration.md` — pull applies the exact same normalization sequence as upload.
- `undo-redo-history.md` — every load path calls `historyManager.initialize(content, description)`, resetting history rather than pushing an entry onto existing history.

## Related files

`src/app/_hooks/use-file-operations.ts`, `src/app/_hooks/use-download.ts`, `src/app/_components/welcome-screen.tsx`, `src/components/file-operations/*`, `src/lib/utils/file-utils.ts`.

## Tests

`src/lib/utils/diagram-pdf-layout.test.ts` covers the PDF page planning (orientation choice, fit-inside-page for huge levels, centering, small-level enlargement cap, capture-resolution limits) and hierarchy-level enumeration. The DOM capture in `diagram-pdf.ts` has no automated test (jsdom can't render/measure). It was verified once in real Chrome (driving the dev server via playwright-core, inspecting the PDFs with pdf-lib/pdf.js) on the traffic-light example, `xml/test-state-machine.scxml` (4 levels) and a synthetic 4-level file with a 64-state level: one page per level, mixed orientations, every image inside its page — re-verify manually after changes there. No dedicated test file for `use-file-operations.ts`/`use-download.ts` was found. `file-utils.ts`'s validation logic is not independently unit-tested in this pass either — a gap worth closing given it's a user-facing rejection path (size/extension/encoding errors).

## Known limitations

- **Silent worst-case fallback in clean export**: if both the structural and regex-based stripping paths throw, "Clean SCXML" downloads the original content completely unmodified while still presenting the action as having produced a clean file and using the `-clean` filename suffix — this could leak visual metadata into what's presented as a production-ready export, with no error shown to the user.
- `visual-metadata-export.tsx` is dead code duplicating `use-download.ts`'s logic — a future refactor should either delete it or make it the single source of truth, not leave both live.
- 10MB upload limit is not configurable per deployment; `AppConfig.maxFileSize` exists as a type (`src/types/common/index.ts`) but nothing in the codebase actually reads a configurable value from it — the 10MB figure is hardcoded separately in the upload handler.

- PDF diagram is a raster image (PNG), not vector: text in it isn't selectable/searchable. html-to-image serializes DOM into an SVG `foreignObject`, which jsPDF/svg2pdf can't embed as vectors. Readability on big levels comes from capture resolution (zooming the PDF), since one-page-per-level shrinks them on paper.
- Export time scales with DOM size per level: measured in headless Chrome ~4s for 3 states, ~20s for a 31-state/4-level machine, ~40s for a file whose largest level has 64 states. Remaining cost is html-to-image copying the (non-variable) computed styles of every element; JPEG would save ~10–15% but makes files ~4× larger, so PNG is kept.
- Selection is cleared as part of PDF export. Very large levels (beyond ~16k canvas px or 32 MP at 1×) are captured at below 1 image px per canvas px.
- PDF header text uses jsPDF's built-in Helvetica (WinAnsi only): state ids with characters outside Latin-1 render incorrectly in the header (the diagram image itself is unaffected).

## Important edge cases

- Uploading while a document is already open (`handleNewFileUpload`) fully replaces the current document and resets history — there is no "are you sure, you have unsaved changes" prompt for a bare upload (contrast with GitHub pull, which does have an explicit discard-confirmation step — see `github-integration.md`).
- A file that parses successfully but has validation errors still loads normally — validation errors surface afterward through the normal validation pipeline, they don't block the load.

## Things that must NOT be changed

- Do not upgrade `html-to-image` past 1.11.11 without re-checking the diagram PDF manually (see Internal architecture).
- Do not remove `suppressEditorCssVariables` — without it, capture is 3–5× slower and SVGs reach hundreds of MB (see Internal architecture).
- Never split a level across pages — one level = exactly one page is an explicit product requirement (a tiling implementation existed briefly and was removed for this reason).
- PDF export must restore `hierarchyState` and the active tab in a `finally` — a failed export must not leave the user stranded on a different level/tab.

- Do not change the order of the two transition-merge calls in the load pipeline (`mergeDuplicateTransitionsByEventInDocument` then `mergeDuplicateTransitionsInDocument`) — the modules' own comments document that reversing this order silently drops merged event names.
- Do not wire `visual-metadata-export.tsx` back in without first deciding whether `use-download.ts`'s fallback chain is the one you want (they've likely drifted slightly since being duplicated).

## Previous design decisions

The existence of two independent, near-identical "clean export" implementations, one live and one orphaned, suggests a refactor happened (extracting logic into `use-download.ts` as a hook, matching this repo's later `_hooks/`-based architecture — see `.claude/project/architecture.md`) that didn't clean up the original component afterward. No explicit doc/commit message confirms this, but the code shape (identical fallback chain, identical comments about "regex-based fallback") makes it very likely.
