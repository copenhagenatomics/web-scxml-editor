# Visual Diagram Decisions

Covers the ReactFlow canvas: rendering, layout, positioning, interaction model.

---

## 1. Hierarchy shown as one flat drill-down level at a time, not nested boxes

### Context
SCXML compound states can nest arbitrarily deep; rendering all levels simultaneously (boxes inside boxes) is a common statechart-tool convention but can get visually overwhelming for deep hierarchies.

### Decision
Only one hierarchy level is ever rendered on the canvas. Navigating into a compound state replaces the entire visible node set with its direct children; a breadcrumb/back action returns to the parent. `useHierarchyNavigation` unconditionally strips `parentId` from every node before it reaches `<ReactFlow>`, even though the converter still computes real nested parent/child wiring.

### Reason
Explicitly the intended end-user design, not an incidental limitation — `README.md`'s "Hierarchical Navigation" section describes this exact behavior as a headline feature ("The editor shows one level at a time so you don't get overwhelmed"). `node-dimension-calculator.ts`'s own comment states sizing is "explicitly not based on child count, since only one hierarchy level is ever visible at a time," confirming downstream code was deliberately built assuming this model.

### Constraints
- ELK layout must run per-level, never as a whole-tree hierarchical layout (see #4 below).
- Any new diagram feature must account for only one level being visible/selectable at a time — there is no cross-level selection or multi-level view.

### Alternatives
The converter's still-computed (but discarded) nested `parentId`/`extent: 'parent'`/`expandParent: true` wiring is suggestive evidence that nested rendering was either the original design before drill-down was adopted, or was kept as unused infrastructure — no direct comment confirms which.

### Evidence
`src/hooks/use-hierarchy-navigation.ts:70` ("Remove parentId for hierarchy navigation since parent is not rendered"), `src/lib/layout/node-dimension-calculator.ts`, `README.md` §"Hierarchical Navigation".

### Status
Accepted.

---

## 2. Single `SCXMLStateNode` component for every state type, discriminated by `data.stateType`

### Context
SCXML has multiple state kinds (simple, compound, parallel, final) that need visually distinct rendering.

### Decision
One React component (`SCXMLStateNode`) renders all of them, switching visuals based on a `stateType` field plus an `isInitial` boolean — rather than separate `CompoundStateNode`/`ParallelStateNode`/etc. components.

### Reason
The codebase shows direct evidence of a **prior** per-type-component design being deliberately consolidated: `src/types/hierarchical-node.ts` explicitly marks `CompoundStateNodeData`/`ParallelStateNodeData` as `@deprecated - removed - use SCXMLStateNode with data.stateType instead`.

### Constraints
Any new state-type-specific visual treatment must be added as a branch inside `SCXMLStateNode`, not a new node component — the "one component, discriminator field" pattern is now the established convention, reinforced throughout the diagram's enhancement pass (`visual-diagram.tsx`) which assumes exactly one state node type exists.

### Alternatives
The deprecated types **are** the previously-implemented alternative (per-type components) — directly evidenced, not just inferred.

### Evidence
`src/types/hierarchical-node.ts` (deprecation comments), `src/components/diagram/nodes/scxml-state-node.tsx`.

### Status
Accepted (current); the per-type-component design is Superseded.

---

## 3. History states render as a separate, purely decorative wrapper node

### Context
Shallow/deep history pseudostates need some visual representation distinct from ordinary states.

### Decision
History is the **one exception** to decision #2 — a separate ReactFlow node type (`HistoryWrapperNode`) renders as an oversized dashed box drawn around (not replacing) the container it's associated with, computed via fixed-margin math rather than ELK.

### Reason
Not explicitly documented, but the wrapper's own doc comment marks its positioning function `@deprecated ... kept for fallback only, use applyDefaultELKLayout() instead` — yet it remains the *only* implementation ever invoked, meaning either an ELK-based replacement was planned and never completed, or the deprecation comment is aspirational/stale.

### Constraints
There is currently no ELK-based alternative for history-wrapper sizing — treat the "deprecated" fixed-margin approach as production code, not a true fallback, until an actual replacement exists.

### Alternatives
The comment's reference to `applyDefaultELKLayout()` as the intended replacement is evidence an ELK-based approach was at least planned.

### Evidence
`src/components/diagram/nodes/history-wrapper-node.tsx`, `src/lib/converters/converter-modules/layout-positioning.ts` (`positionHistoryStates`, the deprecation comment).

### Status
Accepted (current, despite its own comment suggesting otherwise) — the described ELK-based replacement is, at most, an unrealized intention, not evidence of an actual past implementation.

---

## 4. ELK auto-layout runs per hierarchy level, never as one whole-tree hierarchical layout

### Context
ELK supports both flat and hierarchical (nested) layout modes.

### Decision
The live layout call (`applyDefaultELKLayout`) always passes `hierarchical: false` and runs ELK independently for each hierarchy level (grouped by `parentId`). A `hierarchical: true` code path exists in `elk-layout-service.ts` but is only reachable via the dead `ContainerLayoutManager`, never invoked by the running app.

### Reason
Directly follows from decision #1 (drill-down rendering) — a compound state's children are never simultaneously visible with their parent, so there is nothing for a whole-tree hierarchical layout to usefully compute that per-level layout doesn't already achieve for what's actually on screen.

### Constraints
`ContainerLayoutManager` (~700 lines) and the hierarchical ELK path should not be assumed live — confirmed dead code, unreachable from the running app.

### Alternatives
The existence of the unused `hierarchical: true` path and `ContainerLayoutManager` is direct evidence a whole-tree approach was built (or scaffolded) and then not adopted — whether it was actively rejected or simply superseded by the per-level approach as drill-down solidified is not documented.

### Evidence
`src/lib/converters/converter-modules/layout-positioning.ts` (`applyDefaultELKLayout`), `src/lib/layout/elk-layout-service.ts` (`buildHierarchicalGraph`, unreached), `src/lib/layout/container-layout-manager.ts` (unused import in `scxml-to-xstate.ts`).

### Status
Accepted (per-level layout); the whole-tree hierarchical alternative is Superseded/abandoned (not merely theoretical — real code exists for it).

---

## 5. Manually-stored position (`viz:xywh`) always overrides auto-layout

### Context
Users need to manually arrange nodes without auto-layout fighting their choices on every reload.

### Decision
Any node with a stored `viz:xywh` has its ELK-computed position discarded and overwritten back to the stored value — ELK only ever positions genuinely new/never-positioned nodes. Width is a floor (never auto-shrinks) but can grow past the stored value if calculated content minimum exceeds it.

### Reason
Not documented in a dedicated note, but this is the only design consistent with a "manual placement is durable" product promise — auto-layout existing purely to handle nodes the user hasn't touched yet.

### Constraints
This priority rule is enforced twice (once in the converter, once again in `visual-diagram.tsx`'s "enhancement pass") — both enforcement points must be kept consistent if this rule is ever changed.

### Alternatives
None found evidenced.

### Evidence
`src/lib/converters/converter-modules/layout-positioning.ts` (`applyDefaultELKLayout` steps 1 & 3), `src/lib/layout/node-dimension-calculator.ts` (width floor).

### Status
Accepted.

---

## 6. Layout defects fixed with narrow, targeted helper modules layered on ELK — not a custom layout engine, and not always the first approach tried

### Context
ELK's stock `layered` algorithm has known rough edges for this app's use case: long chains occupy one node per layer regardless of aspect ratio, hub nodes with many connections crowd their neighbors, and parallel edges between the same two nodes can overlap.

### Decision
Rather than replacing ELK or writing a full custom layout engine, the team added small, single-purpose helper modules that pre- or post-process ELK's output: `adaptive-spacing.ts` (widens spacing around high-degree hubs), `chain-wrapping.ts` (folds long chains into multiple rows), `hub-centroid-nudge.ts` (post-ELK, nudges hub nodes toward their neighbors' centroid).

### Reason
**Git history shows this was not the first approach for the hub/parallel-edge problem.** A prior attempt, "Add edge bundling logic and tests for parallel edges in layout" (commit `9aea43e`), was explicitly **reverted** (`78b8f21 Revert "Add edge bundling logic..."`), followed immediately by "Refactor SCXML state machine for multiple centroid logix" (`840275f`) — i.e., edge bundling was tried, rejected, and replaced with the centroid-nudge approach that exists in the code today (`hub-centroid-nudge.ts`).

### Constraints
Each helper module solves one specific, narrow visual defect — they are not meant to be a general-purpose layout framework; a new layout problem should get its own narrowly-scoped fix following this established pattern, not an attempt to generalize the existing helpers.

### Alternatives
**Directly evidenced, not inferred**: edge bundling for parallel edges was implemented, tested, and then reverted in favor of the centroid-nudge approach.

### Evidence
Commits `9aea43e` (edge bundling added), `78b8f21` (reverted), `840275f` (centroid refactor), `a49b1a4` (chain-wrap threshold fix); `src/lib/layout/hub-centroid-nudge.ts`, `adaptive-spacing.ts`, `chain-wrapping.ts`.

### Status
Accepted (centroid-nudge approach); edge bundling is explicitly Superseded/Reverted.

---

## 7. Selection is deliberately not ReactFlow's native selection model (except during marquee drag)

### Context
ReactFlow ships built-in click-select and box-select behavior, but this app needs Ctrl-click multi-select toggling and a double-click-to-rename gesture that don't map cleanly onto RF's defaults.

### Decision
Click/double-click/Ctrl-click are hand-rolled in `handleStateClick` with a 250ms timer for disambiguation; RF's own native `'select'`-type node-change events are only honored during an active marquee drag (`marqueeStartedRef` gate), and ignored otherwise.

### Reason
Explicitly documented via an extensive inline comment block in `visual-diagram.tsx`: ReactFlow's box-select overlay unconditionally emits native selection-change events regardless of context, which would otherwise fight with the custom click-count logic needed for rename/multi-select-toggle disambiguation.

### Constraints
Any new selection-related interaction must respect the `marqueeStartedRef` gate and the 250ms click-timing window, or risk reintroducing the exact conflict this design avoids.

### Alternatives
The comment implies relying purely on RF's native selection was tried/considered and found insufficient, though no separate commit isolates this as a standalone revert (it may have been an early design realization rather than a shipped-then-reverted feature).

### Evidence
`src/components/diagram/visual-diagram.tsx` (`handleStateClick`, `marqueeStartedRef`, the explanatory comment block), commit `0d17821 fix(visual-diagram): enhance drag-and-drop handling to include keyboard nudging` (a related refinement to the same interaction-disambiguation logic).

### Status
Accepted.

---

## 8. Edge path rendering follows a strict, non-configurable priority chain

### Context
An edge between two states can need very different rendering depending on context: manually routed, a self-loop, one of several parallel edges, or blocked by an obstacle.

### Decision
Path selection always follows this order: persisted waypoints → self-loop → persisted parallel-edge offset → obstacle-avoiding A* → plain smoothstep. Each branch is mutually exclusive; there is no blending (e.g. a self-loop never gets obstacle avoidance even if it would visually cross a sibling).

### Reason
Not documented in a dedicated note, but the ordering reflects a reasonable priority logic: explicit user intent (waypoints) always wins; special-cased geometries (self-loop, parallel offset) are cheap and visually distinct enough to handle before resorting to expensive pathfinding; obstacle avoidance is the fallback for the general case.

### Constraints
Changing this order, or trying to combine branches, requires re-verifying all five cases together since they're implemented as mutually exclusive branches, not independent, composable layers.

### Alternatives
None found evidenced.

### Evidence
`src/components/diagram/edges/scxml-transition-edge.tsx` (path-selection logic, lines implementing the described chain).

### Status
Accepted.

---

## 9. Sticky notes are fixed-width and cannot be manually resized

### Context
Notes needed some size behavior, and the team received explicit feedback about how notes should interact with the rest of the canvas.

### Decision
Notes are always 500px wide; height grows automatically via a font-shrink → height-expand → "full" cascade. Notes have no `NodeResizer` handles. Notes render **behind** other elements and do not push/affect other nodes when moved.

### Reason
The z-ordering/non-pushing behavior is a direct, traceable response to real feedback: commit `81f2b40`'s message is literally "* Notes should be behind all other elements and not affect/push other elements when moved around." — a verbatim stakeholder request. The initial-height halving (`3664278 The initial height of notes should be half of the current initial height.`) is similarly a direct response to feedback that the default was too tall.

### Constraints
Do not give notes push/collision behavior against other nodes, or raise their z-index above states/edges, without confirming this wouldn't reintroduce the exact problem the original feedback was about.

### Alternatives
The "before" state (notes pushing other elements, taller default height) is directly evidenced by the commits that changed away from it.

### Evidence
Commits `81f2b40`, `3664278`; `src/components/diagram/nodes/sticky-note-node.tsx`, `use-note-sizing.ts`.

### Status
Accepted.

---

## 10. Scroll-wheel zoom sensitivity boosted specifically for Windows trackpads

### Context
A user reported that pinch/trackpad zooming felt too weak/slow.

### Decision
A `useEffect` reads ReactFlow's internal `d3Zoom` instance directly and overrides its `wheelDelta` function to apply the same zoom-strength boost on Windows that ReactFlow's default already gives macOS pinch-zoom natively.

### Reason
Directly traceable to explicit user feedback: commit `c7ed62f "* Mouse-pad zooming is too 'slow'/weak - please make it 'stronger'/faster."` The technical root cause (macOS-only native boost in RF's default handling) is documented in an inline code comment.

### Constraints
This patches a ReactFlow-internal (not officially public) API surface directly — a ReactFlow version upgrade could silently break this with no compile-time warning, since it's accessed via a loosely-typed `useStore` selector.

### Alternatives
None found evidenced beyond the chosen direct-patch approach.

### Evidence
Commit `c7ed62f`; `src/components/diagram/visual-diagram.tsx` (`d3ZoomInstance.wheelDelta` override, inline comment explaining the macOS/Windows asymmetry).

### Status
Accepted.

---

## 11. Transition color changed from red to amber (red read as an implicit "error" signal)

### Context
Conditional transitions were originally rendered in a color that users interpreted as signaling an error state rather than a normal transition variant.

### Decision
Conditional-transition color was changed to amber. The internal constant is still named/commented as if it were "purple" in some code, a stale label left over from before this change (or a subsequent change) was made.

### Reason
Directly traceable to explicit feedback: commit `e8cc6eb "* Red transitions look like an errors - please use a different color. (amber)"`.

### Constraints
Do not "fix" the amber color back to match the stale "purple" comment/variable name — the comment is the outdated artifact, not the rendered color; if anything, the comment/variable name should eventually be renamed to match the actual amber value.

### Alternatives
Red is the directly-evidenced prior choice, explicitly abandoned due to its error-like connotation.

### Evidence
Commit `e8cc6eb`; `src/lib/consts/transition-colors.ts` (amber hex value under a comment/name suggesting "purple").

### Status
Accepted (amber); red is Superseded.

---

## 12. Transition rendering has no animation

### Context
ReactFlow edges can be rendered with animated dashes (commonly used to suggest active/flowing data).

### Decision
Transition edges are rendered statically, with no animation.

### Reason
Directly traceable to explicit feedback: commit `d9b7d0d "* Please remove animation on transitions"` — animation was present at some point and was explicitly requested to be removed.

### Constraints
Do not reintroduce animated edges without confirming this preference has changed — it was a deliberate removal, not an oversight.

### Alternatives
Animated transitions are the directly-evidenced prior state, explicitly reverted.

### Evidence
Commit `d9b7d0d`; current `scxml-transition-edge.tsx` renders a static `<path>` with no animation classes/attributes.

### Status
Accepted (no animation); animated transitions are Superseded.
