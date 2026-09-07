# State Management Decisions

---

## 1. Seven independent Zustand stores instead of one root store

### Context
The app has several genuinely separate concerns needing reactive state: editor content, undo history, host-bridge data, active side panel, GitHub auth, and two clipboards.

### Decision
State is split across 7 independent Zustand stores (`useEditorStore`, `useHistoryStore`, `useHostAPIStore`, `usePanelStore`, `useGithubStore`, `useStateClipboardStore`, `useActionClipboardStore`), each with its own file, rather than one combined store with slices.

### Reason
Not documented explicitly, but each store maps cleanly to one bounded concern with independent lifecycle (e.g. `useGithubStore` persists to `localStorage` and is unrelated to document content; clipboards are transient and unrelated to history). This separation avoids one store's update triggering re-renders in components that only care about an unrelated slice.

### Constraints
- Components should select individual fields (`useXStore(s => s.field)`), not destructure whole stores, to preserve the re-render-isolation benefit this split is meant to provide.
- Cross-store coordination (e.g. `use-host-api-bridge.ts` reading from `useEditorStore`, `useHostAPIStore`, and `usePanelStore` together) must be done explicitly in hooks/components — there's no automatic store composition.

### Alternatives
None found evidenced — no comment discusses a single combined store being tried or considered.

### Evidence
`src/stores/*.ts` (7 files), `.claude/project/coding-rules.md` §5 (documents the selector convention as an established rule).

### Status
Accepted.

---

## 2. Linear full-document-snapshot history instead of a command stack or diffs

### Context
Undo/redo needs to work uniformly across both mutation strategies (Commands and direct object-tree edits — see `architecture.md` #2), which don't share a common diff/patch representation.

### Decision
`useHistoryStore` holds one flat `entries: HistoryEntry[]` array plus a `currentIndex` cursor. Every entry stores the **entire SCXML content string** at that point. Undo/redo simply moves the cursor and restores whichever string it now points at — there is no diffing, patching, or storage of the Command objects that produced each change.

### Reason
Not documented in a dedicated note, but this is the only design that works uniformly regardless of which mutation strategy produced a given change, since it only depends on the resulting string. It sidesteps needing every mutation path to produce a consistent diff format.

### Constraints
- History size scales with document size × entry count (capped at 50 entries via `maxSize`) — acceptable for this app's expected document sizes.
- Any new mutation entry point automatically participates in undo/redo as long as it calls `setContent()` and one of `historyManager.track*()` — no per-mutation-type integration is needed.
- `isUpdatingFromHistory` must be checked by any new content-change entry point to prevent an undo/redo restoration from being re-tracked as a new entry.

### Alternatives
`DEVELOPER_GUIDE.md` (stale) describes a different, apparently-never-implemented design: separate `undoStack`/`redoStack` arrays with `shift()`-based trimming and a `HistoryManager` API surface (`getUndoStack()`/`getRedoStack()`) that doesn't exist in the real code. There is no evidence this two-stack design was ever actually built and later replaced — it more likely reflects an early design note that was superseded before or during implementation without the doc being updated.

### Evidence
`src/stores/history-store.ts`, `src/lib/history/history-manager.ts`, `src/types/history/index.ts`, `DEVELOPER_GUIDE.md` §"History & Undo/Redo System" (the unmatched description).

### Status
Accepted (current implementation); the two-stack design in `DEVELOPER_GUIDE.md` is Superseded/never-realized.

---

## 3. Debounced history tracking, differentiated by change type

### Context
Continuous interactions (typing, dragging) would otherwise create one history entry per keystroke/pixel, making undo useless (one Ctrl+Z per character).

### Decision
`HistoryManager` debounces text edits at 500ms and node position/resize changes at 300ms (independent timers per category), while structural changes (delete, rename, add, edge edits) are tracked immediately with no debounce.

### Reason
Matches the product's own documented intent — `README.md`: "Text changes are grouped together (if you type quickly)... Visual changes (moving, deleting) create individual undo points." The differentiated durations and immediate-vs-debounced split by change type is a direct implementation of that stated UX goal.

### Constraints
The specific durations (500ms/300ms) are tuned to feel like "one gesture = one undo step" — changing them affects perceived undo granularity and should be re-validated against real interaction if changed.

### Alternatives
None found evidenced beyond the two debounce categories implemented.

### Evidence
`src/lib/history/history-manager.ts` (`trackTextEdit`, `trackNodeMove`, `trackNodeResize` — distinct timers), `README.md` §"Using Undo/Redo".

### Status
Accepted.

---

## 4. Panel visibility updates deferred via `queueMicrotask`

### Context
Toggling the active side panel from certain call sites (e.g. inside another component's own state-update logic) triggered a React warning: "Cannot update a component while rendering a different component."

### Decision
`usePanelStore.setActivePanel`/`togglePanel` wrap their `set()` calls in `queueMicrotask(...)`, deferring the state update out of the synchronous call stack that triggered it.

### Reason
Explicitly documented in the store's own code comment: this fixes the warning "no matter which call site triggers it," and was chosen over auditing/fixing every individual caller, since a single fix at the store level covers all current and future callers at once.

### Constraints
Any new panel-toggle call site does not need its own fix — the deferral is centralized. Do not "simplify" this back to a synchronous `set()` without re-testing whichever call site originally triggered the warning.

### Alternatives
The comment explicitly frames the alternative considered and rejected: auditing every call site individually, rather than fixing it once in the store.

### Evidence
`src/stores/panel-store.ts` (inline comment), commit `f8594e2 fix(panel-store): defer panel state updates to a microtask`.

### Status
Accepted.

---

## 5. GitHub store: persist auth and link, but never transient sync state

### Context
`useGithubStore` uses Zustand's `persist` middleware (localStorage) so a user doesn't have to reconnect GitHub on every page load.

### Decision
Only `accessToken`, `user`, and `linkedRepo` are persisted (via `partialize`). `isConnecting`, `isSyncing`, `error`, and `deviceCode` are explicitly excluded and always reset to their defaults on load.

### Reason
Explicitly reasoned in code: a stale `isSyncing: true` surviving a page reload would be a real bug (the UI would appear permanently stuck mid-sync with no way to recover except clearing storage).

### Constraints
Any new field added to this store must be deliberately categorized as "persist" (durable identity/link data) or "session-only" (transient operation state) — defaulting to persisting everything would reintroduce the stale-state risk this decision avoids.

### Alternatives
None found evidenced — the transient-vs-persisted split appears to have been designed correctly from the start for this store (no commit shows a fix for a stale-sync-state bug, suggesting it was anticipated rather than discovered).

### Evidence
`src/stores/github-store.ts` (`partialize`, comment on excluded fields).

### Status
Accepted.
