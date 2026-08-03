# Hierarchy Index Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle button (with a depth badge) next to the existing toolbar breadcrumb that opens a dropdown listing every ancestor level of the current state — not just the last 2 — with a hover tooltip on each level showing its initial child state(s) and their entry actions.

**Architecture:** A pure utility groups already-computed diagram node data (`isInitial`, `entryActions`, `parentId`) by parent state id. `VisualDiagram` pushes that grouping into `editor-store` whenever it recomputes its nodes. The toolbar (`TwoTabLayout`) reads both `hierarchyState.currentPath` (existing) and the new grouping (for tooltips) to render a self-contained dropdown — no new cross-component panel-mount plumbing needed. Dead, already-disabled breadcrumb code in `visual-diagram.tsx` and `use-hierarchy-navigation.ts` is removed as part of this work.

**Tech Stack:** Next.js, React, Zustand (`editor-store.ts`), Tailwind, Vitest, lucide-react icons, reactflow `Node` type.

**Deviations from `docs/superpowers/specs/2026-07-31-hierarchy-index-panel-design.md`** (discovered while mapping exact files — behavior described in the spec is preserved, only the mechanism changed):

1. **Mount location.** The spec said mount a panel `absolute left-0 top-0` in `visual-editor-pane.tsx`, mirroring `SidePanels`. In practice, the row-list + navigation only need `hierarchyState.currentPath` (already available in `two-tab-layout.tsx`, exactly like today's breadcrumb), while only the *tooltip* needs node data, which lives inside `VisualDiagram` (unmounted while the Code tab is active). Splitting them would mean the "see full path" affordance stops working on the Code tab — a regression versus today's breadcrumb, which works on both tabs. Instead, the whole panel (toggle, badge, row list, tooltip) lives directly in `two-tab-layout.tsx` as a self-contained dropdown (local `useState`, click-outside-to-close — the same pattern `app/_hooks/use-more-menu.ts` already uses for the "⋮" menu). Only the tooltip *data* crosses component boundaries, via a new `editor-store` field that `VisualDiagram` populates.
2. **Field name.** The spec says tooltips read `onEntryActions`. That field exists on `SCXMLStateNodeData` but is never populated anywhere in the codebase — the actual entry-actions data flows through `entryActions` (`scxml-to-xstate.ts:629`, rendered at `scxml-state-node.tsx:678`). The plan uses `entryActions`.
3. **Multiple initial states per layer.** `docs/superpowers/specs/2026-07-17-multiple-initial-state-groups-design.md` added support for a parent having more than one child simultaneously marked Initial (space-separated `initial="A B"`, each root of its own connected component). The spec's tooltip design assumed a single initial child. This plan's tooltip shows all of them.
4. **Badge count.** `hierarchyState.currentPath` does not include the root (root is implicit, shown via the Home icon). The badge shows `currentPath.length + 1` so it counts root as a layer, matching the row list the panel renders (Home row + one row per `currentPath` entry).

**Known limitation (acceptable, not a blocker):** `initialChildByParent` is only populated once `VisualDiagram` has computed nodes at least once in the session (i.e., after the user has visited the Visual tab). Until then, tooltips are simply omitted — the row list and navigation work regardless, since they don't depend on node data.

---

### Task 1: Pure utility — group initial children by parent, format tooltip text

**Files:**
- Create: `src/lib/utils/hierarchy-initial-info.ts`
- Test: `src/lib/utils/hierarchy-initial-info.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/utils/hierarchy-initial-info.test.ts
import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import type { SCXMLStateNodeData } from '@/components/diagram/nodes/scxml-state-node';
import {
  buildInitialChildByParent,
  formatInitialTooltip,
  HIERARCHY_ROOT_KEY,
} from './hierarchy-initial-info';

function makeNode(
  id: string,
  parentId: string | undefined,
  data: Partial<SCXMLStateNodeData>
): Node<SCXMLStateNodeData> {
  return {
    id,
    parentId,
    position: { x: 0, y: 0 },
    data: { label: id, stateType: 'simple', ...data },
  };
}

describe('buildInitialChildByParent', () => {
  it('groups a single initial child under its parent id', () => {
    const nodes = [
      makeNode('operation', undefined, { isInitial: true }),
      makeNode('idle', 'operation', { isInitial: true, entryActions: ['log("idle")'] }),
      makeNode('spinning_up', 'operation', {}),
    ];
    const map = buildInitialChildByParent(nodes);
    expect(map.get('operation')).toEqual([{ label: 'idle', entryActions: ['log("idle")'] }]);
  });

  it('uses the root sentinel for top-level initial nodes', () => {
    const nodes = [makeNode('operation', undefined, { isInitial: true })];
    const map = buildInitialChildByParent(nodes);
    expect(map.get(HIERARCHY_ROOT_KEY)).toEqual([{ label: 'operation', entryActions: [] }]);
  });

  it('collects multiple initial children for the same parent (multi-initial-group states)', () => {
    const nodes = [
      makeNode('a', 'root_container', { isInitial: true }),
      makeNode('b', 'root_container', { isInitial: true }),
      makeNode('c', 'root_container', { isInitial: false }),
    ];
    const map = buildInitialChildByParent(nodes);
    expect(map.get('root_container')).toEqual([
      { label: 'a', entryActions: [] },
      { label: 'b', entryActions: [] },
    ]);
  });

  it('omits parents with no initial children', () => {
    const nodes = [makeNode('leaf', 'parent', {})];
    const map = buildInitialChildByParent(nodes);
    expect(map.has('parent')).toBe(false);
  });
});

describe('formatInitialTooltip', () => {
  it('returns undefined when there is nothing to show', () => {
    expect(formatInitialTooltip(undefined)).toBeUndefined();
    expect(formatInitialTooltip([])).toBeUndefined();
  });

  it('formats a single initial child with entry actions', () => {
    const text = formatInitialTooltip([{ label: 'idle', entryActions: ['log("idle")'] }]);
    expect(text).toBe('Initial state:\n  idle — on entry: log("idle")');
  });

  it('formats a single initial child with no entry actions', () => {
    const text = formatInitialTooltip([{ label: 'idle', entryActions: [] }]);
    expect(text).toBe('Initial state:\n  idle');
  });

  it('formats multiple initial children (multi-initial-group states)', () => {
    const text = formatInitialTooltip([
      { label: 'a', entryActions: [] },
      { label: 'b', entryActions: ['x()'] },
    ]);
    expect(text).toBe('Initial states:\n  a\n  b — on entry: x()');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/utils/hierarchy-initial-info.test.ts`
Expected: FAIL — `Cannot find module './hierarchy-initial-info'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/utils/hierarchy-initial-info.ts
import type { Node } from 'reactflow';
import type { SCXMLStateNodeData } from '@/components/diagram/nodes/scxml-state-node';

export interface InitialChildInfo {
  label: string;
  entryActions: string[];
}

/** Sentinel key for top-level nodes (no parentId), representing the document root. */
export const HIERARCHY_ROOT_KEY = '__root__';

/**
 * Groups every node marked isInitial by its parentId (root-level nodes use
 * HIERARCHY_ROOT_KEY), so a hierarchy layer's default child/children —
 * including all Initial State groups, per the multiple-initial-groups
 * feature — can be looked up by that layer's own state id.
 */
export function buildInitialChildByParent(
  nodes: Node<SCXMLStateNodeData>[]
): Map<string, InitialChildInfo[]> {
  const map = new Map<string, InitialChildInfo[]>();
  for (const node of nodes) {
    if (!node.data?.isInitial) continue;
    const key = node.parentId ?? HIERARCHY_ROOT_KEY;
    const info: InitialChildInfo = {
      label: node.data.label ?? node.id,
      entryActions: node.data.entryActions ?? [],
    };
    const existing = map.get(key);
    if (existing) existing.push(info);
    else map.set(key, [info]);
  }
  return map;
}

/** Renders initial-child info as multi-line text for a native `title` tooltip. */
export function formatInitialTooltip(
  entries: InitialChildInfo[] | undefined
): string | undefined {
  if (!entries || entries.length === 0) return undefined;
  const header = entries.length > 1 ? 'Initial states' : 'Initial state';
  const lines = entries.map((e) =>
    e.entryActions.length > 0
      ? `${e.label} — on entry: ${e.entryActions.join(', ')}`
      : e.label
  );
  return `${header}:\n${lines.map((l) => `  ${l}`).join('\n')}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/hierarchy-initial-info.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/hierarchy-initial-info.ts src/lib/utils/hierarchy-initial-info.test.ts
git commit -m "feat(hierarchy-panel): add pure utility to group initial children by parent"
```

---

### Task 2: Store the grouping in `editor-store`

**Files:**
- Modify: `src/stores/editor-store.ts`

- [ ] **Step 1: Add the field, action, and reset wiring**

In `src/stores/editor-store.ts`, add the import at the top:

```ts
import type { InitialChildInfo } from '@/lib/utils/hierarchy-initial-info';
```

In the `EditorStore` interface, replace:

```ts
  // Hierarchy navigation state
  hierarchyState: HierarchyState;

  // Actions
  setContent: (content: string) => void;
```

with:

```ts
  // Hierarchy navigation state
  hierarchyState: HierarchyState;
  // Initial child(ren) info per parent state id, keyed for the hierarchy
  // index panel's hover tooltip (HIERARCHY_ROOT_KEY for top-level).
  initialChildByParent: Map<string, InitialChildInfo[]>;

  // Actions
  setContent: (content: string) => void;
```

and replace:

```ts
  // Hierarchy navigation actions
  navigateIntoState: (stateId: string) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
  setVisibleNodes: (nodes: Set<string>) => void;
}
```

with:

```ts
  // Hierarchy navigation actions
  navigateIntoState: (stateId: string) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
  setVisibleNodes: (nodes: Set<string>) => void;
  setInitialChildByParent: (map: Map<string, InitialChildInfo[]>) => void;
}
```

In the store creation, replace:

```ts
export const useEditorStore = create<EditorStore>((set, get) => ({
  ...initialState,
  fileInfo: null,
  hierarchyState: initialHierarchyState,
```

with:

```ts
export const useEditorStore = create<EditorStore>((set, get) => ({
  ...initialState,
  fileInfo: null,
  hierarchyState: initialHierarchyState,
  initialChildByParent: new Map(),
```

replace:

```ts
  reset: () => {
    set({
      ...initialState,
      fileInfo: null,
      hierarchyState: initialHierarchyState
    });
  },
```

with:

```ts
  reset: () => {
    set({
      ...initialState,
      fileInfo: null,
      hierarchyState: initialHierarchyState,
      initialChildByParent: new Map(),
    });
  },
```

and replace:

```ts
  setVisibleNodes: (nodes: Set<string>) => {
    set({
      hierarchyState: {
        ...get().hierarchyState,
        visibleNodes: nodes
      }
    });
  }
}));
```

with:

```ts
  setVisibleNodes: (nodes: Set<string>) => {
    set({
      hierarchyState: {
        ...get().hierarchyState,
        visibleNodes: nodes
      }
    });
  },

  setInitialChildByParent: (map: Map<string, InitialChildInfo[]>) => {
    set({ initialChildByParent: map });
  },
}));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors (there is no existing test file for this store, so no unit test to run here — verified via type-check and the manual pass in Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/stores/editor-store.ts
git commit -m "feat(hierarchy-panel): add initialChildByParent to editor-store"
```

---

### Task 3: Populate the store from `VisualDiagram`'s node data

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Add imports**

Near the existing `import { usePanelStore } from '@/stores/panel-store';` line (~line 63), add:

```ts
import { useEditorStore } from '@/stores/editor-store';
import { buildInitialChildByParent } from '@/lib/utils/hierarchy-initial-info';
```

- [ ] **Step 2: Read the setter and sync the map on every node recompute**

Directly after this existing line (~2061):

```ts
  // Update allNodesRef with original nodes (with parentId intact)
  allNodesRef.current = parsedData.nodes;
```

add:

```ts

  // Keep the hierarchy index panel's tooltip data (editor-store) in sync
  // with the current node set, so it works from the toolbar without that
  // component needing direct access to the diagram's node graph.
  const setInitialChildByParent = useEditorStore((state) => state.setInitialChildByParent);
  React.useEffect(() => {
    setInitialChildByParent(buildInitialChildByParent(parsedData.nodes));
  }, [parsedData.nodes, setInitialChildByParent]);
```

- [ ] **Step 3: Manually verify no runtime errors**

Run: `npm run dev`, open the app, load any SCXML file with at least one nested state, navigate into it via double-click.
Expected: No console errors; diagram behaves exactly as before (this step is purely additive).

- [ ] **Step 4: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat(hierarchy-panel): sync initialChildByParent from diagram nodes"
```

---

### Task 4: Remove the dead breadcrumb implementation

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`
- Modify: `src/hooks/use-hierarchy-navigation.ts`

This is pure removal of already-disabled code (`className='hidden'`) that the new toolbar panel supersedes, plus the now-unused plumbing it alone depended on. Kept as its own commit, separate from Task 3's additive change, for a clean history.

- [ ] **Step 1: Remove the unused exports from `use-hierarchy-navigation.ts`**

Delete these three blocks from `src/hooks/use-hierarchy-navigation.ts`:

```ts
  // Get breadcrumb path for navigation display
  const breadcrumbPath = useMemo(() => {
    if (hierarchyState.currentPath.length === 0) {
      return ['Root'];
    }
    return ['Root', ...hierarchyState.currentPath];
  }, [hierarchyState.currentPath]);
```

```ts
  // Navigate to a specific level in the breadcrumb
  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index === 0) {
        navigateToRoot();
      } else if (index < hierarchyState.currentPath.length) {
        // Navigate to intermediate level
        const targetPath = hierarchyState.currentPath.slice(0, index);
        const targetParentId = targetPath[targetPath.length - 1] || null;

        // We need to reset to that level
        // For now, we'll navigate up repeatedly
        const stepsUp = hierarchyState.currentPath.length - index;
        for (let i = 0; i < stepsUp; i++) {
          navigateUp();
        }
      }
    },
    [hierarchyState.currentPath, navigateToRoot, navigateUp]
  );
