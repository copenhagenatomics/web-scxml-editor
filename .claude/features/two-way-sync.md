# Feature: Code ↔ Visual Two-Way Synchronization

## Purpose

Let a user edit the same SCXML document either as raw XML (Monaco) or as a visual diagram (ReactFlow), with either view always reflecting the current state of the other, so the user can freely switch tools mid-task.

## User behavior

- Typing in the Code tab updates the Visual tab's diagram automatically after a short delay.
- Dragging/resizing/renaming/editing anything in the Visual tab updates the Code tab's text automatically and immediately (no explicit "apply"/"save" step between the two views — they're always the same underlying document).
- There is no per-view "save" — the single `content` string is the source of truth for both.

## UI behavior

- Only one of the two views is visible at a time (`TwoTabLayout`); switching tabs does not lose in-progress edits in the other.
- No visible "syncing" indicator — the sync is fast enough (debounced 500ms for text, up to 300ms for drag operations) to feel instant in normal use.

## Internal architecture

```
Code editor keystroke
  └─> XMLEditor.onChange (Monaco)
        └─> src/app/page.tsx: handleContentChange(newContent)
              ├─> useEditorStore.setContent(newContent)   [immediate]
              └─> historyManager.trackTextEdit(newContent) [debounced 500ms]

useEditorStore.content changes
  ├─> useContentValidation() re-parses + re-validates (debounced 500ms) -> errors[] in store
  └─> VisualDiagram's useEffect keyed on `scxmlContent` prop
        └─> SCXMLToXStateConverter.convertToReactFlow() -> full re-parse + re-layout of the WHOLE diagram

Diagram edit (drag/resize/rename/etc.)
  └─> a Command.execute(currentContent) -> {content: newContent}
        └─> onSCXMLChange(newContent, changeType)   [changeType: 'position'|'structure'|'property'|'resize']
              └─> src/app/page.tsx: handleSCXMLChangeFromDiagram
                    ├─> useEditorStore.setContent(newContent)
                    └─> historyManager.trackDiagramChange(newContent, undefined, changeType)
```

There is **no diffing** anywhere in this loop — every content change triggers a full re-parse on both the validation side and the diagram side. The diagram does not attempt incremental node/edge updates; `SCXMLToXStateConverter.convertToReactFlow()` rebuilds the entire node/edge list (and reruns ELK layout) every time `scxmlContent` changes, then a local "enhancement pass" in `visual-diagram.tsx` re-applies stored visual metadata over the fresh conversion result.

## Relevant components

- `src/app/page.tsx` — owns `handleContentChange` / `handleSCXMLChangeFromDiagram`, the two entry points into this loop.
- `src/app/_components/code-editor-pane.tsx`, `visual-editor-pane.tsx` — thin wrappers passing these callbacks down.
- `src/components/editor/xml-editor.tsx` — Monaco wrapper; its `onChange` is the code-side trigger.
- `src/components/diagram/visual-diagram.tsx` — its `scxmlContent`-keyed `useEffect` (around line 1888) is the diagram-side trigger.

## Relevant state/store

- `useEditorStore.content` (`stores/editor-store.ts`) — the single shared source of truth.
- `useHistoryStore` via `HistoryManager` — every change (from either direction) is tracked here (see `undo-redo-history.md`).

## Relevant utilities

- `src/lib/parsers/scxml-parser.ts` (`SCXMLParser`) — code-side parse.
- `src/lib/converters/scxml-to-xstate.ts` (`SCXMLToXStateConverter`) — diagram-side parse+layout.
- `src/lib/utils/transition-merge-utils.ts` — runs once at load time (not on every keystroke) to normalize legacy duplicate transitions before either pipeline sees the content.

## SCXML behavior

Both pipelines operate on the exact same XML string; neither one is "authoritative" over the other — whichever side last called `setContent()` wins, and the other side re-derives its view from that new string on its next tick.

## Validation rules

Validation is a **third, fully independent** consumer of `content` (`useContentValidation`) — it does not gate or block the sync loop. A document with active validation errors still syncs normally between Code and Visual.

## Related features

- `undo-redo-history.md` — every change in this loop is also tracked into history, with debouncing rules that differ from this loop's own debouncing.
- `hierarchy-navigation.md` — the diagram re-render this loop triggers is then filtered down to the current hierarchy level.
- `scxml-validation.md` — the independent validation pipeline reacting to the same `content` changes.

## Related files

`src/app/page.tsx`, `src/app/_hooks/use-content-validation.ts`, `src/app/_hooks/use-history-restore.ts`, `src/components/editor/xml-editor.tsx`, `src/components/diagram/visual-diagram.tsx`.

## Tests

No dedicated end-to-end test of the sync loop itself exists (no e2e framework in this repo at all). Correctness is implied by unit tests on each side's pieces (parser tests, converter tests, command tests) rather than tested as an integrated loop.

## Known limitations

- Full re-parse + full re-layout on every keystroke-driven change (after debounce) means large documents could visibly lag; there is no incremental update path.
- Opening a file that lacks prior `viz:` layout metadata triggers the converter to compute and **write back** layout data into the content as part of its very first conversion — meaning the "first sync" after loading a plain/foreign SCXML file can itself count as an edit (marks the document dirty) before the user has touched anything.

## Important edge cases

- **`isUpdatingFromHistory`** (`use-history-restore.ts`) is a 100ms guard flag set during undo/redo playback specifically so that restoring an old snapshot doesn't get re-tracked into history as if it were a brand-new edit. If you add a new mutation entry point, make sure it respects this flag the same way `handleContentChange`/`handleSCXMLChangeFromDiagram` do (`if (!isUpdatingFromHistory) historyManager.track...`).
- Monaco's native undo (Ctrl+Z while the code editor has focus) operates on its own internal buffer *before* `onChange` even fires for each keystroke of a native undo — meaning a Monaco-level undo does not go through this sync loop at all until the resulting text differs; see `undo-redo-history.md`.

## Things that must NOT be changed

- Do not make the visual-diagram's conversion effect conditional/incremental without also auditing every place that currently relies on a full recompute (e.g. handle-assignment traffic scoring in the converter is global across the whole diagram, not per-node).
- Do not remove the `isUpdatingFromHistory` guard or change its 100ms duration without testing rapid undo/redo sequences — removing it will reintroduce an infinite tracking loop.

## Previous design decisions

`DEVELOPER_GUIDE.md`'s "Two-Way Synchronization" section (lines 115-150) describes this loop's *shape* correctly even though its code samples reference a file layout (`page.tsx` owning inline logic) that no longer exists — the logic has since been extracted into `src/app/_hooks/*`. Treat that section as directionally-correct historical intent, not as current code.
