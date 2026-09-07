# Feature: ELK Auto-Layout Engine

## Purpose

Automatically position states and route edges so a state machine is readable without the user manually placing every node — while still letting the user override any position/size by hand and have that override respected on every subsequent reload.

## User behavior

- New states (with no prior `viz:xywh`) appear in a sensible auto-computed position relative to their siblings, not stacked at the origin.
- Once a user manually moves or resizes a state, that position/size is preserved on every future load/edit — auto-layout never fights a manual placement.
- Long chains of states wrap into multiple rows instead of one very tall column; a "hub" state with unusually many connections gets extra breathing room around it instead of crowding its neighbors.

## UI behavior

Layout runs invisibly as part of parsing — there is no explicit "run layout" button for the default flow (though the toolbar has an auto-layout options icon per `README.md`/tips carousel, for re-triggering a fuller layout pass).

## Internal architecture

- Triggered on **every** SCXML parse (`SCXMLToXStateConverter.convertToReactFlow()` → `applyDefaultELKLayout()`, `src/lib/converters/scxml-to-xstate.ts:245`), not just once or on-demand.
- Run **per hierarchy level independently** (`hierarchical: false` always in the live path) — matches the drill-down UX (`hierarchy-navigation.md`): a compound state is laid out as a plain sized box among its siblings, never expanded to account for its (currently invisible) children.
- Base ELK config (`elk-layout-service.ts`): `algorithm: 'layered'`, `direction: 'DOWN'`, `edgeRouting: 'ORTHOGONAL'`, spacing `nodeNode:40/edgeNode:20/edgeEdge:10`, 20px padding, `aspectRatio: 3`, `NETWORK_SIMPLEX` node placement + layering, `LAYER_SWEEP` crossing minimization, `GREEDY` cycle breaking.
- **`viz:xywh` always wins**: any node with a stored position has ELK's computed position discarded and overwritten back to the stored value — ELK effectively only positions genuinely new/never-positioned nodes. Stored width/height are used as a **floor** (never shrink on reparse, can grow if calculated content minimum exceeds it).
- Five narrow, single-purpose layout-quality helper modules, each fixing one specific ELK shortcoming:
  - **`adaptive-spacing.ts`** — widens `nodeNode` spacing for a hierarchy level containing a high-degree "hub" node, so its many edges/labels don't crowd. *(Contains a `debugger;` statement at line 36 — see `.claude/project/coding-rules.md`.)*
  - **`chain-wrapping.ts`** — ELK's layered algorithm puts one node per layer for a long linear chain regardless of aspect-ratio hints; `shouldWrapLevel` decides when to enable `wrapping.strategy=MULTI_EDGE` so a long chain folds into multiple rows.
  - **`hub-centroid-nudge.ts`** — a *post*-ELK correction: nudges genuine degree-outlier hub nodes horizontally to the centroid of their neighbors (ELK has no such centering concept), then resolves any resulting sibling overlap. *(Contains `debugger;` statements at lines 51 and 120.)*
  - **`edge-obstacle-utils.ts`** — shared geometry (Liang-Barsky segment/rect intersection, orthogonal-route approximation, A* staircase simplification) used both by the converter's handle-assignment cost model (below) and by the edge renderer's obstacle-avoidance fallback (`transitions-editing.md`).
  - **`node-dimension-calculator.ts`** + **`measure-label-width.ts`** — pre-ELK sizing so ELK lays out against real (or measured-estimate) box sizes rather than generic placeholders.
- **Traffic-aware handle assignment** (`scxml-to-xstate.ts:292-429`, not in a separate layout file): for any edge lacking a persisted `viz:sourceHandle`/`viz:targetHandle`, scores candidate handle-side pairs by (a) geometric directness, (b) how much other traffic already uses that handle globally across the diagram, and (c) how many sibling nodes an approximate route would cross — a handle already saturated with edges is avoided in favor of a quieter one, and a route that would visually cut through another node is penalized.
- Results are written back into the SCXML string (`writeLayoutToSCXML`) whenever any node lacked `viz:xywh` or any edge lacked its handle attributes — meaning the very first open of a foreign/plain SCXML file can itself produce a content edit (see `two-way-sync.md`).

## Relevant components

None directly — this is a pure computation layer invoked from `src/lib/converters/scxml-to-xstate.ts`, consumed by `visual-diagram.tsx`.

## Relevant state/store

None — layout results flow through the converter's return value and get written into the shared `content` string; there's no separate layout store.