```

```ts
  // Find parent node info for display
  const currentParentNode = useMemo(() => {
    if (!hierarchyState.currentParentId) return null;
    return allNodes.find((n) => n.id === hierarchyState.currentParentId);
  }, [hierarchyState.currentParentId, allNodes]);
```

And remove their entries from the returned object, so it reads:

```ts
  return {
    filteredNodes,
    filteredEdges,
    canNavigateUp,
    navigateUp,
    navigateToRoot,
    navigateIntoState,
    currentParentId: hierarchyState.currentParentId,
  };
```

- [ ] **Step 2: Remove the dead JSX block and its now-unused wiring in `visual-diagram.tsx`**

Delete this block (currently `className='hidden'`, right before the `<div className='flex-1 relative'>` wrapping `<ReactFlow>`):

```tsx
        {/* Hierarchy Navigation Controls — hidden; breadcrumb shown in main toolbar */}
        <div className='hidden'>
          <div className='flex items-center gap-1 flex-1'>
            {breadcrumbPath.map((path, index) => (
              <React.Fragment key={index}>
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className={`px-2 py-1 text-sm hover:bg-muted rounded transition-colors ${
                    index === breadcrumbPath.length - 1
                      ? 'font-semibold text-default'
                      : 'text-muted hover:text-default'
                  }`}
                >
                  {path}
                </button>
                {index < breadcrumbPath.length - 1 && (
                  <ChevronRight className='h-3 w-3 text-dimmed' />
                )}
              </React.Fragment>
            ))}
          </div>

          {currentParentNode && (
            <div className='text-sm text-muted ml-auto'>
              Level: {breadcrumbPath.length - 1}
            </div>
          )}
        </div>

