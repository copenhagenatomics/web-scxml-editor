# Feature: Hierarchy (Drill-Down) Navigation

## Purpose

Let a user work with deeply nested SCXML state machines without the canvas becoming visually overwhelming, by showing only one hierarchy level at a time and letting the user "step into" a compound state to see its children.

## User behavior

- At the root level, only top-level states are visible.
- Clicking the down-arrow affordance on a compound state (dashed border, appears on hover) navigates the canvas to show only that state's direct children.
- A breadcrumb trail appears once at least one level of navigation has occurred, showing up to the last 2 path segments plus a "…" and a Home icon if deeper; a "State Path" popover (Layers icon + depth badge) shows the full path and lets the user jump directly to any ancestor.
- Navigating always triggers a debounced `fitView` so the new level's contents are framed in view.
- Clicking a validation error whose `stateId` is set (from the Validation Panel) can jump the diagram directly to and highlight that state, drilling through however many levels are needed (`focusTarget` mechanism).

## UI behavior

- Compound-state children are **never shown nested inside the parent's box** — see "Design decision" below. The UI is always a flat single-level view.
- New file loads / root-node-set changes automatically reset navigation back to root if the currently-viewed parent no longer exists in the new document.

## Internal architecture

- `useHierarchyNavigation({ allNodes, allEdges })` (`src/hooks/use-hierarchy-navigation.ts`) is the single hook implementing this feature. It is fed the **full, unfiltered** node/edge graph from the SCXML→ReactFlow conversion and returns `filteredNodes`/`filteredEdges` scoped to `hierarchyState.currentParentId`.
- Filtering logic: at root, keep nodes with no `parentId`; otherwise keep nodes whose `parentId === currentParentId`. **The hook then strips `parentId` from every returned node** (`parentId: undefined`) before it's handed to `<ReactFlow>` — this is what forces the flat, non-nested rendering (see Design decisions).
- `hasChildren`/`isCompound` is recomputed here per visible node by checking whether any other node in the *full* graph has `parentId === node.id` (excluding sticky notes, which are never "children" for this purpose).
- `visual-diagram.tsx` wraps the hook's navigation functions in `navigateWithFitView` to also trigger a debounced camera fit on every navigation.

## Relevant components

- `src/hooks/use-hierarchy-navigation.ts` — the hook itself.
- `src/components/layout/two-tab-layout.tsx` — renders the breadcrumb and "State Path" popover, reading `hierarchyState` from `useEditorStore`.
- `src/components/diagram/visual-diagram.tsx` — consumes the hook's filtered output for what actually renders on the canvas; also owns the `focusTarget`-driven programmatic navigation effect.
- `src/components/diagram/nodes/scxml-state-node.tsx` — renders the "navigate into" arrow-down affordance for compound states.

## Relevant state/store

- `useEditorStore.hierarchyState` (`{currentPath, currentParentId, navigationHistory, visibleNodes}`) and its actions `navigateIntoState`/`navigateUp`/`navigateToRoot`/`setVisibleNodes` — all in `stores/editor-store.ts`.
- `useEditorStore.initialChildByParent` — a `Map` used only for the breadcrumb/popover's hover tooltips (which state(s) are Initial inside each ancestor), built by `hierarchy-initial-info.ts`.
- `useEditorStore.focusTarget` — cross-component "please navigate to and highlight this state" request, set by the Validation Panel's error-click handler and consumed/cleared by `visual-diagram.tsx`.

## Relevant utilities

- `src/lib/utils/hierarchy-initial-info.ts` — builds the per-parent Initial-child tooltip data.
- `src/lib/utils/resolve-focus-target.ts` — resolves a validation error's `stateId`/`targetStateId` into the ancestor-chain of node ids to drill through plus the node id(s) to highlight.

## SCXML behavior

Purely a viewing/editing convenience — this feature does not change what's stored in the SCXML document. The underlying parent/child structure it filters comes from ordinary SCXML nesting (`<state>` containing `<state>`/`<parallel>`/`<final>`/`<history>`).

## Validation rules

None directly. Validation errors reach this feature only via `focusTarget`.

## Related features

- `two-way-sync.md` — the full node/edge graph this feature filters is rebuilt from scratch on every content change.
- `state-node-types.md` — the "compound" classification and its "navigate into" affordance.
- `scxml-validation.md` — the source of `focusTarget` jumps.

## Related files

`src/hooks/use-hierarchy-navigation.ts`, `src/stores/editor-store.ts`, `src/lib/utils/hierarchy-initial-info.ts`, `src/lib/utils/resolve-focus-target.ts`, `src/components/layout/two-tab-layout.tsx`.

## Tests

`src/lib/utils/hierarchy-initial-info.test.ts`, `src/lib/utils/resolve-focus-target.test.ts` cover the utility logic. No test directly exercises `use-hierarchy-navigation.ts` itself.

## Known limitations

- The converter (`scxml-to-xstate.ts`) computes real ReactFlow `parentId`/`extent: 'parent'`/`expandParent: true` wiring as if for nested rendering, which this hook then discards every render. This is dead weight computed on every conversion for no current visual effect — acceptable given it's a deliberate product choice, but worth knowing if you're trying to understand why that wiring exists at all.
- No "zoomed out, see everything" view exists — for very deep hierarchies, understanding overall structure requires navigating level by level or using the "State Path" popover.

## Important edge cases

- If the currently-viewed parent state is deleted (or the whole file is replaced) while drilled in, navigation automatically resets to root on the next render (`use-hierarchy-navigation.ts`'s `rootNodeIds`-keyed effect) rather than showing an empty/broken view.
- Sticky notes are explicitly excluded from the "does this node have children" check — a note living "inside" a state (scoped via `parentStateId` at creation) does not make that state look/behave like a compound state.

## Things that must NOT be changed

- Do not remove the `parentId: undefined` stripping in `use-hierarchy-navigation.ts` without a deliberate decision to switch to nested rendering — plenty of other code (dimension calculation, ELK per-level layout, the whole one-level-at-a-time UX described in `README.md` and `.claude/project/ui-rules.md`) assumes the flat drill-down model.

## Previous design decisions

See `.claude/decisions/visual-diagram.md` #1 for the fuller rationale trail. In short: `node-dimension-calculator.ts`'s own doc comment states dimensions are computed "explicitly not based on child count, since only one hierarchy level is ever visible at a time" — confirming this is intentional design, not an oversight, and matches the end-user documentation in `README.md`'s "Hierarchical Navigation" section.
