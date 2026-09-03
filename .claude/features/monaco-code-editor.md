# Feature: Monaco Code Editor Integration

## Purpose

Provide a full-featured raw-XML editing experience (syntax highlighting, hover docs, context-aware autocomplete, inline error markers) for users who prefer or need to hand-edit SCXML directly, kept in sync with the visual diagram (see `two-way-sync.md`).

## User behavior

- Standard XML syntax highlighting, bracket matching, auto-closing of `<>`/`""`/`''`, indentation-based code folding.
- Hovering a recognized SCXML element (`scxml`, `state`, `transition`, `parallel`, `final`, `onentry`, `onexit`, `datamodel`, `assign`, `send`, `raise`) shows a description + syntax + example.
- Typing `<` or pressing Ctrl+Space shows element/attribute/value suggestions, context-aware: element suggestions when starting a tag, attribute suggestions (excluding ones already present) when inside a tag, value suggestions when inside an attribute's quotes.
- Typing `target="` inside a `<transition>` suggests only **sibling** state ids at the same nesting level as the enclosing state — not every id in the document.
- Typing inside `cond`/`event`/`expr`/`location`/etc. suggests datamodel variables, and (for `assign/location` and `transition/cond|event` specifically) host-provided channels/events.
- Typing a `this_`-prefixed identifier with no other match offers a "(new channel)" suggestion.
- Pasting a whole replacement document (e.g. from another SCXML file) is automatically run through the same duplicate-transition normalization as file upload, and — importantly — undoes as a **single** Ctrl+Z step, not one step per pasted character/line.
- Validation errors/warnings appear as red/yellow squiggly underlines; clicking one (via the Validation Panel, not directly in-editor) navigates to that line.

## UI behavior

