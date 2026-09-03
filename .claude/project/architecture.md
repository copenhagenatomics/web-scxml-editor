# Architecture

Full detail: `PROJECT_ANALYSIS.md` §4–§9. This is the condensed, navigable version.

## Shape

- `src/app/page.tsx` (~250 lines) is a thin orchestrator composing ~9 hooks from `src/app/_hooks/` + 3 layout components. It owns almost no logic.
- State is split across **7 independent Zustand stores** (`src/stores/*`), no combining root store. See `.claude/project/coding-rules.md` for which store owns what.
- **Two coexisting SCXML-mutation strategies** exist side by side (see below) — know which one a given interaction uses before modifying it.
- Validation and diagram-rendering are **fully independent read pipelines** over the same raw XML string; neither depends on the other's output.
- Undo/redo history is a **linear array of full-document string snapshots** with a cursor index, not a command stack.

## The two-way sync loop

```
Code edit ──> setContent() ──> useContentValidation() (debounce 500ms) ──> ValidationError[] in store
      │                    └─> VisualDiagram effect on `scxmlContent` ──> full re-parse + re-layout
      │
Diagram edit ──> Command.execute(content) or direct object-tree edit ──> onSCXMLChange(newContent, changeType)
                                                                              │
                                                                              v
                                                                       setContent() (same path as above)
```

- `changeType` ∈ `'position' | 'structure' | 'property' | 'resize'` selects debounced (position/resize, 300ms) vs. immediate history commits. Text edits debounce at 500ms.
- `isUpdatingFromHistory` (`src/app/_hooks/use-history-restore.ts`) is a 100ms guard flag during undo/redo playback, preventing the restored content from being re-tracked as a *new* history entry.
- Monaco's own native undo stack takes priority over this app's history while the code editor has focus — see `.claude/features/undo-redo-history.md`.

## Two coexisting SCXML-mutation strategies — know which one you're extending