## Relevant utilities

`src/lib/layout/elk-layout-service.ts`, `container-layout-manager.ts` (**dead code — imported but never actually invoked**, along with the `hierarchical: true` ELK code path only it would exercise), `adaptive-spacing.ts`, `chain-wrapping.ts`, `hub-centroid-nudge.ts`, `edge-obstacle-utils.ts`, `path-builders.ts`, `node-dimension-calculator.ts`, `measure-label-width.ts`, `src/lib/converters/converter-modules/layout-positioning.ts` (`applyDefaultELKLayout`, `positionHistoryStates`, `isInitialState`).

## SCXML behavior

Writes `viz:xywh` (position+size) and `viz:sourceHandle`/`viz:targetHandle` attributes into the document — see `.claude/project/scxml-rules.md` for the exact format. Never writes `viz:waypoints` (manual routing is a separate, user-only action — see `transitions-editing.md`).

## Validation rules

None directly — layout is not validated; a layout computation cannot itself be "invalid" in the SCXML-semantic sense.

## Related features

- `two-way-sync.md` — layout runs as part of every diagram-side re-render triggered by a content change.
- `state-node-types.md` — dimension calculation depends on state type and Initial-badge presence.
- `transitions-editing.md` — the obstacle-avoidance geometry is shared between layout's handle-assignment scoring and live edge rendering.
- `visual-metadata-namespace.md` — `viz:xywh`/handle attributes this feature writes.

## Related files

`src/lib/converters/scxml-to-xstate.ts`, `src/lib/converters/converter-modules/layout-positioning.ts`, all of `src/lib/layout/*`.

## Tests

`src/lib/layout/chain-wrapping.test.ts`, `elk-layout-service.test.ts`, `measure-label-width.test.ts` (these **run**). `src/lib/layout/__tests__/{adaptive-spacing,edge-obstacle-utils,hub-centroid-nudge,node-dimension-calculator}.test.ts` (these **exist but do not run** — see `.claude/workflows/running-and-writing-tests.md`, `vitest.config.ts` excludes `__tests__/` directories). `src/lib/converters/converter-modules/layout-positioning.test.ts`, `src/lib/converters/scxml-to-xstate.test.ts`.

## Known limitations

- `container-layout-manager.ts` (~700 lines) and the `hierarchical: true` ELK path are dead code — confirmed unreachable from the running app. Don't extend them expecting they're on a live path; either they need to be wired up deliberately or removed.
- `positionHistoryStates` is marked `@deprecated ... kept for fallback only` in its own doc comment, yet is the **only** implementation ever invoked for history-wrapper sizing — the deprecation note does not reflect reality; treat it as production code, not a fallback.
- 4 of the layout module's own test files never run due to the `__tests__/` exclusion bug (see Known Issues in `.claude/index.md`) — don't assume `npm test` passing proves these modules are correct.
- Leftover `debugger;` statements in `adaptive-spacing.ts` and `hub-centroid-nudge.ts` execute on every single parse/layout pass.

## Important edge cases

- A node's stored width is a floor, never a ceiling on reparse — if calculated content minimum exceeds it (e.g. after a rename to a longer id), the effective width grows even though the user never touched `NodeResizer`. This is intentional (prevents content clipping) but means "the node I sized stayed exactly that size" is not always true across edits.
- ELK is invoked **per level**, so a transition's start/end anchor coordinates from ELK are only meaningful within their shared parent's coordinate frame — cross-level positioning concerns don't apply since cross-hierarchy transitions are disallowed anyway (`.claude/project/scxml-rules.md`).

## Things that must NOT be changed

- Do not let ELK override a node's position when `viz:xywh` is already present — this is the core contract that makes manual positioning durable; several other features (state-node-types dimension floor, waypoint invalidation) assume "stored position/size always wins over auto-layout."
- Do not wire up `container-layout-manager.ts`/`hierarchical: true` without first verifying it wouldn't conflict with the drill-down (single-level) rendering model everything else assumes.

## Previous design decisions

The extensive, narrowly-scoped helper modules (adaptive-spacing, chain-wrapping, hub-centroid-nudge) each read as a targeted fix for one specific ugly-diagram case encountered in practice, layered incrementally on top of ELK's stock layered algorithm rather than replacing it — evidence of iterative, defect-driven tuning rather than a single up-front layout design. No dedicated plan/spec doc in `docs/superpowers/` covers layout specifically, so this history is inferred from the code's structure and comments rather than documented explicitly.
