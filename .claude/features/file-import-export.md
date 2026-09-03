# Feature: File Import / Create / Export

## Purpose

Get an SCXML document into the editor (upload, create new, or receive from an embedding host) and get it back out (download, with or without this editor's own visual metadata).

## User behavior

- On first load with no content, the Welcome screen offers "Upload SCXML File" (click or drag-and-drop) or "create a new one" (starts from a minimal template).
- Once a document is loaded, "Load New File" replaces the current document (via the toolbar's "more" menu).
- Export offers two choices: **"Download"** (preserves this editor's `viz:` layout/style metadata, round-trips cleanly if reopened here) and **"Clean SCXML"** (strips all `viz:` data, produces plain W3C-compliant SCXML for use outside this editor — filename gets a `-clean` suffix).

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

No dedicated test file for `use-file-operations.ts`/`use-download.ts` was found. `file-utils.ts`'s validation logic is not independently unit-tested in this pass either — a gap worth closing given it's a user-facing rejection path (size/extension/encoding errors).

## Known limitations

- **Silent worst-case fallback in clean export**: if both the structural and regex-based stripping paths throw, "Clean SCXML" downloads the original content completely unmodified while still presenting the action as having produced a clean file and using the `-clean` filename suffix — this could leak visual metadata into what's presented as a production-ready export, with no error shown to the user.
- `visual-metadata-export.tsx` is dead code duplicating `use-download.ts`'s logic — a future refactor should either delete it or make it the single source of truth, not leave both live.
- 10MB upload limit is not configurable per deployment; `AppConfig.maxFileSize` exists as a type (`src/types/common/index.ts`) but nothing in the codebase actually reads a configurable value from it — the 10MB figure is hardcoded separately in the upload handler.

## Important edge cases

- Uploading while a document is already open (`handleNewFileUpload`) fully replaces the current document and resets history — there is no "are you sure, you have unsaved changes" prompt for a bare upload (contrast with GitHub pull, which does have an explicit discard-confirmation step — see `github-integration.md`).
- A file that parses successfully but has validation errors still loads normally — validation errors surface afterward through the normal validation pipeline, they don't block the load.

## Things that must NOT be changed

- Do not change the order of the two transition-merge calls in the load pipeline (`mergeDuplicateTransitionsByEventInDocument` then `mergeDuplicateTransitionsInDocument`) — the modules' own comments document that reversing this order silently drops merged event names.
- Do not wire `visual-metadata-export.tsx` back in without first deciding whether `use-download.ts`'s fallback chain is the one you want (they've likely drifted slightly since being duplicated).

## Previous design decisions

The existence of two independent, near-identical "clean export" implementations, one live and one orphaned, suggests a refactor happened (extracting logic into `use-download.ts` as a hook, matching this repo's later `_hooks/`-based architecture — see `.claude/project/architecture.md`) that didn't clean up the original component afterward. No explicit doc/commit message confirms this, but the code shape (identical fallback chain, identical comments about "regex-based fallback") makes it very likely.