```

Remove the now-unused `navigateToBreadcrumb` wrapper (it was only called from the block just deleted):

```ts
  const navigateToBreadcrumb = useCallback(
    (index: number) =>
      navigateWithFitView(() => originalNavigateToBreadcrumb(index)),
    [navigateWithFitView, originalNavigateToBreadcrumb]
  );
```

Update the `useHierarchyNavigation` destructure (remove `breadcrumbPath`, `navigateToBreadcrumb: originalNavigateToBreadcrumb`, `currentParentNode`):

```ts
  const {
    filteredNodes,
    filteredEdges: hierarchyFilteredEdges,
    canNavigateUp,
    navigateUp: originalNavigateUp,
    navigateToRoot: originalNavigateToRoot,
    navigateIntoState: originalNavigateIntoState,
    currentParentId,
  } = useHierarchyNavigation({
    allNodes: parsedData.nodes,
    allEdges: parsedData.edges,
  });
```

Remove the now-unused `ChevronRight` import (it was only used inside the deleted block — confirm with a search before deleting):

```
import { ChevronRight } from 'lucide-react';
```

- [ ] **Step 3: Verify nothing else references the removed exports**

Run: `npx tsc --noEmit`
Expected: No errors. (Confirms `breadcrumbPath`, `navigateToBreadcrumb`, `currentParentNode`, and the `ChevronRight` import have no remaining references.)

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No new errors (in particular, no unused-import/unused-variable warnings for anything touched in this task).

- [ ] **Step 5: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx src/hooks/use-hierarchy-navigation.ts
git commit -m "chore(hierarchy-panel): remove dead breadcrumb implementation"
```

