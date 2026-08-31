# Parallel State Region View (Option A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render SCXML `<parallel>` states as side-by-side region columns (Option A from the parallel-state mockups) when the user drills into one, instead of today's flat, region-blind child list — and let users add new regions and new states within a region.

**Architecture:** A parallel state's regions (its direct `<state>`/`<parallel>` children) are auto-expanded one extra level: `useHierarchyNavigation` detects that the current container is a `<parallel>` and, instead of showing the regions themselves as boxes, shows each region's own children, tagged with which region they came from and offset into that region's column by a new pure layout module (`region-layout.ts`). A new overlay component draws the dashed column dividers, region tags, and "Add Region" / "Add state to region" controls in flow-space (synced to pan/zoom via `useViewport`) so it doesn't interfere with ReactFlow's existing node-array-driven selection/drag/copy machinery. Two long-standing data-model bugs are fixed first because the new feature depends on them: `findStateById` currently can't find `<parallel>` elements at all, and two `visual-diagram.tsx` call sites unconditionally set `@_initial` on whatever parent they find, which is invalid on a `<parallel>`.

**Tech Stack:** React + TypeScript, ReactFlow (`reactflow` package) for the canvas, Zustand for `useEditorStore`, Vitest + `@testing-library/react` for tests, ELK is NOT used here (new nodes get simple deterministic positions, matching the existing `handleAddRootState` convention — no auto-layout pass).

**Explicitly out of scope for this plan** (call these out if asked, don't build them here):
- The "container-level transition banner" from the Option A mockup (e.g. showing `NoFuel` in a special banner while drilled into `Engines`). A `<parallel>`'s own direct `<transition>` elements already render as normal edges at the *parent* level, where the parallel node itself is a visible box — exactly like any compound state's own transitions today. That's unchanged/already-working; a dedicated in-region reminder banner is a polish item for later.
- Options B and C from the mockups (not selected).
- A `simple`/`compound` ⇄ `parallel` state-type conversion command/UI. `ChangeStateTypeCommand` already has a stubbed, unwired branch for this, but there is currently no UI control anywhere that calls `onStateTypeChange('parallel')` (verified: `scxml-state-node.tsx` destructures `onStateTypeChange` but never invokes it). Wiring up a type-switcher UI is a separate, unrelated feature. Until then, users create a `<parallel>` by hand-editing XML (as `xml/airplane.xml` already does) and this plan's "+ Add Region" control lets them grow it from there.
- Deep/shallow `<history>` interaction with parallel regions, and any parallel-specific runtime/execution semantics (this editor is visual/design-time only per `docs/parallel-states-requirement.md` Phase 4).
- Cross-region transition validation — **already covered**: `validateCrossHierarchyTransitions` (`src/lib/validators/transition-validator.ts:215-303`) already rejects any transition whose source and target don't share the same immediate parent, which already catches a transition jumping from one region to a sibling region (they have different parents — the two region ids). Confirmed by `src/lib/utils/initial-group-utils.ts:6` referencing this existing behavior. No new rule needed.

---

## File Structure

**New files:**
- `src/lib/layout/region-layout.ts` — pure function computing each region's column x-offset and each node's position within it.
- `src/lib/layout/region-layout.test.ts`
- `src/components/diagram/parallel/parallel-region-overlay.tsx` — the one overlay component that draws dividers, region tags, "Add Region", and "Add state to region" in flow-space.
- `src/hooks/use-hierarchy-navigation.test.ts`

**Modified files:**
- `src/lib/utils/scxml-manipulation-utils.ts` — `findStateById` now also searches `.parallel`.
- `src/lib/utils/scxml-manipulation-utils.test.ts` — new tests for the above.
- `src/lib/validators/state-validator.ts` — new `validateParallelRegions` export.
- `src/lib/validators/state-validator.test.ts` — new tests.
- `src/lib/validators/scxml-validator.ts` — wire in `validateParallelRegions`.
- `src/hooks/use-hierarchy-navigation.ts` — region-mode grouping + column positioning.
- `src/components/diagram/nodes/scxml-state-node.tsx` — add `regionId?`/`regionLabel?`/`regionIndex?` to `SCXMLStateNodeData` (type only; nothing new rendered inside the node itself).
- `src/components/diagram/visual-diagram.tsx` — consume the hook's new region output; fix the two `@_initial`-on-parallel-parent bugs; extend `handleAddRootState` for region-column placement and a region-scoped "add state" variant; render `ParallelRegionOverlay`; dynamic toolbar tooltip.

---

## Task 1: `findStateById` can find `<parallel>` elements

**Files:**
- Modify: `src/lib/utils/scxml-manipulation-utils.ts:14-40`
- Test: `src/lib/utils/scxml-manipulation-utils.test.ts`

Today `findStateById` only walks `scxmlDoc.scxml.state` / `state.state`, so it silently returns `null` for a `<parallel>` element's own id, and for anything reached only through a `.parallel` chain. That breaks `addStateToDocument`, `isDescendantOf`, `removeTransitionByEdgeId`, and every `visual-diagram.tsx` call site (add state, copy/paste, drag-reparent) whenever the target parent/source is a `<parallel>` or something nested inside one.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/utils/scxml-manipulation-utils.test.ts` (new `describe` block, alongside the existing ones):

```ts
import { findStateById } from './scxml-manipulation-utils';

describe('findStateById', () => {
  it('finds a <parallel> element by its own id', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'Airplane',
            '@_initial': 'Engines',
            parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }, { '@_id': 'Right' }] }],
          },
        ],
      } as any,
    };
    const found = findStateById(d, 'Engines');
    expect(found?.['@_id']).toBe('Engines');
  });

  it('finds a region (<state> nested inside a <parallel>) by id', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'Airplane',
            '@_initial': 'Engines',
            parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }, { '@_id': 'Right' }] }],
          },
        ],
      } as any,
    };
    const found = findStateById(d, 'Left');
    expect(found?.['@_id']).toBe('Left');
  });

  it('finds a state nested inside a region two levels deep', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'Airplane',
            parallel: [
              {
                '@_id': 'Engines',
                state: [{ '@_id': 'Left', '@_initial': 'LeftOff', state: [{ '@_id': 'LeftOff' }, { '@_id': 'LeftOn' }] }],
              },
            ],
          },
        ],
      } as any,
    };
    const found = findStateById(d, 'LeftOn');
    expect(found?.['@_id']).toBe('LeftOn');
  });

  it('finds a root-level <parallel> (no enclosing <state>)', () => {
    const d: SCXMLDocument = {
      scxml: { parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }] }] } as any,
    };
    expect(findStateById(d, 'Engines')?.['@_id']).toBe('Engines');
    expect(findStateById(d, 'Left')?.['@_id']).toBe('Left');
  });

  it('still returns null for an id that does not exist', () => {
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }] } as any };
    expect(findStateById(d, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts -t findStateById`
Expected: FAIL — all 4 positive assertions get `null`/`undefined` instead of the expected id.

- [ ] **Step 3: Implement the fix**

Replace `findStateById` in `src/lib/utils/scxml-manipulation-utils.ts:14-40`:

```ts
/**
 * Find a state element by its ID in the SCXML document. Searches both
 * <state> and <parallel> subtrees (a <parallel>'s regions are <state>/
 * <parallel> elements, and the parallel itself is a valid search target —
 * e.g. addStateToDocument needs to find it to add a new region).
 */
export function findStateById(
  scxmlDoc: SCXMLDocument,
  stateId: string
): StateElement | ParallelElement | null {
  function searchInStates(
    states: StateElement | StateElement[] | undefined
  ): StateElement | ParallelElement | null {
    if (!states) return null;
    const stateArray = Array.isArray(states) ? states : [states];

    for (const state of stateArray) {
      if (state['@_id'] === stateId) return state;

      const foundInChildStates = searchInStates(state.state);
      if (foundInChildStates) return foundInChildStates;

      const foundInChildParallels = searchInParallels(state.parallel);
      if (foundInChildParallels) return foundInChildParallels;
    }

    return null;
  }

  function searchInParallels(
    parallels: ParallelElement | ParallelElement[] | undefined
  ): StateElement | ParallelElement | null {
    if (!parallels) return null;
    const parallelArray = Array.isArray(parallels) ? parallels : [parallels];

    for (const parallel of parallelArray) {
      if (parallel['@_id'] === stateId) return parallel;

      const foundInRegionStates = searchInStates(parallel.state);
      if (foundInRegionStates) return foundInRegionStates;

      const foundInNestedParallels = searchInParallels(parallel.parallel);
      if (foundInNestedParallels) return foundInNestedParallels;
    }

    return null;
  }

  return searchInStates(scxmlDoc.scxml.state) ?? searchInParallels(scxmlDoc.scxml.parallel);
}
```

Note the return type widened from `StateElement | null` to `StateElement | ParallelElement | null`. This is deliberate, not incidental: it will surface (as TypeScript errors) every call site that writes a `StateElement`-only field (like `'@_initial'`) onto whatever `findStateById` returns without checking first — which is exactly the bug Task 5 fixes. Leave those errors for Task 5; this task only touches `scxml-manipulation-utils.ts`, whose own internal callers (`addStateToDocument`, `isDescendantOf`, `removeTransitionByEdgeId`) only touch `.state`/`.transition`, which both `StateElement` and `ParallelElement` have, so they compile unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts -t findStateById`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Confirm the rest of the suite still compiles/passes**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: PASS (all existing tests unaffected)

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/scxml-manipulation-utils.ts src/lib/utils/scxml-manipulation-utils.test.ts
git commit -m "fix(scxml): findStateById now finds <parallel> elements and their regions"
```

---

## Task 2: Validate parallel regions

**Files:**
- Modify: `src/lib/validators/state-validator.ts`
- Modify: `src/lib/validators/scxml-validator.ts:17,276`
- Test: `src/lib/validators/state-validator.test.ts`

`validateCompoundStates` (`state-validator.ts:442-472`) only walks `scxml.state` / `state.state` — it never visits `.parallel` at all, so a region's own "must have an initial state" requirement goes completely unchecked, and there's no warning when a `<parallel>` has fewer than 2 regions (which defeats the point of using `<parallel>`).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/validators/state-validator.test.ts` (create the file if it doesn't exist yet, following the plain-object-literal-with-`as any` style used in `scxml-manipulation-utils.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateParallelRegions } from './state-validator';