1. **Command pattern** (`src/lib/commands/*`, 16 classes, `Command { execute, undo, getDescription }`, base class `BaseCommand`). Uses the browser's **`DOMParser`/`XMLSerializer`**. Used for: position/resize, rename, delete, state-type change, onentry/onexit actions, internal-event reactions, transition event/cond/handle/waypoint edits, transition reconnection, initial-state toggle, note CRUD, adding a datamodel field. Every command re-parses/re-serializes the *whole* document on every call — commands are stateless string→string transforms.
2. **Direct object-tree edits** (`src/lib/utils/scxml-manipulation-utils.ts`, using **`fast-xml-parser`'s parsed object tree**, not the DOM). Used *only* by `visual-diagram.tsx` for: drawing a new transition (`onConnect`), adding a root state, copy/paste of state subtrees, drag-to-reparent. These are **not** independently undoable Command objects — they only end up in history because the resulting content string gets pushed like everything else. There is no `AddStateCommand`/`ConnectCommand`/`PasteCommand`.

**If you add a new diagram interaction that mutates SCXML, default to writing a Command** (strategy 1) unless you have a specific reason to follow the direct-edit precedent (strategy 2 exists only for historical reasons — see `.claude/decisions/architecture.md` #2).

## Rendering pipeline (SCXML → diagram)

`SCXMLToXStateConverter.convertToReactFlow()` (`src/lib/converters/scxml-to-xstate.ts`) — despite the class name, does **not** use the `xstate` package:
1. Register every state/parallel/final/history into a flat registry (`converter-modules/state-registry.ts`).
2. Build one `HierarchicalNode` per state (placeholder position).
3. Collect transitions into ReactFlow edges (`converter-modules/edge-conversion.ts`).
4. Calculate node dimensions not already fixed by `viz:xywh` (`node-dimension-calculator.ts`).
5. Run **ELK layout**, per hierarchy level (`applyDefaultELKLayout`) — see `.claude/features/auto-layout-elk.md`.
6. Run a traffic-aware handle-assignment cost model for edges lacking persisted `viz:sourceHandle`/`viz:targetHandle` (`scxml-to-xstate.ts:292-429`).
7. Write results back into the SCXML string if anything was missing (`writeLayoutToSCXML`) — **opening a file without prior visual metadata can itself produce an SCXML edit**, surfaced as `onSCXMLChange(initializedSCXML, 'position')`.
8. Append sticky-note nodes (never touched by ELK/dimension calc).

`visual-diagram.tsx` then runs a further local **"enhancement" pass**: re-applies `VisualMetadataManager` position/style overrides with absolute priority, wires every node's UI callbacks, computes CSS styling, groups/offsets parallel edges.

## State management (7 Zustand stores, no root store)

| Store | File | Owns |
|---|---|---|
| `useEditorStore` | `stores/editor-store.ts` | `content`, `isDirty`, `errors`, `fileInfo`, hierarchy-nav state (`currentPath`, `currentParentId`, `navigationHistory`, `visibleNodes`), `initialChildByParent`, `focusTarget` |
| `useHistoryStore` | `stores/history-store.ts` | Linear `entries[]` + `currentIndex` |
| `useHostAPIStore` | `stores/host-api-store.ts` | Host bridge: commands, ready callbacks, feedback toasts, `channels`/`channelMappings`/`events`/`configOverrides`, persistent `hostErrors`, tab requests |
| `usePanelStore` | `stores/panel-store.ts` | Which single side panel is open (mutually exclusive); defers `set()` via `queueMicrotask` to dodge a React render-phase warning |
| `useGithubStore` | `stores/github-store.ts` | Persisted (localStorage) auth + linked-repo; transient sync state explicitly not persisted |
| `useStateClipboardStore` | `stores/state-clipboard-store.ts` | Copy/paste buffer for state subtrees |
| `useActionClipboardStore` | `stores/action-clipboard-store.ts` | Copy/paste buffer for individual entry/exit actions |

Consumed via field-level selectors (`useXStore(s => s.field)`), not full-store destructuring. `useHostAPIStore` and `useEditorStore`/`useHistoryStore` are also read **imperatively** (`.getState()`) from non-component code (Monaco's completion provider, the `HistoryManager` singleton).

## Host API / embedding architecture

`window.ScxmlEditorAPI`, bridged in `src/app/_hooks/use-host-api-bridge.ts`. Full detail: `.claude/features/host-api-embedding.md`. Key mechanism: a pre-ready `_q` command queue lets the host call API methods before this app's React tree mounts; `use-initial-load.ts` detects embedding via `window.self !== window.top` and waits up to 3000ms for the host to push content before falling back to the standalone Welcome screen.

## Directory map

See `PROJECT_ANALYSIS.md` §3 for the full annotated tree. Quick orientation:
- `src/app/` — routing shell + page-local hooks/components (`_hooks/`, `_components/`), thin.
- `src/components/diagram/` — the ReactFlow canvas; `visual-diagram.tsx` (3,347 lines) is the largest, most central file in the repo.
- `src/components/ui/` — side panels (Config, Channel Mapping, Events, GitHub, Validation) + `primitives/`.
- `src/lib/parsers/`, `validators/`, `converters/`, `commands/`, `layout/`, `metadata/`, `monaco/`, `github/`, `history/`, `utils/` — the domain logic layer, framework-agnostic.
- `src/stores/` — Zustand.
- `src/types/` — TypeScript mirrors of SCXML, visual metadata, history, host API.
- `server/` — standalone Express relay for GitHub OAuth Device Flow (separate `package.json`, not part of the Next.js build).

## Build / deployment

`next.config.ts` sets `output: "export"` — **fully static export**, no Node server at runtime. Release process (`RELEASE.md`, `.github/workflows/release.yml`) zips the static `out/` directory and attaches it to a GitHub Release on a `vX.Y.Z` tag push; the zip is meant to be served by any static file server, consistent with per-device/embedded LoopControl deployment.