---

### Task 5: Toggle button with depth badge in the toolbar

**Files:**
- Modify: `src/components/layout/two-tab-layout.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import React, { useState, useCallback, useEffect } from "react";
import { Code2, Workflow, ChevronRight, Home } from "lucide-react";
import { InlineTipsCarousel } from "./inline-tips-carousel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useHostAPIStore } from "@/stores/host-api-store";
import { useEditorStore } from "@/stores/editor-store";
```

with:

```tsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Code2, Workflow, ChevronRight, Home, Layers } from "lucide-react";
import { InlineTipsCarousel } from "./inline-tips-carousel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useHostAPIStore } from "@/stores/host-api-store";
import { useEditorStore } from "@/stores/editor-store";
import { Panel, Badge } from "@/components/ui/primitives";
import { formatInitialTooltip, HIERARCHY_ROOT_KEY } from "@/lib/utils/hierarchy-initial-info";
```

- [ ] **Step 2: Read `initialChildByParent` and add local open/close state**

Replace:

```tsx
  const { hierarchyState, navigateToRoot, navigateUp } = useEditorStore();
  const currentPath = hierarchyState.currentPath;
  const visiblePath = currentPath.slice(-2);
  const hasHiddenSegments = currentPath.length > 2;
```

with:

```tsx
  const { hierarchyState, navigateToRoot, navigateUp, initialChildByParent } = useEditorStore();
  const currentPath = hierarchyState.currentPath;
  const visiblePath = currentPath.slice(-2);
  const hasHiddenSegments = currentPath.length > 2;

  const [isHierarchyPanelOpen, setIsHierarchyPanelOpen] = useState(false);
  const hierarchyPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHierarchyPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (hierarchyPanelRef.current && !hierarchyPanelRef.current.contains(e.target as Node)) {
        setIsHierarchyPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHierarchyPanelOpen]);
```

