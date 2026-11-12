# Feature: Draft Autosave & Restore

## Purpose

Keep unsaved/unapplied edits from being lost when the editor is closed or navigated away from (issue #80). Most importantly when embedded in LoopControl, where the host can remove the editor's iframe on in-app navigation and nothing else holds the edits.

## User behavior

- Edits are saved automatically to a browser-local draft (localStorage, this browser only).
- On the next load, a draft holding changes not in the loaded document is handled in one of two ways:
  - **Draft made on exactly the version now loaded → restored automatically.** A notice says "Restored your unsaved changes from <time>", with **Discard** (back to the loaded version, also undoable) and a dismiss ✕. The notice stays until one of those is clicked or another document loads.
  - **Draft made on a different version (applied/changed since), or nothing loaded yet (standalone Welcome screen) → ask first.** "You have unsaved changes from <time>. Restore / Discard". In the different-version case the banner says restoring replaces what's open. Auto-restoring here could put stale edits over a newer version that then gets applied.
- Either way the restore is an undoable step: Undo returns to the loaded version, and the content still counts as unsaved.
- Discard (on the ask banner) deletes the draft.
- Closing/reloading the tab with unsaved edits shows the browser's "Leave page?" prompt.
- Standalone Welcome-screen Restore loads the draft's own baseline first, then the draft.

## Internal architecture

- **"Unsaved" = `useEditorStore.isDirty`**, i.e. content differs from the baseline `fileInfo.content`. Every load path sets the baseline through `setFileInfo` (upload, create-new, GitHub pull, and host `loadScxml`, which used to call `setContent` and left the baseline empty). `markSaved()` moves the baseline to the current content (after a GitHub push, and for the diagram's automatic first layout).
- **`loadGeneration`** (editor store) increases on `setFileInfo` only, never on `markSaved`. The autosave re-checks the stored draft when it changes. Without it, moving the baseline would re-check the draft against the moved baseline and wrongly report "different version".
- **`'layout-init'` change type**: `VisualDiagram` reports the automatic first-layout write-back (adding `viz:xywh` to a document that had none) as `onSCXMLChange(content, 'layout-init')`. `page.tsx` calls `markSaved()` when nothing was edited yet, so opening the Visual tab on a layout-less document isn't an unsaved change. History still records it as `'position'`.
- **`useDraftAutosave`** (`src/app/_hooks/use-draft-autosave.ts`) subscribes to the editor store. It debounces saves (500 ms) and flushes on `pagehide`, `visibilitychange → hidden` and `beforeunload`. When dirty it writes `{content, baseContent, fileName, savedAt}`; when clean it deletes the draft. It must be called **before** `useHostAPIBridge` in `page.tsx`, because the host may call `loadScxml` synchronously during the bridge's mount effect.
- **Pure logic** in `src/lib/draft/draft-storage.ts`: one slot per mode (`scxml-editor:draft:embedded` / `:standalone`), shape-validated reads, and `evaluateDraft(draft, baseline)` → `none` | `stale` (delete) | `offer {baseChanged}`. All storage access swallows errors (private mode, blocked storage, quota).
- **Automatic restore is deferred to a microtask.** Load paths call `historyManager.initialize()` right *after* `setFileInfo()`, and the re-check runs synchronously inside `setFileInfo`. Restoring synchronously would let that `initialize()` wipe the restore's history entry, and Undo could no longer reach the loaded version. The microtask also skips the restore if another load happened in between (`loadGeneration` changed). That load re-checks on its own.
- **Banner**: `src/app/_components/draft-restore-banner.tsx` renders the hook's `draftBanner` (`{kind:'offer', draft, baseChanged}` | `{kind:'restored', savedAt}`), via `page.tsx`, above the Welcome screen or `TwoTabLayout`.

## Important edge cases

- While an ask-first offer is pending the stored draft is never overwritten or deleted. Only Restore, Discard, or a later load that already contains it (stale) touches it. Edits made while ignoring that banner are therefore **not** autosaved until the user picks one. Only the leave-page prompt protects them. This only happens in the different-version and Welcome-screen cases; the common same-version case restores automatically and keeps autosaving.
- A draft whose content equals the newly loaded document is deleted silently. This is how "applied, then reopened" clears itself, because the host pushes back the applied content.
- The GitHub push only calls `markSaved()` if the content didn't change while the push was in flight.

## Known limitations

- The editor can't tell when a host "Apply" command succeeded. After Apply, the session still counts as unsaved until the host pushes the applied content via `loadScxml` again, so the leave-page prompt can appear after a successful Apply. The draft then clears itself on the next load. A host that re-calls `loadScxml` after Apply avoids this.
- The draft is per browser and per editor origin, not per system. If one editor origin serves several LoopControl systems, a draft from one can be offered on another, flagged as "different version".
- The `beforeunload` prompt only fires for tab close, reload and full-page navigation. In-app host navigation that just removes the iframe gets no prompt; the draft (flushed on `pagehide`) covers that case.

## Related files

`src/app/_hooks/use-draft-autosave.ts`, `src/lib/draft/draft-storage.ts`, `src/app/_components/draft-restore-banner.tsx`, `src/stores/editor-store.ts` (`markSaved`, `loadGeneration`), `src/app/_hooks/use-host-api-bridge.ts` (`loadScxml` → `setFileInfo`), `src/components/diagram/visual-diagram.tsx` (`'layout-init'`), `src/app/page.tsx`.

## Tests

`src/app/_hooks/use-draft-autosave.test.ts`, `src/lib/draft/draft-storage.test.ts`, `src/stores/editor-store.test.ts` (baseline section), `src/app/_hooks/use-host-api-bridge.test.ts` (`loadScxml` baseline). Not automated: the banner's rendering and the real iframe-removal / browser prompt behaviour.

## Related features

- `host-api-embedding.md`: `loadScxml` now sets the baseline via `setFileInfo`.
- `file-import-export.md`: all load paths feed the same baseline.
- `undo-redo-history.md`: Restore is pushed as a `bulk-change` history entry on top of the loaded version.
