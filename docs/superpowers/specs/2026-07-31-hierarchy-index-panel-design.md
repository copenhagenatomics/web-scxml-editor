# Hierarchy index panel — design

## Context

The toolbar in `two-tab-layout.tsx:207-247` shows a breadcrumb of the current
state-hierarchy path (`hierarchyState.currentPath` from `editor-store.ts`),
but it only renders the **last 2 segments** plus a Home icon and a `…` when
more levels are hidden above that (`currentPath.slice(-2)`,
`hasHiddenSegments`). In deep hierarchies (e.g.
`root > operation > turbo_running > spinning_up`), the earlier levels
disappear entirely — there's no way to see the full depth or jump directly to
a middle layer; you can only click a still-visible crumb or go Home.

A second, currently dead breadcrumb implementation already exists in
`visual-diagram.tsx:2559-2586` (`className="hidden"`), built on
`use-hierarchy-navigation.ts` (`breadcrumbPath`, `navigateToBreadcrumb`,
`currentParentNode`). It shows all levels plus a "Level: N" count — an
earlier, parked attempt at this same problem. This design supersedes it and
removes it rather than leaving two parallel implementations.

## Goal

Let a user see and jump to any ancestor level of the current state, not just
the last two, and see at a glance how deep the current position is — without
permanently consuming canvas space.

## Design

### 1. Trigger & placement

A small icon button sits in the toolbar next to the existing (still
truncated, unchanged) breadcrumb, showing a numeric depth badge equal to
`currentPath.length` (root counts as a layer). Clicking it opens the path
panel; clicking it again, selecting a row inside the panel, or clicking
outside the panel closes it.

This is intentionally **not** wired into `panel-store.ts`'s `activePanel`
(the mutual-exclusion model the right-side panels — config/events/channel
mapping/etc. — already share). It lives on the opposite edge of the screen
and there's no reason a user shouldn't have e.g. the config panel open on the
right while checking the hierarchy path on the left. Its open/closed state is
local, simple boolean state.

### 2. Panel contents

Reuses the existing `Panel` primitive
(`src/components/ui/primitives/panel.tsx`) — same title bar / close button /
scrollable body shell the right-side panels use — mounted `absolute left-0
top-0` in `visual-editor-pane.tsx`, mirroring how `SidePanels` mounts on the
right (`visual-editor-pane.tsx:32-36`).

The body is a vertical, **un-truncated** list of `hierarchyState.currentPath`
— root down to the current state, every ancestor rendered, the current one
visually highlighted. Clicking a row navigates to that depth, reusing the
same repeated-`navigateUp()` mechanism the existing breadcrumb already uses
for its visible crumbs, then closes the panel.

### 3. Hover tooltip

Hovering any row (including the current/last one) shows that layer's
`initial` child state's name plus that child's `onEntryActions` — i.e. "if
you stopped drilling in here, this is where you'd land and what would run on
entry." Both pieces of data are already precomputed and attached to node
data, no new computation required:

- Initial-child lookup: filter nodes by `parentId === row.stateId`, find the
  one with `isInitial === true` (set via `isInitialState()` in
  `layout-positioning.ts:301`, resolving `@_initial` / `<initial>`).
- Entry actions: that child node's `onEntryActions` field
  (`scxml-state-node.tsx:38-44`).

If a row's state has no children (leaf/final state), there is no initial
child to show — the tooltip is omitted for that row.

### 4. Cleanup

Remove the dead breadcrumb block in `visual-diagram.tsx:2559-2586` and the
now-unused parts of `use-hierarchy-navigation.ts` it alone depended on
(`breadcrumbPath`, `navigateToBreadcrumb`, `currentParentNode`), after
confirming nothing else references them.

### 5. Out of scope

No change to how parallel states are tracked. `currentPath` remains a single
linear path exactly as today; this feature changes how much of that path is
visible and navigable, not the underlying navigation model. The existing
toolbar breadcrumb (last-2-segments view) is left as-is — the new panel is an
additional, on-demand way to see the full path, not a replacement.

## Testing

- Unit: depth badge reflects `currentPath.length` at various depths
  (root-only, 2 levels, 5+ levels).
- Unit: clicking a non-last row navigates to that exact depth and closes the
  panel.
- Unit: tooltip renders initial-child name + entry actions for a row with
  children; renders nothing for a leaf/final row.
- Manual: open a real SCXML file with a deep hierarchy (4+ nested levels,
  including at least one parallel region), confirm every ancestor is listed
  and clickable, confirm badge count matches, confirm tooltip content matches
  the actual `initial`/entry-action data for a couple of layers.