Editor options are tuned deliberately: word wrap on, format-on-paste/format-on-type on, **`quickSuggestions: false`** but **`suggestOnTriggerCharacters: true`** — i.e. suggestions are trigger-character/manual-invoke-driven, not "as you type anywhere"; `wordBasedSuggestions: 'off'` (relies solely on the custom provider, not Monaco's generic word-guessing); `autoClosingBrackets: 'never'`/`autoSurround: 'never'` since the element snippets manage their own closing tags.

## Internal architecture

- **There is no custom "scxml" Monaco language id** — the editor model is always set to the stock `xml` language; SCXML-specific behavior is layered on top via providers.
- `src/lib/monaco/monaco-setup.ts` — `ensureMonacoConfigured()`, a memoized async singleton, points `window.MonacoEnvironment.getWorker` at the **generic XML/basic editor worker** bundled locally (no dedicated XML language-service worker, no CDN dependency — deliberately offline-friendly for an embedded/industrial deployment).
- `src/lib/monaco/scxml-language.ts` — registers the **hover provider** and customizes bracket/fold config on the `xml` language. Its own completion-provider registration is **disabled** (commented out, "superseded by enhanced-scxml-completion.ts") — don't re-enable it; it would produce duplicate suggestions.
- `src/lib/monaco/enhanced-scxml-completion.ts` — the **one real completion provider**, registered exactly once globally via a module-level guard (`scxmlCompletionRegistered` in `xml-editor.tsx`) since Monaco's language registry is page-level and duplicate registration doubles every suggestion. Does its own **manual, text-based context detection** (not an AST) — tag-stack walking to find the enclosing parent element, regex-based existing-attribute extraction, incomplete-quote detection.
- `src/components/editor/xml-editor.tsx` — the wrapper component. Notable specifics:
  - `errors` prop → Monaco markers under owner id `'scxml-parser'`; the actual SCXML validation logic lives entirely **outside** this component (see `scxml-validation.md`) — this component is purely a marker-rendering sink.
  - **Paste normalization**: a native DOM `'paste'` listener on the **wrapper `<div>`**, in the **capture phase**, deliberately placed there (not on Monaco's own container) so it fires before Monaco's own paste handling, since capture-phase listeners fire ancestor-before-descendant. Detects a whole-document-replacement paste (`isWholeDocumentPasteRange`) and, if so, applies the merge-normalized text as one `editor.executeEdits` + `pushUndoStop()` call.
  - `theme` prop currently has a **dead branch** — both the `'dark'` and non-`'dark'` cases resolve to `'vs-dark'` (`theme === 'dark' ? 'vs-dark' : 'vs-dark'`); light theme is not actually wired up in the editor despite the app having a light/dark toggle elsewhere.
  - `onNavigateToLine` prop is declared in the interface but not wired to anything inside the component body — a dead prop; the actual navigation uses the imperative `ref.navigateToLine()` method instead.

## Relevant components

`src/components/editor/xml-editor.tsx`.

## Relevant state/store

None directly inside Monaco integration — reads `useHostAPIStore.getState()` **imperatively** (not via a hook, since the completion provider isn't a React component) for channels/events used in expression-attribute suggestions.

## Relevant utilities

`src/lib/monaco/monaco-setup.ts`, `scxml-language.ts`, `enhanced-scxml-completion.ts`, `src/lib/utils/state-id-extractor.ts` (`extractStateIdsFromXML`, used for sibling-scoped `target` suggestions), `src/lib/utils/datamodel-extractor.ts` (`extractDatamodelVariables`), `src/lib/utils/paste-detection.ts` (`isWholeDocumentPasteRange`), `src/lib/utils/transition-merge-utils.ts` (paste normalization).

## SCXML behavior

Purely an authoring aid — Monaco never validates or transforms SCXML semantics itself beyond the paste-normalization pass (which is the same normalization applied on file load, see `file-import-export.md`).

## Validation rules

None owned here — see `scxml-validation.md` for the actual rule engine; this component only *displays* its output as markers.

## Related features

- `scxml-validation.md` — the source of the `errors` prop.
- `two-way-sync.md` — this editor's `onChange` is one of the two entry points into the sync loop.
- `undo-redo-history.md` — the paste-normalization behavior exists specifically to keep Monaco's native undo (which takes priority while this editor has focus) sane after a full-document paste.
- `channel-mapping-panel.md`, `config-panel.md` — the same `this_`/channel/datamodel-variable vocabulary surfaces in both this editor's autocomplete and those panels' own autocomplete.

## Related files

`src/components/editor/xml-editor.tsx`, `src/lib/monaco/*`.

## Tests

No dedicated test file for `xml-editor.tsx`, `enhanced-scxml-completion.ts`, or `scxml-language.ts` was found in this pass — Monaco's own APIs are difficult to unit test in jsdom, which may explain the gap; verification of autocomplete/hover behavior currently requires manual testing in a real browser.

## Known limitations

- No custom "scxml" language mode — SCXML-specific tokenization/coloring rides entirely on the generic `xml` grammar; there's no way to give SCXML-specific tokens (e.g. `cond`/`event` attribute values) distinct syntax coloring beyond what generic XML attribute-value coloring provides.
- `theme` prop's light-mode branch is dead code — the code editor always renders in dark theme (`vs-dark`) regardless of the app's overall light/dark toggle state.
- `onNavigateToLine` prop is unused/dead.
- Context detection in the completion provider is manual text-scanning, not a real parser — deeply nested or unusually formatted XML could confuse the enclosing-parent-element detection.

## Important edge cases

- The paste-normalization listener is deliberately attached to the **wrapper div in the capture phase**, not Monaco's container — moving it to Monaco's own container or to the bubble phase would very likely break the "runs before Monaco's own paste handling" guarantee this feature depends on, since same-node listener ordering and Monaco's own internal registration timing are both load-bearing here.
- Sibling-scoped `target=` suggestions rely on a **manual, line-based** open/close-tag scan (`findParentStateAtPosition`) to determine which state a `<transition>` is nested in — this can misidentify the enclosing state for unusually formatted or minified XML.

## Things that must NOT be changed

- Do not re-enable the completion provider in `scxml-language.ts` — it is explicitly disabled to prevent duplicate suggestions from `enhanced-scxml-completion.ts`.
- Do not move or change the phase of the paste-normalization event listener without re-verifying (in a real browser) that it still fires before Monaco's own paste handling — this ordering is the entire mechanism the feature relies on and is easy to silently break.
- Do not register `enhanced-scxml-completion.ts`'s provider more than once per page load — the module-level `scxmlCompletionRegistered` guard in `xml-editor.tsx` exists specifically to prevent duplicate suggestion entries; if you refactor the mount lifecycle, preserve this guard.

## Previous design decisions

The choice to build a manual, text-scanning completion provider rather than parsing the document into a real XML tree for context detection appears to be a pragmatic tradeoff (matching Monaco's own typical extension style for lightweight language support) rather than an explicitly documented decision — no plan/spec doc addresses Monaco architecture directly. `docs/superpowers/plans/2026-08-25-expression-field-autocomplete.md` documents the *separate, non-Monaco* expression-autocomplete engine (`expression-autocomplete.ts`, used by side panels, not this editor) as a later, distinct addition — don't confuse the two autocomplete systems.
