# Coding Rules — how this codebase actually works, not generic best practice

These are patterns *specific to this repository*, confirmed from source. Follow them when adding or modifying code so new work stays consistent with what's already here.

## 1. Choosing a mutation strategy

There are exactly two ways SCXML content gets mutated. Pick based on precedent, not preference:

- **Write a `Command`** (`src/lib/commands/`, extend `BaseCommand`) for anything with an undo/redo expectation: editing an existing element's attributes/children, renaming, deleting, resizing, repositioning, toggling a flag. This is the default — nearly everything in the app uses this path.
- **Use `scxml-manipulation-utils.ts` object-tree helpers directly** only for the small set of precedented exceptions: creating a brand-new connection (`onConnect`), adding a root state, copy/paste of subtrees, drag-to-reparent. These use `fast-xml-parser`'s object representation, not the DOM.
- **Never mix the two libraries within one mutation.** Commands use `DOMParser`/`XMLSerializer`; the manipulation-utils path uses `fast-xml-parser`. Each command call re-parses the *entire* content string — there is no shared live document; treat every `execute()`/`undo()` as `(string) => string`.

## 2. Command implementation rules

- Constructor takes old+new values (or enough to reconstruct both) so `undo()` can either (a) build the inverse command and re-`execute()` it, or (b) restore a snapshot taken during `execute()`. Most commands use (a); `DeleteNodeCommand`/`DeleteNoteCommand` use (b) (whole-document string snapshot) because structural re-insertion is harder than string restore.
- If your command can change a state's **rendered width or height** (rename — label length; type change — different min-size; actions edit — height grows with action count; initial toggle — badge width), call `clearWaypointsForTouchingTransitions(doc, stateId)` from `waypoint-invalidation.ts` before returning. The edge renderer always prefers a persisted `viz:waypoints` path over dynamic routing, so a stale path will visually cut through a resized node if you skip this.
- Use `this.findStateElement(doc, id)` (matches `state`/`parallel`/`final`) or `this.findNoteElement(doc, noteId)` (viz-namespace-aware, handles the transient `note:idx-N` fallback id) from `BaseCommand` rather than writing your own `querySelector`.
- Call `this.ensureVizNamespace(doc)` before setting any `viz:*` attribute for the first time on a document that may not have declared the namespace yet.
- Known gap to be aware of (don't copy this pattern): `ChangeStateTypeCommand`'s `undo()` for a state→final conversion does not actually restore the transitions/substates it stripped during `execute()` — the snapshot is taken but never used. If you touch this command, this is a real bug, not intended behavior.

## 3. Validators

- `SCXMLValidator.validate()` (`src/lib/validators/scxml-validator.ts`) runs **16 ordered passes** — order matters because later passes depend on state built by earlier ones (id sets, hierarchy maps). If you add a pass, decide deliberately where in the sequence it belongs; don't just append at the end unless it's truly independent.
- Attribute whitelists live in `attribute-schemas.ts` as one `Set<string>` per element type — add new legal attributes there, not inline in the validator.
- `ValidationError.code` is defined in the type but **never populated anywhere**. Don't start relying on it for new logic without also deciding whether to actually populate it everywhere.
- Two live-blocking modules (`transition-slot-rules.ts`, `initial-group-utils.ts`) implement the *same* business rules as two static validators (`transition-slot-validator.ts`, `initial-group-validator.ts`) for a reason: the live version blocks bad edits *before* they happen in the diagram/panels; the static version catches violations from hand-edited XML or older files. **If you change the underlying rule, change it in the shared utility both call, not in one validator alone.**
- Before adding a validation rule, check `docs/invalid-event-identifiers.md` — several documented downstream-generator failure modes (C# reserved words as event names, digit-leading event names, wildcard `assign` locations, event-name sanitization collisions) do not yet have a corresponding automated rule. Closing one of those gaps is high-value, low-risk work.

## 4. Working with the `viz:` namespace

- Always read/write `viz:xywh` as **comma-separated** (`"x,y,w,h"`). A couple of call sites in `scxml-manipulation-utils.ts` write it space-separated — that is a known bug, not a second valid format; don't propagate it.
- Don't hand-roll `viz:*` attribute names — use the constants in `VISUAL_METADATA_CONSTANTS` (`src/types/visual-metadata/index.ts`) where they exist.
- The live editing path (Commands, converter modules) reads/writes `viz:*` attributes directly via DOM/object-tree access — it does **not** go through `VisualMetadataManager`. That class is a secondary reader/validator/serializer used mainly at parse/clean-export boundaries. Don't assume changing `VisualMetadataManager` affects live editing behavior.
- `visual-style-utils.ts:22` prepends `'#'` to a stored `viz:rgb` value — if that value can already contain `#`, this doubles it. Check before reusing this pattern elsewhere.

## 5. State management conventions

- Select single fields (`useXStore(s => s.field)`), never destructure the whole store in a component that re-renders often (`visual-diagram.tsx` and the side panels are performance-sensitive).
- If you need store access from non-component code (a Monaco provider, a class method, a plain utility function), use `useXStore.getState()` — this is an established pattern (`enhanced-scxml-completion.ts`, `HistoryManager`), not a workaround to avoid.
- `usePanelStore.setActivePanel`/`togglePanel` defer via `queueMicrotask` deliberately — don't "simplify" this back to a synchronous `set()`; it exists to dodge a real React warning ("Cannot update a component while rendering a different component") that occurs regardless of call site.

## 6. Testing conventions

- Pure logic (utils, validators, commands, layout math) gets plain Vitest unit tests with no rendering — follow this pattern for new pure functions.
- Only genuinely interactive components get `@testing-library/react` tests (`events-panel`, `github-panel`, `state-actions-panel`, `multi-select-toolbar`, `transition-panel`, plus 2 hook tests). Don't add RTL tests for purely presentational components.
- **Do not put new test files under a `__tests__/` subdirectory** — `vitest.config.ts`'s `exclude: ['**/__tests__/**', ...]` silently drops them from `npm test`. This has already happened to 5 real test files (`src/lib/layout/__tests__/*`, `src/lib/utils/__tests__/config-overrides.test.ts`) — they exist but never run in CI. Put new test files as siblings of the module they test instead (e.g. `foo.ts` + `foo.test.ts` in the same directory), matching the majority pattern in this repo.

## 7. Lazy `require()` for commands inside `visual-diagram.tsx`

That file invokes Command classes via `require('@/lib/commands/...')` inside handlers rather than top-level `import`. This is the established pattern in that file specifically (likely to avoid a circular import or bundle-splitting concern) — follow it when adding a new handler there, rather than mixing in a top-level import for just your addition.

## 8. Debug leftovers — do not add more, and fix if you touch these files

`debugger;` statements exist in shipped code and execute on every relevant pass: `src/lib/layout/adaptive-spacing.ts:36`, `src/lib/layout/hub-centroid-nudge.ts:51,120`, and in `src/lib/utils/initial-group-utils.ts`. These run on every layout pass / every connection attempt respectively. If you're editing any of these files for another reason, remove the `debugger;` statement as part of the change.