describe('validateParallelRegions', () => {
  it('flags a region with children but no initial attribute/element', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Airplane',
          '@_initial': 'Engines',
          parallel: [
            {
              '@_id': 'Engines',
              state: [
                { '@_id': 'Left', state: [{ '@_id': 'LeftOff' }, { '@_id': 'LeftOn' }] }, // no @_initial
                { '@_id': 'Right', '@_initial': 'RightOff', state: [{ '@_id': 'RightOff' }, { '@_id': 'RightOn' }] },
              ],
            },
          ],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Compound state 'Left'"))).toBe(true);
    expect(messages.some((m) => m.includes("Compound state 'Right'"))).toBe(false);
  });

  it('warns when a parallel state has fewer than 2 regions', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Airplane',
          '@_initial': 'Engines',
          parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }] }],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    expect(
      errors.some((e) => e.severity === 'warning' && e.message.includes("'Engines'") && e.message.includes('at least 2 regions'))
    ).toBe(true);
  });

  it('does not warn when a parallel state has 2+ regions', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Airplane',
          '@_initial': 'Engines',
          parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }, { '@_id': 'Right' }] }],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    expect(errors.some((e) => e.message.includes('at least 2 regions'))).toBe(false);
  });

  it('validates regions of a root-level parallel (no enclosing <state>)', () => {
    const scxml: SCXMLElement = {
      parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }, { '@_id': 'Right' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    expect(errors.some((e) => e.message.includes('at least 2 regions'))).toBe(false);
  });

  it('recurses into a parallel nested inside a region (parallel-in-parallel)', () => {
    const scxml: SCXMLElement = {
      parallel: [
        {
          '@_id': 'Outer',
          state: [{ '@_id': 'A' }],
          parallel: [{ '@_id': 'Inner', state: [{ '@_id': 'X', state: [{ '@_id': 'X1' }] }] }],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    // Outer has 2 regions (A, Inner) so no region-count warning for Outer;
    // Inner has only 1 region (X) so it should warn; X has children but no initial so it should error.
    expect(errors.some((e) => e.message.includes("'Outer'") && e.message.includes('at least 2 regions'))).toBe(false);
    expect(errors.some((e) => e.message.includes("'Inner'") && e.message.includes('at least 2 regions'))).toBe(true);
    expect(errors.some((e) => e.message.includes("Compound state 'X'"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/validators/state-validator.test.ts -t validateParallelRegions`
Expected: FAIL with "validateParallelRegions is not a function" (or a type/import error)

- [ ] **Step 3: Implement `validateParallelRegions`**

Add to `src/lib/validators/state-validator.ts` (after `validateCompoundStates`, ~line 472):

```ts
/**
 * Validate <parallel> elements: each region (a direct <state>/<parallel>
 * child of the parallel) that has its own children must declare an initial
 * state, exactly like an ordinary compound state — validateCompoundStates
 * above never visits .parallel subtrees at all, so this is the only place
 * that requirement is checked for anything reached through a <parallel>.
 * Also warns when a parallel has fewer than 2 regions, since a single-region
 * "parallel" state has no concurrency to speak of.
 */
export function validateParallelRegions(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  const validateCompoundStateRecursive = (state: StateElement) => {
    const hasChildren =
      state.state || state.parallel || state.final || state.history;

    if (hasChildren && !state['@_initial'] && !state.initial) {
      errors.push({
        message: `Compound state '${state['@_id']}' must have either an 'initial' attribute or an <initial> child element`,
        severity: 'error',
        stateId: state['@_id'],
      });
    }

    if (state.state) {
      const nested = Array.isArray(state.state) ? state.state : [state.state];
      nested.forEach((s) => validateCompoundStateRecursive(s));
    }
    if (state.parallel) {
      const nested = Array.isArray(state.parallel) ? state.parallel : [state.parallel];
      nested.forEach((p) => validateRegionsOf(p));
    }
  };

  const validateRegionsOf = (parallel: ParallelElement) => {
    const stateRegions = parallel.state
      ? Array.isArray(parallel.state) ? parallel.state : [parallel.state]
      : [];
    const parallelRegions = parallel.parallel
      ? Array.isArray(parallel.parallel) ? parallel.parallel : [parallel.parallel]
      : [];
    const regionCount = stateRegions.length + parallelRegions.length;

    if (regionCount < 2) {
      errors.push({
        message: `Parallel state '${parallel['@_id']}' has ${regionCount} region${regionCount === 1 ? '' : 's'}; a parallel state needs at least 2 regions to run anything concurrently.`,
        severity: 'warning',
        stateId: parallel['@_id'],
      });
    }

    stateRegions.forEach((region) => validateCompoundStateRecursive(region));
    parallelRegions.forEach((nested) => validateRegionsOf(nested));
  };

  const walk = (element: SCXMLElement | StateElement) => {
    if (element.parallel) {
      const parallels = Array.isArray(element.parallel) ? element.parallel : [element.parallel];
      parallels.forEach((p) => validateRegionsOf(p));
    }
    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((s) => walk(s));
    }
  };

  walk(scxml);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validators/state-validator.test.ts -t validateParallelRegions`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Wire it into the main validator**

In `src/lib/validators/scxml-validator.ts`, add `validateParallelRegions` to the import at line 17 (alongside `validateCompoundStates`), then call it right after `validateCompoundStates(scxml, errors);` at line 276:

```ts
    // Validate compound state requirements
    validateCompoundStates(scxml, errors);
    validateParallelRegions(scxml, errors);
```

- [ ] **Step 6: Run the full validator suite**

Run: `npx vitest run src/lib/validators`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/validators/state-validator.ts src/lib/validators/state-validator.test.ts src/lib/validators/scxml-validator.ts
git commit -m "feat(validation): check initial-state and region-count requirements inside <parallel>"
```

---

## Task 3: Region column layout (pure function)

**Files:**
- Create: `src/lib/layout/region-layout.ts`
- Create: `src/lib/layout/region-layout.test.ts`

A pure, framework-free function that takes an ordered list of regions and, per region, the nodes that belong to it (each carrying its existing position, which is already relative to that region since it was converted as if the region were a normal compound-state parent), and returns each node's new absolute position once regions are laid out side by side as columns, plus the column boundaries the overlay needs to draw dividers/tags/buttons.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/layout/region-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeParallelRegionColumns,
  REGION_COLUMN_WIDTH,
  REGION_COLUMN_GAP,
  REGION_COLUMN_TOP_MARGIN,
  type RegionLayoutNode,
} from './region-layout';

describe('computeParallelRegionColumns', () => {
  it('places a single region at x=0', () => {
    const regions = [{ id: 'Left', label: 'Left' }];
    const nodes = new Map<string, RegionLayoutNode[]>([
      ['Left', [{ id: 'LeftOff', regionId: 'Left', width: 190, height: 80, relativeX: 20, relativeY: 30 }]],
    ]);
    const result = computeParallelRegionColumns(regions, nodes);
    expect(result.columns[0].x).toBe(0);
    expect(result.positions.get('LeftOff')).toEqual({ x: 20, y: REGION_COLUMN_TOP_MARGIN + 30 });
  });

  it('offsets a second region by the first region\'s column width plus the gap', () => {
    const regions = [
      { id: 'Left', label: 'Left' },
      { id: 'Right', label: 'Right' },
    ];
    const nodes = new Map<string, RegionLayoutNode[]>([
      ['Left', [{ id: 'LeftOff', regionId: 'Left', width: 190, height: 80, relativeX: 0, relativeY: 0 }]],
      ['Right', [{ id: 'RightOff', regionId: 'Right', width: 190, height: 80, relativeX: 0, relativeY: 0 }]],
    ]);
    const result = computeParallelRegionColumns(regions, nodes);
    const leftColumn = result.columns.find((c) => c.regionId === 'Left')!;
    const rightColumn = result.columns.find((c) => c.regionId === 'Right')!;
    expect(rightColumn.x).toBe(leftColumn.x + leftColumn.width + REGION_COLUMN_GAP);
    expect(result.positions.get('RightOff')!.x).toBe(rightColumn.x);
  });

  it('widens a column past the default width when a node needs more room', () => {
    const regions = [{ id: 'Left', label: 'Left' }];
    const nodes = new Map<string, RegionLayoutNode[]>([
      ['Left', [{ id: 'Wide', regionId: 'Left', width: 400, height: 80, relativeX: 0, relativeY: 0 }]],
    ]);
    const result = computeParallelRegionColumns(regions, nodes);
    expect(result.columns[0].width).toBeGreaterThan(REGION_COLUMN_WIDTH);
    expect(result.columns[0].width).toBeGreaterThanOrEqual(400 + 40);
  });

  it('uses the default column width for an empty region', () => {
    const regions = [{ id: 'Empty', label: 'Empty' }];
    const nodes = new Map<string, RegionLayoutNode[]>();
    const result = computeParallelRegionColumns(regions, nodes);
    expect(result.columns[0].width).toBe(REGION_COLUMN_WIDTH);
    expect(result.positions.size).toBe(0);
  });

  it('reports contentBottom as the lowest node bottom edge across all regions', () => {
    const regions = [
      { id: 'Left', label: 'Left' },
      { id: 'Right', label: 'Right' },
    ];
    const nodes = new Map<string, RegionLayoutNode[]>([
      ['Left', [{ id: 'A', regionId: 'Left', width: 190, height: 80, relativeX: 0, relativeY: 0 }]],
      ['Right', [{ id: 'B', regionId: 'Right', width: 190, height: 80, relativeX: 0, relativeY: 300 }]],
    ]);
    const result = computeParallelRegionColumns(regions, nodes);
    expect(result.contentBottom).toBe(REGION_COLUMN_TOP_MARGIN + 300 + 80);
  });

  it('stacks nodes with no stored position vertically as a fallback', () => {
    const regions = [{ id: 'Left', label: 'Left' }];
    const nodes = new Map<string, RegionLayoutNode[]>([
      [
        'Left',
        [
          { id: 'A', regionId: 'Left', width: 190, height: 80 },
          { id: 'B', regionId: 'Left', width: 190, height: 80 },
        ],
      ],
    ]);
    const result = computeParallelRegionColumns(regions, nodes);
    const a = result.positions.get('A')!;
    const b = result.positions.get('B')!;
    expect(b.y).toBeGreaterThan(a.y);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/layout/region-layout.test.ts`
Expected: FAIL — module `./region-layout` does not exist.

- [ ] **Step 3: Implement `region-layout.ts`**

Create `src/lib/layout/region-layout.ts`:

```ts
/**
 * Positions a <parallel> state's regions as side-by-side columns.
 *
 * Each region's own children already carry a position relative to that
 * region (they were converted from XML exactly as if the region were an
 * ordinary compound-state parent, positioned from viz:xywh). This module
 * doesn't re-lay-out anything within a region — it just picks an x-offset
 * per region (based on the widest content in every region before it) and
 * adds that offset to each of the region's children's existing relative
 * position, so regions read left-to-right without their nodes overlapping.
 */

export const REGION_COLUMN_WIDTH = 260;
export const REGION_COLUMN_GAP = 60;
export const REGION_COLUMN_TOP_MARGIN = 90;
export const REGION_COLUMN_PADDING = 40;
export const REGION_FALLBACK_ROW_HEIGHT = 140;

export interface RegionColumnLayout {
  regionId: string;
  regionLabel: string;
  index: number;
  x: number;
  width: number;
}

export interface RegionLayoutNode {
  id: string;
  regionId: string;
  width: number;
  height: number;
  /** Position relative to the region's own origin, if already known (from viz:xywh). */
  relativeX?: number;
  relativeY?: number;
}

export interface RegionLayoutResult {
  columns: RegionColumnLayout[];
  positions: Map<string, { x: number; y: number }>;
  totalWidth: number;
  /** Lowest (y + height) across every positioned node, for sizing dividers/add-buttons. */
  contentBottom: number;
}

export function computeParallelRegionColumns(
  regions: { id: string; label: string }[],
  nodesByRegion: Map<string, RegionLayoutNode[]>
): RegionLayoutResult {
  const columns: RegionColumnLayout[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  let cursorX = 0;
  let contentBottom = REGION_COLUMN_TOP_MARGIN;

  regions.forEach((region, index) => {
    const regionNodes = nodesByRegion.get(region.id) ?? [];

    const contentWidth = regionNodes.reduce((max, node) => {
      const right = (node.relativeX ?? 0) + node.width;
      return Math.max(max, right);
    }, 0);
    const columnWidth = Math.max(REGION_COLUMN_WIDTH, contentWidth + REGION_COLUMN_PADDING);

    regionNodes.forEach((node, nodeIndex) => {
      const x =
        node.relativeX !== undefined
          ? cursorX + node.relativeX
          : cursorX + (columnWidth - node.width) / 2;
      const y =
        node.relativeY !== undefined
          ? REGION_COLUMN_TOP_MARGIN + node.relativeY
          : REGION_COLUMN_TOP_MARGIN + nodeIndex * REGION_FALLBACK_ROW_HEIGHT;

      positions.set(node.id, { x, y });
      contentBottom = Math.max(contentBottom, y + node.height);
    });

    columns.push({
      regionId: region.id,
      regionLabel: region.label,
      index,
      x: cursorX,
      width: columnWidth,
    });

    cursorX += columnWidth + REGION_COLUMN_GAP;
  });

  return {
    columns,
    positions,
    totalWidth: Math.max(0, cursorX - REGION_COLUMN_GAP),
    contentBottom,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/layout/region-layout.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/region-layout.ts src/lib/layout/region-layout.test.ts
git commit -m "feat(layout): pure column-layout function for parallel state regions"
```

---

## Task 4: Region-aware hierarchy navigation

**Files:**
- Modify: `src/components/diagram/nodes/scxml-state-node.tsx:35-66`
- Modify: `src/hooks/use-hierarchy-navigation.ts`
- Create: `src/hooks/use-hierarchy-navigation.test.ts`

Today, drilling into any state (compound or parallel) shows only its *direct* children. For a `<parallel>`, the direct children are the regions themselves (e.g. `Left`, `Right`) — today those would render as two plain boxes, and you'd need a second click into each to see `LeftOff`/`LeftOn`. Option A auto-expands that one extra level: drilling into `Engines` immediately shows `LeftOff`/`LeftOn`/`RightOff`/`RightOn`, each tagged with which region it came from and repositioned into that region's column via Task 3's layout function.

- [ ] **Step 1: Add region fields to the node data type**

In `src/components/diagram/nodes/scxml-state-node.tsx`, add to `SCXMLStateNodeData` (after `isDropTarget?: boolean;`, ~line 65):

```ts
  // Parallel-region grouping (set only when this node's parent, one level
  // up, is a <parallel> region — see useHierarchyNavigation's region mode)
  regionId?: string;
  regionLabel?: string;
  regionIndex?: number;
```

- [ ] **Step 2: Write the failing tests**

Create `src/hooks/use-hierarchy-navigation.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Node, Edge } from 'reactflow';
import { useHierarchyNavigation } from './use-hierarchy-navigation';
import { useEditorStore } from '@/stores/editor-store';

function stateNode(id: string, parentId: string | undefined, stateType = 'simple', position = { x: 0, y: 0 }): Node {
  return {
    id,
    type: 'scxmlState',
    parentId,
    position,
    width: 190,
    height: 80,
    data: { label: id, stateType },
  } as Node;
}

// Airplane -> Engines (parallel) -> Left/Right (regions) -> LeftOff/LeftOn, RightOff/RightOn
const AIRPLANE_NODES: Node[] = [
  stateNode('Airplane', undefined, 'compound'),
  stateNode('Engines', 'Airplane', 'parallel'),
  stateNode('Left', 'Engines', 'compound'),
  stateNode('Right', 'Engines', 'compound'),
  stateNode('LeftOff', 'Left', 'simple', { x: 20, y: 10 }),
  stateNode('LeftOn', 'Left', 'simple', { x: 20, y: 200 }),
  stateNode('RightOff', 'Right', 'simple', { x: 20, y: 10 }),
  stateNode('RightOn', 'Right', 'simple', { x: 20, y: 200 }),
];
const AIRPLANE_EDGES: Edge[] = [];

beforeEach(() => {
  act(() => {
    useEditorStore.getState().reset();
  });
});

describe('useHierarchyNavigation — parallel region mode', () => {
  it('is not in region mode outside a parallel', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    expect(result.current.isParallelRegionMode).toBe(false);
    expect(result.current.regions).toEqual([]);
  });

  it('shows the parallel\'s regions\' children (not the regions themselves) once drilled into the parallel', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    expect(result.current.isParallelRegionMode).toBe(true);
    const ids = result.current.filteredNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['LeftOff', 'LeftOn', 'RightOff', 'RightOn']);
  });

  it('exposes the regions in document order with labels', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));
    expect(result.current.regions).toEqual([
      { id: 'Left', label: 'Left' },
      { id: 'Right', label: 'Right' },
    ]);
  });

  it('tags each visible node with its region id, label and index', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    const leftOff = result.current.filteredNodes.find((n) => n.id === 'LeftOff')!;
    expect(leftOff.data.regionId).toBe('Left');
    expect(leftOff.data.regionLabel).toBe('Left');
    expect(leftOff.data.regionIndex).toBe(0);

    const rightOn = result.current.filteredNodes.find((n) => n.id === 'RightOn')!;
    expect(rightOn.data.regionId).toBe('Right');
    expect(rightOn.data.regionIndex).toBe(1);
  });

  it('positions the second region\'s nodes to the right of the first region\'s column', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    const leftOff = result.current.filteredNodes.find((n) => n.id === 'LeftOff')!;
    const rightOff = result.current.filteredNodes.find((n) => n.id === 'RightOff')!;
    expect(rightOff.position.x).toBeGreaterThan(leftOff.position.x + 190);
  });

  it('exposes regionColumns matching the region count, in order', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    expect(result.current.regionColumns).toHaveLength(2);
    expect(result.current.regionColumns[0].regionId).toBe('Left');
    expect(result.current.regionColumns[1].regionId).toBe('Right');
    expect(result.current.regionColumns[1].x).toBeGreaterThan(result.current.regionColumns[0].x);
  });

  it('falls back to ordinary flat sibling rendering one level further down (inside a region\'s child)', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Left'));

    expect(result.current.isParallelRegionMode).toBe(false);
    const ids = result.current.filteredNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['LeftOff', 'LeftOn']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/use-hierarchy-navigation.test.ts`
Expected: FAIL — `isParallelRegionMode`, `regions`, `regionColumns` are `undefined`; region children aren't shown/tagged/repositioned.

- [ ] **Step 4: Implement the hook**

Replace `src/hooks/use-hierarchy-navigation.ts` in full:

```ts
import { useMemo, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { useEditorStore } from '@/stores/editor-store';
import { isNoteId } from '@/types/visual-metadata';
import {
  computeParallelRegionColumns,
  type RegionColumnLayout,
  type RegionLayoutNode,
} from '@/lib/layout/region-layout';

interface UseHierarchyNavigationProps {
  allNodes: Node[];
  allEdges: Edge[];
}

export interface RegionSummary {
  id: string;
  label: string;
}

export function useHierarchyNavigation({
  allNodes,
  allEdges,
}: UseHierarchyNavigationProps) {
  const {
    hierarchyState,
    navigateIntoState,
    navigateUp,
    navigateToRoot,
    setVisibleNodes,
  } = useEditorStore();

  // Track root node IDs to detect when a new file is loaded
  const rootNodeIds = useMemo(() => {
    return allNodes
      .filter((node) => !node.parentId)
      .map((n) => n.id)
      .sort()
      .join(',');
  }, [allNodes]);

  // Reset navigation when root nodes change (indicates new file loaded)
  useEffect(() => {
    if (rootNodeIds && hierarchyState.currentPath.length > 0) {
      const currentParentExists = allNodes.some(n => n.id === hierarchyState.currentParentId);
      if (!currentParentExists) {
        navigateToRoot();
      }
    }
  }, [rootNodeIds, hierarchyState.currentPath.length, hierarchyState.currentParentId, allNodes, navigateToRoot]);

  // A <parallel>'s direct children are orthogonal regions, not ordinary
  // substates — region mode auto-expands one extra level so every region's
  // own children render side by side, instead of needing a second drill-in
  // click per region.
  const currentParentNode = useMemo(
    () => allNodes.find((n) => n.id === hierarchyState.currentParentId) ?? null,
    [allNodes, hierarchyState.currentParentId]
  );
  const isParallelRegionMode = currentParentNode?.data?.stateType === 'parallel';

  const regions: RegionSummary[] = useMemo(() => {
    if (!isParallelRegionMode || !currentParentNode) return [];
    return allNodes
      .filter((n) => n.parentId === currentParentNode.id && !isNoteId(n.id))
      .map((n) => ({ id: n.id, label: (n.data?.label as string) ?? n.id }));
  }, [allNodes, isParallelRegionMode, currentParentNode]);

  const { filteredNodes, regionColumns, regionContentBottom } = useMemo(() => {
    if (allNodes.length === 0) {
      return { filteredNodes: [] as Node[], regionColumns: [] as RegionColumnLayout[], regionContentBottom: 0 };
    }

    let visibleNodesList: Node[] = [];
    let regionByNodeId: Map<string, { regionId: string; regionLabel: string; regionIndex: number }> | null = null;

    if (isParallelRegionMode && currentParentNode) {
      regionByNodeId = new Map();
      visibleNodesList = regions.flatMap((region, regionIndex) => {
        const children = allNodes.filter(
          (n) => n.parentId === region.id && !isNoteId(n.id)
        );
        children.forEach((child) => {
          regionByNodeId!.set(child.id, { regionId: region.id, regionLabel: region.label, regionIndex });
        });
        return children;
      });
    } else if (!hierarchyState.currentParentId) {
      visibleNodesList = allNodes.filter((node) => !node.parentId);
    } else {
      visibleNodesList = allNodes.filter(
        (node) => node.parentId === hierarchyState.currentParentId
      );
    }

    const withMetadata = visibleNodesList.map((node) => {
      const hasChildren = allNodes.some(
        (n) => n.parentId === node.id && !isNoteId(n.id)
      );
      const regionInfo = regionByNodeId?.get(node.id);

      return {
        ...node,
        // Remove parentId for hierarchy navigation since parent is not rendered
        parentId: undefined,
        data: {
          ...node.data,
          hasChildren,
          isCompound: hasChildren,
          stateType:
            node.data.stateType || (hasChildren ? 'compound' : 'simple'),
          onNavigateInto: () => navigateIntoState(node.id),
          ...(regionInfo && {
            regionId: regionInfo.regionId,
            regionLabel: regionInfo.regionLabel,
            regionIndex: regionInfo.regionIndex,
          }),
        },
        style: {
          ...node.style,
          minWidth: 160,
          minHeight: 80,
        },
      };
    });

    if (!isParallelRegionMode || regions.length === 0) {
      return { filteredNodes: withMetadata, regionColumns: [], regionContentBottom: 0 };
    }

    // Offset each region's nodes into side-by-side columns. Each node's
    // existing position was converted as if its region were a normal
    // compound-state parent, so it's already relative to that region's
    // own origin — computeParallelRegionColumns just adds a per-region
    // x-offset on top of it.
    const nodesByRegion = new Map<string, RegionLayoutNode[]>();
    withMetadata.forEach((node) => {
      const regionId = (node.data as { regionId?: string }).regionId;
      if (!regionId) return;
      const list = nodesByRegion.get(regionId) ?? [];
      list.push({
        id: node.id,
        regionId,
        width: (node.width as number | undefined) ?? 190,
        height: (node.height as number | undefined) ?? 90,
        relativeX: node.position?.x,
        relativeY: node.position?.y,
      });
      nodesByRegion.set(regionId, list);
    });

    const { positions, columns, contentBottom } = computeParallelRegionColumns(regions, nodesByRegion);

    const positioned = withMetadata.map((node) => {
      const pos = positions.get(node.id);
      return pos ? { ...node, position: pos } : node;
    });

    return { filteredNodes: positioned, regionColumns: columns, regionContentBottom: contentBottom };
  }, [allNodes, hierarchyState.currentParentId, navigateIntoState, isParallelRegionMode, currentParentNode, regions]);

  // Update visible nodes in store when filtered nodes change
  useEffect(() => {
    const visibleIds = new Set(filteredNodes.map((n) => n.id));
    setVisibleNodes(visibleIds);
  }, [filteredNodes, setVisibleNodes]);

  // Filter edges to only show connections between visible nodes
  const filteredEdges = useMemo(() => {
    if (filteredNodes.length === 0) return [];

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    return allEdges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [allEdges, filteredNodes]);

  // Check if we can navigate up
  const canNavigateUp = hierarchyState.currentPath.length > 0;

  return {
    filteredNodes,
    filteredEdges,
    canNavigateUp,
    navigateUp,
    navigateToRoot,
    navigateIntoState,
    currentParentId: hierarchyState.currentParentId,
    isParallelRegionMode,
    regions,
    regionColumns,
    regionContentBottom,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/use-hierarchy-navigation.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (the `findStateById`-return-type ripple from Task 1 is fixed separately in Task 5).

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/nodes/scxml-state-node.tsx src/hooks/use-hierarchy-navigation.ts src/hooks/use-hierarchy-navigation.test.ts
git commit -m "feat(diagram): auto-expand parallel regions into tagged, column-positioned nodes"
```

---

## Task 5: Region-aware "Add State" / "Add Region" in `visual-diagram.tsx`

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx:2356-2480` (`handleAddRootState`)
- Modify: `src/components/diagram/visual-diagram.tsx` (`handleReparent`, the `@_initial` assignment near what was line ~2556-2559)
- Modify: `src/components/diagram/visual-diagram.tsx:2257-2268` (hook destructure)

Two existing bugs, both a direct consequence of Task 1's widened `findStateById` return type (which now correctly includes `ParallelElement`, exposing that these call sites were never safe to use on a parallel parent):

1. `handleAddRootState` (~line 2448-2453) unconditionally sets `parentState['@_initial'] = newStateId` when adding a state's first child. A `<parallel>` has no `@_initial` — regions are all active at once, there's no "initial" one. Adding the first *region* to an empty parallel must skip this.
2. `handleReparent` does the same thing when a drag-and-drop reparent target ends up with exactly one child.

Then extend `handleAddRootState` itself: when the parent is a `<parallel>` and no explicit region override is given, place the new state as a new **region** (next column) instead of the next free grid cell; when a `regionParentIdOverride` is passed (from the new per-region "Add State" button), add an ordinary child *into* that specific region.

- [ ] **Step 1: Update the hook destructure**

In `src/components/diagram/visual-diagram.tsx:2257-2268`, add the two new fields:

```ts
  const {
    filteredNodes,
    filteredEdges: hierarchyFilteredEdges,
    canNavigateUp,
    navigateUp: originalNavigateUp,
    navigateToRoot: originalNavigateToRoot,
    navigateIntoState: originalNavigateIntoState,
    currentParentId,
    isParallelRegionMode,
    regions,
    regionColumns,
    regionContentBottom,
  } = useHierarchyNavigation({
    allNodes: parsedData.nodes,
    allEdges: parsedData.edges,
  });
```

- [ ] **Step 2: Add a small helper to know whether an id is a parallel node**

Add the import (alongside the other `@/lib/layout/*` / `@/lib/utils/*` imports at the top of the file):

```ts
import { REGION_COLUMN_WIDTH, REGION_COLUMN_GAP } from '@/lib/layout/region-layout';
```

Then, near the top of the component body (alongside other `React.useCallback`/`useMemo` helpers, before `handleAddRootState`):

```ts
  // Whether `id` refers to a <parallel> element, per the currently-parsed
  // node graph (parsedData.nodes still carries every node with its real
  // parentId/stateType, unlike the hierarchy-nav-filtered `nodes`/`regions`
  // which only cover the current level).
  const isParallelStateId = React.useCallback(
    (id: string | undefined | null) =>
      !!id && parsedData.nodes.find((n) => n.id === id)?.data?.stateType === 'parallel',
    [parsedData.nodes]
  );
```

- [ ] **Step 3: Rewrite `handleAddRootState`**

Replace the whole function body at `src/components/diagram/visual-diagram.tsx:2356-2480`:

```ts
  // ==================== ADD ROOT STATE / ADD REGION HANDLER ====================
  // `regionParentIdOverride`, when given, is a region's own id: the new
  // state is added INSIDE that region (an ordinary child), used by the
  // per-region "Add State" button. Without it, the new state is added
  // under `currentParentId` as usual — which, when currentParentId is a
  // <parallel>, means adding a new REGION (a direct child of the parallel),
  // used by the "Add Region" control.
  const handleAddRootState = React.useCallback((regionParentIdOverride?: string) => {
    if (!onSCXMLChange || !scxmlContent) {
      console.error('Cannot add state: SCXML not available');
      return;
    }

    try {
      let newStateId = 'state_1';
      let counter = 1;
      const existingIds = new Set(parsedData.nodes.map((n) => n.id));
      while (existingIds.has(newStateId)) {
        counter++;
        newStateId = `state_${counter}`;
      }

      const parseResult = parserRef.current?.parse(scxmlContent);
      if (parseResult?.success && parseResult.data) {
        const scxmlDoc = parseResult.data;

        const addingRegionToParallel =
          !regionParentIdOverride && isParallelStateId(currentParentId);
        const parentId: string | undefined =
          regionParentIdOverride ?? currentParentId ?? undefined;

        let x = 100;
        let y = 100;

        if (addingRegionToParallel) {
          // New region: place it as the next column. Uses region-layout.ts's
          // own constants so it lines up with where the hierarchy-nav hook
          // will actually re-lay-out the level on the next render.
          x = 50 + regions.length * (REGION_COLUMN_WIDTH + REGION_COLUMN_GAP);
          y = 100;
        } else if (parentId) {
          const childNodes = nodes.length;

          if (childNodes) {
            const cols = 4;
            const rowHeight = 120;
            const colWidth = 200;

            const existingPositions = nodes.map((n) => ({
              col: Math.floor((n.position?.x || 0) / colWidth),
              row: Math.floor(((n.position?.y || 0) - 100) / rowHeight),
            }));

            let found = false;
            for (let row = 0; row < 10 && !found; row++) {
              for (let col = 0; col < cols && !found; col++) {
                const occupied = existingPositions.some(
                  (p) => p.col === col && p.row === row
                );
                if (!occupied) {
                  x = 50 + col * colWidth;
                  y = 100 + row * rowHeight;
                  found = true;
                }
              }
            }
          } else {
            x = 50;
            y = 100;
          }
        } else {
          const rootNodes = nodes.filter((n) => !n.parentId);
          if (rootNodes.length > 0) {
            const maxX = Math.max(...rootNodes.map((n) => n.position.x));
            x = maxX + 200;
          }
        }

        // Check if this will be the initial state (parent has no children).
        // A <parallel> has no "initial" concept at all — regions are all
        // active simultaneously — so a new region never gets this treatment.
        let isInitial = false;
        if (parentId && !addingRegionToParallel) {
          const parentState = findStateById(scxmlDoc, parentId);
          if (parentState && !parentState.state) {
            isInitial = true;
          }
        }

        const dimensions = nodeDimensionCalculator.calculateDimensions(
          newStateId,
          'simple',
          0,
          0,
          isInitial
        );

        const newState = createStateElement(newStateId);
        (newState as any)[
          '@_viz:xywh'
        ] = `${x},${y},${dimensions.width},${dimensions.height}`;

        if (isInitial && parentId) {
          const parentState = findStateById(scxmlDoc, parentId);
          if (parentState) {
            (parentState as StateElement)['@_initial'] = newStateId;
          }
        }

        addStateToDocument(scxmlDoc, newState, parentId);

        const updatedSCXML = parserRef.current!.serialize(scxmlDoc, true);
        onSCXMLChange(updatedSCXML, 'structure');

        setTimeout(() => {
          fitView({
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            duration: 600,
          });
        }, 200);
      }
    } catch (error) {
      console.error('Failed to add new state:', error);
    }
  }, [
    scxmlContent,
    onSCXMLChange,
    parsedData?.nodes,
    currentParentId,
    nodes,
    fitView,
    isParallelStateId,
    regions,
  ]);
```

Note the `isInitial` guard now reads `if (parentId && !addingRegionToParallel)` — this is the fix for bug #1. `(parentState as StateElement)['@_initial']` is a safe cast here specifically because `addingRegionToParallel` being false is exactly what rules out `parentState` being the `ParallelElement` case reachable from this code path.

- [ ] **Step 4: Fix `handleReparent`'s equivalent bug**

Find the `@_initial` assignment inside `handleReparent` (originally around line 2556-2559 — matches: `if (newParent && !newParent['@_initial'] && newParent.state)`). Replace it with a parallel-aware guard:

```ts
        if (targetParentId) {
          const newParent = findStateById(scxmlDoc, targetParentId);
          if (
            newParent &&
            !isParallelStateId(targetParentId) &&
            !(newParent as StateElement)['@_initial'] &&
            newParent.state
          ) {
            const children = Array.isArray(newParent.state) ? newParent.state : [newParent.state];
            if (children.length === 1) {
              (newParent as StateElement)['@_initial'] = children[0]['@_id'];
            }
          }
        }
```

(Keep the rest of `handleReparent` — the `detachStateFromParent`/`addStateToDocument` calls above it — unchanged; dragging a state onto a parallel node is a legitimate way to turn it into a new region, and `addStateToDocument` already works for a parallel target once Task 1's `findStateById` fix is in place.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the two `as StateElement` casts resolve the `findStateById`-return-type ripple from Task 1 at both remaining call sites).

- [ ] **Step 6: Manual check — old behavior unchanged**

Run the dev server (`npm run dev`), open `xml/parallel-state.xml` in the code editor tab, switch to Visual, and confirm: adding a state at the root level still works exactly as before (grid placement, first child still gets `@_initial`). This task doesn't change any non-parallel path.

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "fix(diagram): stop writing an invalid @_initial onto <parallel> parents; support column placement for new regions"
```

---

## Task 6: `ParallelRegionOverlay` component

**Files:**
- Create: `src/components/diagram/parallel/parallel-region-overlay.tsx`

Draws the dashed column dividers, region name tags, and the "Add Region" / "Add state to region" buttons. Rendered in flow-space (so it pans/zooms with the canvas) by reading ReactFlow's `useViewport()` and applying the same CSS transform to a wrapper div, rather than being real ReactFlow nodes — this keeps every existing node-array-driven feature (multi-select, drag, copy/paste, minimap) working completely untouched, since those all iterate `nodes` expecting real states only.

- [ ] **Step 1: Create the component**

Create `src/components/diagram/parallel/parallel-region-overlay.tsx`:

```tsx
'use client';

import React from 'react';
import { useViewport } from 'reactflow';
import { Plus, Square } from 'lucide-react';
import type { RegionColumnLayout } from '@/lib/layout/region-layout';

interface ParallelRegionOverlayProps {
  columns: RegionColumnLayout[];
  regionStateCounts: Map<string, number>;
  contentBottom: number;
  onAddRegion: () => void;
  onAddStateToRegion: (regionId: string) => void;
}

const TAG_TOP_OFFSET = 46;
const ADD_STATE_GAP = 20;
const ADD_STATE_HEIGHT = 52;
const ADD_REGION_WIDTH = 150;
const ADD_REGION_GAP = 60;

export const ParallelRegionOverlay: React.FC<ParallelRegionOverlayProps> = ({
  columns,
  regionStateCounts,
  contentBottom,
  onAddRegion,
  onAddStateToRegion,
}) => {
  const viewport = useViewport();

  if (columns.length === 0) return null;

  const lastColumn = columns[columns.length - 1];
  const addRegionX = lastColumn.x + lastColumn.width + ADD_REGION_GAP;
  const addStateY = contentBottom + ADD_STATE_GAP;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {columns.map((column, i) => {
          const stateCount = regionStateCounts.get(column.regionId) ?? 0;
          return (
            <React.Fragment key={column.regionId}>
              {i > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: column.x - ADD_REGION_GAP / 2,
                    top: -TAG_TOP_OFFSET,
                    height: addStateY - -TAG_TOP_OFFSET + ADD_STATE_HEIGHT,
                    width: 0,
                    borderLeft: '2px dashed #94a3b8',
                  }}
                />
              )}

              <div style={{ position: 'absolute', left: column.x, top: -TAG_TOP_OFFSET }} className='flex flex-col gap-1'>
                <span className='inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300 bg-muted px-2 py-0.5 rounded-md w-fit'>
                  <Square className='h-2.5 w-2.5' />
                  {column.regionLabel}
                </span>
                <span className='text-[10.5px] text-dimmed pl-0.5'>
                  region &middot; {stateCount} {stateCount === 1 ? 'state' : 'states'}
                </span>
              </div>

              <button
                onClick={() => onAddStateToRegion(column.regionId)}
                title={`Add state to ${column.regionLabel}`}
                aria-label={`Add state to ${column.regionLabel}`}
                style={{
                  position: 'absolute',
                  left: column.x,
                  top: addStateY,
                  width: column.width,
                  height: ADD_STATE_HEIGHT,
                  pointerEvents: 'auto',
                }}
                className='flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default text-dimmed hover:text-muted hover:border-muted transition-colors bg-transparent'
              >
                <Plus className='h-4 w-4' />
                <span className='text-xs font-bold'>Add State</span>
              </button>
            </React.Fragment>
          );
        })}

        <button
          onClick={onAddRegion}
          title='Add Region'
          aria-label='Add Region'
          style={{
            position: 'absolute',
            left: addRegionX,
            top: -TAG_TOP_OFFSET,
            width: ADD_REGION_WIDTH,
            height: addStateY - -TAG_TOP_OFFSET + ADD_STATE_HEIGHT,
            pointerEvents: 'auto',
          }}
          className='flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default text-dimmed hover:text-muted hover:border-muted transition-colors bg-transparent'
        >
          <Plus className='h-5 w-5' />
          <span className='text-xs font-bold'>Add Region</span>
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit test for this file — it's a thin, mostly-layout presentational component whose real coverage comes from Task 3's already-tested `region-layout.ts` math plus Task 7's manual verification; component-level tests here would mostly re-assert inline styles, which the "No Placeholders" bar this plan holds itself to would otherwise tempt into low-value snapshot tests.)

- [ ] **Step 3: Commit**

```bash
git add src/components/diagram/parallel/parallel-region-overlay.tsx
git commit -m "feat(diagram): add ParallelRegionOverlay for region dividers, tags, and add controls"
```

---

## Task 7: Wire the overlay into the canvas

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx` (imports, ReactFlow JSX around line 3208-3236, toolbar button around line 3220-3227)

- [ ] **Step 1: Import the new component**

Near the top of `src/components/diagram/visual-diagram.tsx`, alongside the other diagram-subcomponent imports:

```ts
import { ParallelRegionOverlay } from './parallel/parallel-region-overlay';
```

- [ ] **Step 2: Compute per-region state counts**

Add near where `regions`/`regionColumns` are destructured (Task 5, Step 1) — a small derived map the overlay needs for its "N states" caption:

```ts
  const regionStateCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    filteredNodes.forEach((node) => {
      const regionId = (node.data as { regionId?: string }).regionId;
      if (!regionId) return;
      counts.set(regionId, (counts.get(regionId) ?? 0) + 1);
    });
    return counts;
  }, [filteredNodes]);
```

- [ ] **Step 3: Render the overlay inside `<ReactFlow>`**

In the JSX around `src/components/diagram/visual-diagram.tsx:3208-3236` (right after the `<Background .../>` element, before `<Controls>`), add:

```tsx
            {isParallelRegionMode && regionColumns.length > 0 && (
              <ParallelRegionOverlay
                columns={regionColumns}
                regionStateCounts={regionStateCounts}
                contentBottom={regionContentBottom}
                onAddRegion={() => handleAddRootState()}
                onAddStateToRegion={(regionId) => handleAddRootState(regionId)}
              />
            )}
```

- [ ] **Step 4: Make the toolbar's "S" button context-aware**

At `src/components/diagram/visual-diagram.tsx:3220-3227`, update the tooltip so it doesn't say "Add State" while it's actually adding a region:

```tsx
              <ControlButton
                onClick={() => handleAddRootState()}
                title={isParallelRegionMode ? 'Add Region' : 'Add State'}
                aria-label={isParallelRegionMode ? 'Add Region' : 'Add State'}
                className='text-muted hover:text-default'
              >
                S
              </ControlButton>
```

(`handleAddRootState` is now called with an explicit `()` since Task 5 gave it an optional parameter — ReactFlow's `onClick` would otherwise pass its native `MouseEvent` through as `regionParentIdOverride`.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test from Tasks 1-6 plus the full pre-existing suite.

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat(diagram): render parallel region columns, dividers, and add controls on the canvas"
```

---

## Task 8: Manual verification

No new files — this is a walkthrough against the actual app, since the drag/zoom/pan/click interplay between the overlay and the canvas can't be fully asserted by the unit tests above.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Load the two-region example**

In the browser, use "Upload" to load `xml/airplane.xml`. Switch to the Visual tab. Navigate `Home > Airplane`, then click the down-arrow on the `Engines` node.

Confirm:
- Breadcrumb reads `Airplane > Engines` (not an extra `Left`/`Right` segment — region auto-expansion is transparent to the breadcrumb).
- Four nodes are visible: `LeftOff`, `LeftOn`, `RightOff`, `RightOn` — not `Left`/`Right`.
- `LeftOff` and `RightOff` show the green "Initial" pill; `LeftOn`/`RightOn` don't.
- A dashed vertical divider separates the `Left` column from the `Right` column, with a small "LEFT" / "RIGHT" tag above each column.
- A dashed "+ Add State" ghost card sits below each column, and a dashed "+ Add Region" ghost column sits to the right of both.
- Panning and zooming the canvas keeps the divider/tags/buttons aligned with their columns (this is the manual check for the `useViewport` sync from Task 6 — nothing in the automated suite exercises real pan/zoom).

- [ ] **Step 3: Add a region**

Click "+ Add Region" (or the toolbar "S" button, which should now be titled "Add Region" while inside `Engines`). Confirm a third empty column appears with its own "+ Add State" card, and switching to the Code tab shows a new `<state id="Region1"/>`-shaped element added as a third direct child of `<parallel id="Engines">` — with no `initial` attribute anywhere on `Engines` itself.

- [ ] **Step 4: Add a state into an existing region**

Click the "+ Add State" card under the `Left` column. Confirm the new state appears inside the `Left` column (correct x-range, left of the divider), and in the Code tab it's nested as `<parallel id="Engines"><state id="Left">...<state id="new-id"/></state>...`.

- [ ] **Step 5: Confirm validation surfaces the new checks**

In the Code tab, remove the `initial="LeftOff"` attribute from `<state id="Left">` and save. Confirm a validation error appears: `Compound state 'Left' must have either an 'initial' attribute or an <initial> child element`. Restore it, then delete the `<state id="Right">` region entirely (leaving `Engines` with only one region) and confirm a warning appears: `Parallel state 'Engines' has 1 region; a parallel state needs at least 2 regions to run anything concurrently.`

- [ ] **Step 6: Confirm ordinary (non-parallel) behavior is unchanged**

Navigate to a plain compound state elsewhere in the document (or in `xml/parallel_engines.xml` / any other sample) and confirm: no divider/tags/region-overlay appears, "+ Add State" still places new siblings in the old 4-column grid, and the toolbar button still says "Add State".

- [ ] **Step 7: Report results**

If anything in Steps 2-6 doesn't match, note exactly which check failed before moving on — do not mark this task done with a failing check.