- [ ] **Step 3: Manually verify the file still compiles with unused vars**

Run: `npx tsc --noEmit`
Expected: No errors (`isHierarchyPanelOpen`/`hierarchyPanelRef`/`initialChildByParent` are unused until Task 6, but `let`/`const` declarations alone don't trigger TS errors — only lint's no-unused-vars might flag them transiently; that's resolved by Task 6 in the same PR, so skip lint here and run it at the end of Task 6 instead).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/two-tab-layout.tsx
git commit -m "feat(hierarchy-panel): add local open state for toolbar path panel"
```

---

### Task 6: Render the toggle button and dropdown panel

**Files:**
- Modify: `src/components/layout/two-tab-layout.tsx`

- [ ] **Step 1: Insert the toggle button + dropdown after the existing breadcrumb**

In the breadcrumb block, replace:

```tsx
              {visiblePath.map((segment, i) => {
                const isLast = i === visiblePath.length - 1;
                const stepsUp = visiblePath.length - 1 - i;
                return (
                  <React.Fragment key={i}>
                    <ChevronRight className='h-3.5 w-3.5 text-dimmed' />
                    {isLast ? (
                      <span className='text-default font-medium'>{segment}</span>
                    ) : (
                      <button
                        onClick={() => { for (let j = 0; j < stepsUp; j++) navigateUp(); }}
                        className='px-1 text-muted hover:text-default transition-colors'
                        title={`Navigate to ${segment}`}
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}
```

with:

```tsx
              {visiblePath.map((segment, i) => {
                const isLast = i === visiblePath.length - 1;
                const stepsUp = visiblePath.length - 1 - i;
                return (
                  <React.Fragment key={i}>
                    <ChevronRight className='h-3.5 w-3.5 text-dimmed' />
                    {isLast ? (
                      <span className='text-default font-medium'>{segment}</span>
                    ) : (
                      <button
                        onClick={() => { for (let j = 0; j < stepsUp; j++) navigateUp(); }}
                        className='px-1 text-muted hover:text-default transition-colors'
                        title={`Navigate to ${segment}`}
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className='relative' ref={hierarchyPanelRef}>
              <button
                onClick={() => setIsHierarchyPanelOpen((v) => !v)}
                className='flex items-center gap-1 p-0.5 text-dimmed hover:text-default transition-colors'
                title='Show full state path'
              >
                <Layers className='h-3.5 w-3.5' />
                <Badge>{currentPath.length + 1}</Badge>
              </button>
              {isHierarchyPanelOpen && (
                <div className='absolute left-0 top-full mt-1 z-30'>
                  <Panel
                    title='State Path'
                    onClose={() => setIsHierarchyPanelOpen(false)}
                    widthClass='w-64'
                    className='max-h-[60vh]'
                  >
                    <ul className='py-1'>
                      <li>
                        <button
                          onClick={() => { navigateToRoot(); setIsHierarchyPanelOpen(false); }}
                          className='w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-default hover:bg-muted transition-colors'
                          title={formatInitialTooltip(initialChildByParent.get(HIERARCHY_ROOT_KEY))}
                        >
                          <Home className='h-3.5 w-3.5' />
                          Home
                        </button>
                      </li>
                      {currentPath.map((segment, i) => {
                        const isLast = i === currentPath.length - 1;
                        const stepsUp = currentPath.length - 1 - i;
                        const tooltip = formatInitialTooltip(initialChildByParent.get(segment));
                        return (
                          <li key={i}>
                            {isLast ? (
                              <span
                                className='block px-3 py-1.5 pl-7 text-sm font-medium text-default'
                                title={tooltip}
                              >
                                {segment}
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  for (let j = 0; j < stepsUp; j++) navigateUp();
                                  setIsHierarchyPanelOpen(false);
                                }}
                                className='w-full text-left px-3 py-1.5 pl-7 text-sm text-muted hover:text-default hover:bg-muted transition-colors'
                                title={tooltip}
                              >
                                {segment}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                </div>
              )}
            </div>
          </>
        )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No new errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/two-tab-layout.tsx
git commit -m "feat(hierarchy-panel): render full-path dropdown with initial-state tooltips"
```

---

### Task 7: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`

- [ ] **Step 2: Load a deep hierarchy and open the panel**

- Load `xml/test-state-machine.scxml` (or any SCXML file with 3+ nested levels) via Upload.
- Switch to the Visual tab, double-click into a nested compound state at least 2 levels deep (so `currentPath.length >= 2` and the breadcrumb truncates to `… >`).
- Confirm the depth badge next to the breadcrumb shows the correct count (levels below root, plus 1 for root).
- Click the badge button — confirm the dropdown opens showing Home plus every ancestor level, including ones the truncated breadcrumb was hiding.
- Click a middle row — confirm the diagram navigates to that exact level and the dropdown closes.
- Click the badge button again, then click outside the dropdown — confirm it closes both ways.

- [ ] **Step 3: Verify tooltips**

- Hover over a row whose state has a child (or children) marked Initial — confirm the native tooltip shows the initial state name(s) and any entry actions, matching what's actually configured for that state in the diagram/XML.
- Hover over the Home row — confirm it shows the document root's initial state(s), if any are marked.
- Hover over a row for a state with no children (or none marked Initial) — confirm no tooltip appears (native `title` simply doesn't fire).

- [ ] **Step 4: Verify tab independence**

- With the panel open, switch to the Code tab — confirm the toggle button and badge are still visible and functional (row list still works; tooltips may be blank only if the Visual tab was never opened this session, per the documented limitation).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including the new `hierarchy-initial-info.test.ts`.
