# Multi-Select, Copy/Paste, and Drag-to-Nest States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select multiple states on the canvas (via marquee or Ctrl/Cmd+click), copy/paste them (including nested subtrees and internal transitions), and drag states onto one another to nest/un-nest them, on top of the existing multi-move and multi-delete support.

**Architecture:** Four new pure functions in `scxml-manipulation-utils.ts` (id/descendant/clone/transition-rewrite logic operating on the fast-xml-parser `SCXMLDocument` object model), a tiny new Zustand clipboard store, a small presentational `MultiSelectToolbar` component, and targeted additions to `visual-diagram.tsx` that reuse the exact `parse → mutate → serialize → onSCXMLChange('structure')` shape `handleAddRootState` already uses (no new command classes — undo/redo is already automatic per `onSCXMLChange` call via the app's full-content snapshot history).

**Tech Stack:** React, React Flow v11, Zustand, fast-xml-parser (via the existing `SCXMLParser`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-27-multi-select-and-nesting-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/utils/scxml-manipulation-utils.ts` | Modify | Add `isDescendantOf`, `detachStateFromParent`, `cloneStateSubtreeWithFreshIds`, `rewriteOrDropTransitions` |
| `src/lib/utils/scxml-manipulation-utils.test.ts` | Modify | Unit tests for the four new functions |
| `src/stores/state-clipboard-store.ts` | Create | In-memory clipboard holding copied `StateElement[]`, mirrors `action-clipboard-store.ts` |
| `src/stores/state-clipboard-store.test.ts` | Create | Unit tests for the store |
| `src/components/diagram/multi-select-toolbar.tsx` | Create | Small floating "N states selected" pill with Copy/Delete buttons |
| `src/components/diagram/multi-select-toolbar.test.tsx` | Create | RTL tests for the toolbar |
| `src/components/diagram/visual-diagram.tsx` | Modify | Marquee select wiring, copy/paste handlers + keyboard shortcuts, drag-to-nest detection + highlight state, un-nest drop-zone panel |
| `src/components/diagram/nodes/scxml-state-node.tsx` | Modify | Render a highlight ring when `data.isDropTarget` is true |

---

## Task 1: `isDescendantOf` utility

**Files:**
- Modify: `src/lib/utils/scxml-manipulation-utils.ts`
- Test: `src/lib/utils/scxml-manipulation-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `scxml-manipulation-utils.test.ts`:

```ts
import { isDescendantOf } from './scxml-manipulation-utils';

describe('isDescendantOf', () => {
  it('returns true for a direct child', () => {
    const child = { '@_id': 'Child' };
    const parent = { '@_id': 'Parent', state: [child] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    expect(isDescendantOf(d, 'Child', 'Parent')).toBe(true);
  });

  it('returns true for a grandchild', () => {
    const grandchild = { '@_id': 'Grandchild' };
    const child = { '@_id': 'Child', state: [grandchild] };
    const parent = { '@_id': 'Parent', state: [child] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    expect(isDescendantOf(d, 'Grandchild', 'Parent')).toBe(true);
  });

  it('returns false for an unrelated state', () => {
    const parent = { '@_id': 'Parent', state: [{ '@_id': 'Child' }] };
    const other = { '@_id': 'Other' };
    const d: SCXMLDocument = { scxml: { state: [parent, other] } as any };
    expect(isDescendantOf(d, 'Other', 'Parent')).toBe(false);
  });

  it('returns false when the candidate equals the ancestor itself', () => {
    const parent = { '@_id': 'Parent', state: [{ '@_id': 'Child' }] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    expect(isDescendantOf(d, 'Parent', 'Parent')).toBe(false);
  });

  it('returns false when the ancestor id does not exist', () => {
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }] } as any };
    expect(isDescendantOf(d, 'A', 'Missing')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: FAIL — `isDescendantOf is not exported` / not a function.

- [ ] **Step 3: Implement `isDescendantOf`**

Add to `scxml-manipulation-utils.ts` (near `findStateById`, same file, same `.state`-only traversal scope as `findStateById`/`removeStateFromDocument`):

```ts
/**
 * Whether candidateId is nested anywhere inside ancestorId's subtree
 * (not counting ancestorId itself). Only walks <state> children, matching
 * findStateById/removeStateFromDocument's existing scope.
 */
export function isDescendantOf(
  scxmlDoc: SCXMLDocument,
  candidateId: string,
  ancestorId: string
): boolean {
  const ancestor = findStateById(scxmlDoc, ancestorId);
  if (!ancestor) return false;

  function search(states: StateElement | StateElement[] | undefined): boolean {
    if (!states) return false;
    const arr = Array.isArray(states) ? states : [states];
    for (const s of arr) {
      if (s['@_id'] === candidateId) return true;
      if (search(s.state)) return true;
    }
    return false;
  }

  return search(ancestor.state);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: PASS (all 5 new tests, plus existing ones still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/scxml-manipulation-utils.ts src/lib/utils/scxml-manipulation-utils.test.ts
git commit -m "feat: add isDescendantOf utility for drag-to-nest cycle prevention"
```

---

## Task 2: `detachStateFromParent` utility

**Files:**
- Modify: `src/lib/utils/scxml-manipulation-utils.ts`
- Test: `src/lib/utils/scxml-manipulation-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { detachStateFromParent } from './scxml-manipulation-utils';

describe('detachStateFromParent', () => {
  it('detaches a root-level state and returns it', () => {
    const target = { '@_id': 'B' };
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }, target] } as any };
    const detached = detachStateFromParent(d, 'B');
    expect(detached).toBe(target);
    expect((d.scxml.state as any[]).map((s: any) => s['@_id'])).toEqual(['A']);
  });

  it('leaves transitions targeting the detached state untouched', () => {
    const target = { '@_id': 'B' };
    const a = { '@_id': 'A', transition: { '@_event': 'go', '@_target': 'B' } };
    const d: SCXMLDocument = { scxml: { state: [a, target] } as any };
    detachStateFromParent(d, 'B');
    expect((a.transition as any)['@_target']).toBe('B');
  });

  it('detaches a nested child and shrinks the parent\'s state list', () => {
    const child = { '@_id': 'Child' };
    const parent = { '@_id': 'Parent', state: [child, { '@_id': 'Sibling' }] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    const detached = detachStateFromParent(d, 'Child');
    expect(detached).toBe(child);
    expect((parent.state as any[]).map((s: any) => s['@_id'])).toEqual(['Sibling']);
  });

  it('clears a nested parent\'s single-child state to undefined when its only child is detached', () => {
    const child = { '@_id': 'Child' };
    const parent = { '@_id': 'Parent', state: child, '@_initial': 'Child' };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    detachStateFromParent(d, 'Child');
    expect(parent.state).toBeUndefined();
    expect((parent as any)['@_initial']).toBeUndefined();
  });

  it('auto-falls-back a nested parent\'s @_initial to a remaining sibling', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', state: [childA, childB], '@_initial': 'ChildA' };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    detachStateFromParent(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });

  it('leaves the document root\'s @_initial empty (no forced fallback) when its sole initial is detached', () => {
    const target = { '@_id': 'A' };
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [target, { '@_id': 'B' }] } as any };
    detachStateFromParent(d, 'A');
    expect(d.scxml['@_initial']).toBeUndefined();
  });

  it('returns null when the state id does not exist', () => {
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }] } as any };
    expect(detachStateFromParent(d, 'Missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: FAIL — `detachStateFromParent is not exported`.

- [ ] **Step 3: Implement `detachStateFromParent`**

```ts
/**
 * Removes a state's element from wherever it currently sits (root or
 * nested), fixing up the OLD parent's @_initial bookkeeping the same way
 * removeStateFromDocument does — but, unlike removeStateFromDocument, this
 * does NOT touch any transitions, since reparenting must keep every
 * transition targeting the moved state intact. Returns the detached
 * StateElement for re-insertion elsewhere, or null if not found.
 */
export function detachStateFromParent(
  scxmlDoc: SCXMLDocument,
  stateId: string
): StateElement | null {
  function fixInitial(
    container: { '@_initial'?: string; state?: StateElement | StateElement[] },
    isRoot: boolean
  ): void {
    if (container['@_initial']) {
      const tokens = container['@_initial']
        .split(/\s+/)
        .filter((t) => t && t !== stateId);
      if (tokens.length > 0) {
        container['@_initial'] = tokens.join(' ');
        return;
      }
      delete container['@_initial'];
    }
    if (!isRoot && !container['@_initial'] && container.state) {
      const remaining = Array.isArray(container.state)
        ? container.state
        : [container.state];
      if (remaining.length > 0) {
        container['@_initial'] = remaining[0]['@_id'];
      }
    }
  }

  function detachFrom(
    container: { state?: StateElement | StateElement[]; '@_initial'?: string },
    isRoot: boolean
  ): StateElement | null {
    const states = container.state;
    if (!states) return null;
    const arr = Array.isArray(states) ? states : [states];
    const idx = arr.findIndex((s) => s['@_id'] === stateId);

    if (idx !== -1) {
      const [removed] = arr.splice(idx, 1);
      container.state = arr.length > 0 ? arr : undefined;
      fixInitial(container, isRoot);
      return removed;
    }

    for (const s of arr) {
      const found = detachFrom(s, false);
      if (found) return found;
    }
    return null;
  }

  return detachFrom(scxmlDoc.scxml as any, true);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: PASS (all 7 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/scxml-manipulation-utils.ts src/lib/utils/scxml-manipulation-utils.test.ts
git commit -m "feat: add detachStateFromParent utility for reparenting states"
```

---

## Task 3: `cloneStateSubtreeWithFreshIds` utility

**Files:**
- Modify: `src/lib/utils/scxml-manipulation-utils.ts`
- Test: `src/lib/utils/scxml-manipulation-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { cloneStateSubtreeWithFreshIds } from './scxml-manipulation-utils';

describe('cloneStateSubtreeWithFreshIds', () => {
  it('assigns a fresh "_copy" id and does not mutate the original', () => {
    const original = { '@_id': 'A' };
    const { clone, idMap } = cloneStateSubtreeWithFreshIds(
      original as any,
      new Set(['A']),
      40,
      40
    );
    expect(clone['@_id']).toBe('A_copy');
    expect(original['@_id']).toBe('A');
    expect(idMap.get('A')).toBe('A_copy');
  });

  it('bumps to "_copy2" when "_copy" is already taken', () => {
    const original = { '@_id': 'A' };
    const { clone } = cloneStateSubtreeWithFreshIds(
      original as any,
      new Set(['A', 'A_copy']),
      40,
      40
    );
    expect(clone['@_id']).toBe('A_copy2');
  });

  it('offsets an existing viz:xywh position, preserving width/height', () => {
    const original = { '@_id': 'A', '@_viz:xywh': '100,100,120,60' } as any;
    const { clone } = cloneStateSubtreeWithFreshIds(original, new Set(['A']), 40, 40);
    expect(clone['@_viz:xywh']).toBe('140,140,120,60');
  });

  it('leaves a state with no viz:xywh untouched (no crash)', () => {
    const original = { '@_id': 'A' } as any;
    const { clone } = cloneStateSubtreeWithFreshIds(original, new Set(['A']), 40, 40);
    expect(clone['@_viz:xywh']).toBeUndefined();
  });

  it('recursively assigns fresh ids to every descendant', () => {
    const child = { '@_id': 'Child' };
    const original = { '@_id': 'Parent', state: [child], '@_initial': 'Child' } as any;
    const { clone, idMap } = cloneStateSubtreeWithFreshIds(
      original,
      new Set(['Parent', 'Child']),
      0,
      0
    );
    const clonedChild = Array.isArray(clone.state) ? clone.state[0] : clone.state!;
    expect(clonedChild['@_id']).toBe('Child_copy');
    expect(idMap.get('Child')).toBe('Child_copy');
    expect(idMap.get('Parent')).toBe('Parent_copy');
  });

  it('rewrites a compound clone\'s own @_initial to the new child id', () => {
    const child = { '@_id': 'Child' };
    const original = { '@_id': 'Parent', state: [child], '@_initial': 'Child' } as any;
    const { clone } = cloneStateSubtreeWithFreshIds(original, new Set(['Parent', 'Child']), 0, 0);
    expect(clone['@_initial']).toBe('Child_copy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: FAIL — `cloneStateSubtreeWithFreshIds is not exported`.

- [ ] **Step 3: Implement `cloneStateSubtreeWithFreshIds`**

```ts
/**
 * Deep-clones a state (and its whole descendant subtree) with a fresh
 * unique id for every state in the clone, offsetting each cloned state's
 * viz:xywh position and rewriting each cloned compound state's own
 * @_initial to match. Descendant transitions are left as-is here — see
 * rewriteOrDropTransitions, applied separately once the full paste-wide id
 * map (across every top-level copied state) is known.
 *
 * existingIds is mutated as ids are claimed, so calling this once per
 * top-level copied state in a multi-state paste avoids id collisions
 * between the pasted states themselves.
 */
export function cloneStateSubtreeWithFreshIds(
  state: StateElement,
  existingIds: Set<string>,
  offsetX: number,
  offsetY: number
): { clone: StateElement; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const rootClone: StateElement = JSON.parse(JSON.stringify(state));

  function freshId(oldId: string): string {
    let candidate = `${oldId}_copy`;
    let n = 2;
    while (existingIds.has(candidate)) {
      candidate = `${oldId}_copy${n}`;
      n++;
    }
    existingIds.add(candidate);
    return candidate;
  }

  function offsetPosition(clone: StateElement): void {
    const xywh = (clone as any)['@_viz:xywh'];
    if (typeof xywh !== 'string') return;
    const parts = xywh.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length < 4) return;
    const [x, y, w, h] = parts;
    (clone as any)['@_viz:xywh'] = `${x + offsetX},${y + offsetY},${w},${h}`;
  }

  function assignIds(clone: StateElement): void {
    const oldId = clone['@_id'];
    clone['@_id'] = freshId(oldId);
    idMap.set(oldId, clone['@_id']);
    offsetPosition(clone);

    if (clone.state) {
      const children = Array.isArray(clone.state) ? clone.state : [clone.state];
      children.forEach(assignIds);
    }
  }

  function rewriteInitial(clone: StateElement): void {
    if (clone['@_initial']) {
      const tokens = clone['@_initial'].split(/\s+/).filter(Boolean);
      clone['@_initial'] = tokens.map((t) => idMap.get(t) || t).join(' ');
    }
    if (clone.state) {
      const children = Array.isArray(clone.state) ? clone.state : [clone.state];
      children.forEach(rewriteInitial);
    }
  }

  assignIds(rootClone);
  rewriteInitial(rootClone);

  return { clone: rootClone, idMap };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: PASS (all 6 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/scxml-manipulation-utils.ts src/lib/utils/scxml-manipulation-utils.test.ts
git commit -m "feat: add cloneStateSubtreeWithFreshIds utility for state paste"
```

---

## Task 4: `rewriteOrDropTransitions` utility

**Files:**
- Modify: `src/lib/utils/scxml-manipulation-utils.ts`
- Test: `src/lib/utils/scxml-manipulation-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { rewriteOrDropTransitions } from './scxml-manipulation-utils';

describe('rewriteOrDropTransitions', () => {
  it('rewrites a transition target that is in the id map', () => {
    const state = {
      '@_id': 'A_copy',
      transition: { '@_event': 'go', '@_target': 'B' },
    } as any;
    rewriteOrDropTransitions(state, new Map([['B', 'B_copy']]));
    expect(state.transition['@_target']).toBe('B_copy');
  });

  it('drops a transition whose target is not in the id map', () => {
    const state = {
      '@_id': 'A_copy',
      transition: { '@_event': 'go', '@_target': 'Outside' },
    } as any;
    rewriteOrDropTransitions(state, new Map([['B', 'B_copy']]));
    expect(state.transition).toBeUndefined();
  });

  it('keeps a targetless transition untouched', () => {
    const state = {
      '@_id': 'A_copy',
      transition: { '@_event': 'go' },
    } as any;
    rewriteOrDropTransitions(state, new Map());
    expect(state.transition['@_event']).toBe('go');
    expect(state.transition['@_target']).toBeUndefined();
  });

  it('filters a multi-transition array down to only the ones that survive, collapsing to a single object when one remains', () => {
    const state = {
      '@_id': 'A_copy',
      transition: [
        { '@_event': 'go', '@_target': 'B' },
        { '@_event': 'leave', '@_target': 'Outside' },
      ],
    } as any;
    rewriteOrDropTransitions(state, new Map([['B', 'B_copy']]));
    expect(Array.isArray(state.transition)).toBe(false);
    expect(state.transition['@_target']).toBe('B_copy');
  });

  it('recurses into nested children', () => {
    const child = {
      '@_id': 'Child_copy',
      transition: { '@_event': 'go', '@_target': 'Sibling' },
    };
    const state = { '@_id': 'Parent_copy', state: [child] } as any;
    rewriteOrDropTransitions(state, new Map([['Sibling', 'Sibling_copy']]));
    expect(child.transition['@_target']).toBe('Sibling_copy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: FAIL — `rewriteOrDropTransitions is not exported`.

- [ ] **Step 3: Implement `rewriteOrDropTransitions`**

```ts
/**
 * Walks an already-cloned subtree's transitions at every depth: a
 * transition whose @_target is in idMap is rewritten to the mapped id; one
 * whose @_target is present but NOT in idMap (points outside the copied
 * set) is dropped entirely; a targetless transition is always kept.
 * Mutates the given clone in place.
 */
export function rewriteOrDropTransitions(
  state: StateElement,
  idMap: Map<string, string>
): void {
  function walk(s: StateElement): void {
    if (s.transition) {
      const arr = Array.isArray(s.transition) ? s.transition : [s.transition];
      const kept = arr
        .filter((t) => !t['@_target'] || idMap.has(t['@_target']))
        .map((t) =>
          t['@_target'] && idMap.has(t['@_target'])
            ? { ...t, '@_target': idMap.get(t['@_target'])! }
            : t
        );
      s.transition = kept.length === 0 ? undefined : kept.length === 1 ? kept[0] : kept;
    }

    if (s.state) {
      const children = Array.isArray(s.state) ? s.state : [s.state];
      children.forEach(walk);
    }
  }

  walk(state);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: PASS (all 5 new tests, plus every earlier test in the file still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/scxml-manipulation-utils.ts src/lib/utils/scxml-manipulation-utils.test.ts
git commit -m "feat: add rewriteOrDropTransitions utility for state paste"
```

---

## Task 5: State clipboard store

**Files:**
- Create: `src/stores/state-clipboard-store.ts`
- Test: `src/stores/state-clipboard-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/state-clipboard-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStateClipboardStore } from './state-clipboard-store';

describe('useStateClipboardStore', () => {
  beforeEach(() => {
    useStateClipboardStore.setState({ copied: null });
  });

  it('starts with an empty clipboard', () => {
    expect(useStateClipboardStore.getState().copied).toBeNull();
  });

  it('stores copied states via copy()', () => {
    const states = [{ '@_id': 'A' }] as any;
    useStateClipboardStore.getState().copy(states);
    expect(useStateClipboardStore.getState().copied).toBe(states);
  });

  it('replaces previously copied states on a new copy', () => {
    useStateClipboardStore.getState().copy([{ '@_id': 'A' }] as any);
    const second = [{ '@_id': 'B' }] as any;
    useStateClipboardStore.getState().copy(second);
    expect(useStateClipboardStore.getState().copied).toBe(second);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/state-clipboard-store.test.ts`
Expected: FAIL — cannot find module `./state-clipboard-store`.

- [ ] **Step 3: Implement the store**

Create `src/stores/state-clipboard-store.ts`:

```ts
import { create } from 'zustand';
import type { StateElement } from '@/types/scxml';

interface StateClipboardState {
  copied: StateElement[] | null;
  copy: (states: StateElement[]) => void;
}

export const useStateClipboardStore = create<StateClipboardState>((set) => ({
  copied: null,
  copy: (states) => set({ copied: states }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/state-clipboard-store.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/state-clipboard-store.ts src/stores/state-clipboard-store.test.ts
git commit -m "feat: add in-memory clipboard store for state copy/paste"
```

---

## Task 6: `MultiSelectToolbar` component

**Files:**
- Create: `src/components/diagram/multi-select-toolbar.tsx`
- Test: `src/components/diagram/multi-select-toolbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/diagram/multi-select-toolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiSelectToolbar } from './multi-select-toolbar';

describe('MultiSelectToolbar', () => {
  it('shows the selected count', () => {
    render(<MultiSelectToolbar count={3} onCopy={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('3 states selected')).toBeInTheDocument();
  });

  it('calls onCopy when the Copy button is clicked', () => {
    const onCopy = vi.fn();
    render(<MultiSelectToolbar count={2} onCopy={onCopy} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when the Delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<MultiSelectToolbar count={2} onCopy={() => {}} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('singularizes the label for a count of 1', () => {
    render(<MultiSelectToolbar count={1} onCopy={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('1 state selected')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/diagram/multi-select-toolbar.test.tsx`
Expected: FAIL — cannot find module `./multi-select-toolbar`.

- [ ] **Step 3: Implement the component**

Create `src/components/diagram/multi-select-toolbar.tsx`:

```tsx
'use client';

import { Copy, Trash2 } from 'lucide-react';

interface MultiSelectToolbarProps {
  count: number;
  onCopy: () => void;
  onDelete: () => void;
}

export function MultiSelectToolbar({ count, onCopy, onDelete }: MultiSelectToolbarProps) {
  return (
    <div className='absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2 text-xs text-default shadow-lg'>
      <span>
        {count} state{count === 1 ? '' : 's'} selected
      </span>
      <div className='h-4 w-px bg-[var(--ui-border)]' />
      <button
        onClick={onCopy}
        title='Copy selection'
        aria-label='Copy selection'
        className='flex items-center gap-1 text-muted hover:text-default transition-colors'
      >
        <Copy className='h-3.5 w-3.5' />
        Copy
      </button>
      <button
        onClick={onDelete}
        title='Delete selection'
        aria-label='Delete selection'
        className='flex items-center gap-1 text-muted hover:text-error transition-colors'
      >
        <Trash2 className='h-3.5 w-3.5' />
        Delete
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/diagram/multi-select-toolbar.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/diagram/multi-select-toolbar.tsx src/components/diagram/multi-select-toolbar.test.tsx
git commit -m "feat: add MultiSelectToolbar component"
```

---

## Task 7: Marquee (Shift+drag) select

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Import `onSelectionChange`-related types and add the handler**

In `visual-diagram.tsx`, near `handleStateClick` (around line 1152), add:

```ts
const syncMarqueeSelection = useCallback(
  (selectedNodes: Node[]) => {
    const ids = selectedNodes
      .filter((n) => !isNoteId(n.id))
      .map((n) => n.id);
    if (ids.length === 0) return;
    setActiveStates(new Set(ids));
    setSelectedStateForActions(null);
    if (ids.length === 1) {
      // A degenerate marquee (effectively a single-node box) behaves like a
      // normal single click would have — but without the actions-panel
      // side effects that a real click computes (parsed action rows, etc.).
      // Leave the actions panel closed; the user can click the node directly
      // to open it.
      setActivePanel(null);
    }
  },
  []
);
```

- [ ] **Step 2: Wire `onSelectionChange` on `<ReactFlow>`**

In the `<ReactFlow>` JSX (around line 2705, right after `onNodeClick`), add:

```tsx
onSelectionChange={(params) => syncMarqueeSelection(params.nodes)}
```

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, open the app, load or create a diagram with 3+ sibling states.

1. Hold Shift and drag a box over 2 states → both highlight as selected.
2. Release Shift, plain-drag on empty canvas elsewhere → canvas pans (unchanged).
3. Ctrl/Cmd+click one of the two marquee-selected states to deselect it → only the other remains selected.
4. Drag one of the two selected states → both move together (pre-existing behavior, now reachable via marquee too).

Expected: all four behaviors match.

- [ ] **Step 4: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat: add Shift+drag marquee select for canvas states"
```

---

## Task 8: Copy/Paste states (keyboard + toolbar)

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Import the new utilities and clipboard store**

At the top of `visual-diagram.tsx`, extend the existing `scxml-manipulation-utils` import:

```ts
import {
  addStateToDocument,
  createStateElement,
  findStateById,
  removeTransitionByEdgeId,
  cloneStateSubtreeWithFreshIds,
  rewriteOrDropTransitions,
} from '@/lib/utils/scxml-manipulation-utils';
```

Add a new import:

```ts
import { useStateClipboardStore } from '@/stores/state-clipboard-store';
import { MultiSelectToolbar } from './multi-select-toolbar';
```

- [ ] **Step 2: Add `handleCopySelection`**

Near `handleAddRootState` (around line 2237), add:

```ts
const handleCopySelection = useCallback(() => {
  if (!scxmlContent || activeStates.size === 0) return;
  const parseResult = parserRef.current?.parse(scxmlContent);
  if (!parseResult?.success || !parseResult.data) return;

  const clones: StateElement[] = [];
  activeStates.forEach((id) => {
    const found = findStateById(parseResult.data as SCXMLDocument, id);
    if (found) clones.push(JSON.parse(JSON.stringify(found)));
  });
  if (clones.length > 0) {
    useStateClipboardStore.getState().copy(clones);
  }
}, [scxmlContent, activeStates]);
```

Reads and writes the clipboard via `getState()` rather than the reactive hook in both handlers — neither handler needs to re-render when the clipboard changes, so subscribing would just cost an extra re-render of this large component on every copy.

Add the `StateElement` type to the existing `import type { SCXMLDocument, TransitionElement } from '@/types/scxml';` line:

```ts
import type { SCXMLDocument, StateElement, TransitionElement } from '@/types/scxml';
```

- [ ] **Step 3: Add `handlePasteClipboard`**

```ts
const handlePasteClipboard = useCallback(() => {
  const copied = useStateClipboardStore.getState().copied;
  if (!copied || copied.length === 0 || !onSCXMLChange || !scxmlContent) return;

  const parseResult = parserRef.current?.parse(scxmlContent);
  if (!parseResult?.success || !parseResult.data) return;
  const scxmlDoc = parseResult.data as SCXMLDocument;

  const existingIds = new Set(parsedData.nodes.map((n) => n.id));
  const combinedIdMap = new Map<string, string>();
  const clones: StateElement[] = [];

  copied.forEach((state) => {
    const { clone, idMap } = cloneStateSubtreeWithFreshIds(state, existingIds, 40, 40);
    idMap.forEach((newId, oldId) => combinedIdMap.set(oldId, newId));
    clones.push(clone);
  });

  clones.forEach((clone) => {
    rewriteOrDropTransitions(clone, combinedIdMap);
    addStateToDocument(scxmlDoc, clone, currentParentId);
  });

  const updatedSCXML = parserRef.current!.serialize(scxmlDoc, true);
  onSCXMLChange(updatedSCXML, 'structure');
  setActiveStates(new Set(clones.map((c) => c['@_id'])));
}, [scxmlContent, onSCXMLChange, parsedData?.nodes, currentParentId]);
```

- [ ] **Step 4: Add the Ctrl/Cmd+C / Ctrl/Cmd+V keyboard effect**

Next to the existing Delete-key effect (around line 2642), add a new effect:

```ts
React.useEffect(() => {
  const isTextInputFocused = () => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
  };

  const handleCopyPasteKeys = (event: KeyboardEvent) => {
    if (isTextInputFocused()) return;
    const isMod = event.ctrlKey || event.metaKey;
    if (!isMod) return;

    if (event.key === 'c' && activeStates.size > 0) {
      event.preventDefault();
      handleCopySelection();
    } else if (event.key === 'v') {
      event.preventDefault();
      handlePasteClipboard();
    }
  };

  window.addEventListener('keydown', handleCopyPasteKeys);
  return () => window.removeEventListener('keydown', handleCopyPasteKeys);
}, [activeStates, handleCopySelection, handlePasteClipboard]);
```

- [ ] **Step 5: Render the toolbar**

Right after `<InitialGroupConflictBanner ... />` (around line 2841), add:

```tsx
{activeStates.size >= 2 && (
  <MultiSelectToolbar
    count={activeStates.size}
    onCopy={handleCopySelection}
    onDelete={() => {
      const ids = Array.from(activeStates);
      handleNodesChange(ids.map((id) => ({ id, type: 'remove' })));
    }}
  />
)}
```

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`.

1. Select 2 sibling states via marquee → toolbar appears reading "2 states selected".
2. Click toolbar Copy, then Ctrl/Cmd+V → 2 new states appear offset +40/+40 from the originals, selected.
3. Draw a transition between the 2 originals first, then repeat copy/paste → the pasted pair has its own transition between them.
4. Paste again without re-copying → third pair appears offset further, with `_copy2` ids.
5. Copy a compound state that has a child → paste → the pasted compound state has its own (fresh-id) child, and its own `initial` marker points at that new child.
6. Click a text field elsewhere in the app, press Ctrl/Cmd+C → does not trigger a canvas copy (browser's native text copy still works).
7. Click toolbar Delete with 2 selected → both removed in one undo step (Ctrl+Z restores both).

Expected: all seven behaviors match.

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat: add copy/paste for one or more canvas states"
```

---

## Task 9: Drag-to-nest

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`
- Modify: `src/components/diagram/nodes/scxml-state-node.tsx`

- [ ] **Step 1: Add `handleReparent`**

In `visual-diagram.tsx`, extend the `scxml-manipulation-utils` import with `detachStateFromParent` and `isDescendantOf`:

```ts
import {
  addStateToDocument,
  createStateElement,
  findStateById,
  removeTransitionByEdgeId,
  cloneStateSubtreeWithFreshIds,
  rewriteOrDropTransitions,
  detachStateFromParent,
  isDescendantOf,
} from '@/lib/utils/scxml-manipulation-utils';
```

Near `handlePasteClipboard`, add:

```ts
const handleReparent = useCallback(
  (stateIds: string[], targetParentId: string | undefined) => {
    if (!onSCXMLChange || !scxmlContent) return;
    const parseResult = parserRef.current?.parse(scxmlContent);
    if (!parseResult?.success || !parseResult.data) return;
    const scxmlDoc = parseResult.data as SCXMLDocument;

    let changed = false;
    stateIds.forEach((id) => {
      if (id === targetParentId) return;
      if (targetParentId && isDescendantOf(scxmlDoc, targetParentId, id)) return;
      const detached = detachStateFromParent(scxmlDoc, id);
      if (!detached) return;
      addStateToDocument(scxmlDoc, detached, targetParentId);
      changed = true;

      if (targetParentId) {
        const newParent = findStateById(scxmlDoc, targetParentId);
        if (newParent && !newParent['@_initial'] && newParent.state) {
          const children = Array.isArray(newParent.state) ? newParent.state : [newParent.state];
          if (children.length === 1) {
            newParent['@_initial'] = children[0]['@_id'];
          }
        }
      }
    });

    if (!changed) return;
    const updatedSCXML = parserRef.current!.serialize(scxmlDoc, true);
    onSCXMLChange(updatedSCXML, 'structure');
    setActiveStates(new Set());
  },
  [scxmlContent, onSCXMLChange]
);
```

Note: `targetParentId === undefined` means "un-nest to root" — `addStateToDocument`'s existing `parentId?: string` param already treats `undefined` as root-level, matching `handleAddRootState`'s own usage.

- [ ] **Step 2: Track and compute the drop target during drag**

Add new state near `activeStates` (around line 190):

```ts
const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
const draggingNodeIdsRef = React.useRef<string[]>([]);
```

Add drag handlers, placed near `handleNodeResize`/`handleNodePositionChange`:

```ts
const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const handleNodeDragStart = useCallback(
  (_event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
    draggingNodeIdsRef.current = (draggedNodes.length > 0 ? draggedNodes : [_node]).map((n) => n.id);
  },
  []
);

const handleNodeDrag = useCallback(
  (_event: React.MouseEvent, node: Node) => {
    const draggedRect = {
      x: node.position.x,
      y: node.position.y,
      width: node.width || 120,
      height: node.height || 60,
    };

    const candidate = nodes.find((n) => {
      if (draggingNodeIdsRef.current.includes(n.id) || isNoteId(n.id)) return false;
      const rect = { x: n.position.x, y: n.position.y, width: n.width || 120, height: n.height || 60 };
      return rectsOverlap(draggedRect, rect);
    });

    if (!candidate || !scxmlContent) {
      setDropTargetId((prev) => (prev === null ? prev : null));
      return;
    }

    const parseResult = parserRef.current?.parse(scxmlContent);
    if (!parseResult?.success || !parseResult.data) {
      setDropTargetId(null);
      return;
    }
    const scxmlDoc = parseResult.data as SCXMLDocument;
    const invalid =
      candidate.type !== 'scxmlState' ||
      draggingNodeIdsRef.current.includes(candidate.id) ||
      draggingNodeIdsRef.current.some((id) => isDescendantOf(scxmlDoc, candidate.id, id));

    setDropTargetId(invalid ? null : candidate.id);
  },
  [nodes, scxmlContent]
);

const handleNodeDragStop = useCallback(() => {
  if (dropTargetId) {
    handleReparent(draggingNodeIdsRef.current, dropTargetId);
  }
  setDropTargetId(null);
  draggingNodeIdsRef.current = [];
}, [dropTargetId, handleReparent]);
```

- [ ] **Step 3: Wire the handlers onto `<ReactFlow>`**

Around line 2705, add:

```tsx
onNodeDragStart={handleNodeDragStart}
onNodeDrag={handleNodeDrag}
onNodeDragStop={handleNodeDragStop}
```

- [ ] **Step 4: Guard against a stale position write racing the reparent**

The same drag-release gesture also fires React Flow's own `onNodesChange` with a `{ type: 'position', dragging: false }` change for the dragged node(s), independent of the new `onNodeDragStop` handler — that change flows into the existing `handleNodesChange` batch-position logic (around line 1255) and would call `onSCXMLChange` a second time, built from whatever `scxmlContent` closure value it captured, potentially racing the reparent's own `onSCXMLChange` call. Guard it with a ref:

Add near `dropTargetId`:

```ts
const justReparentedIdsRef = React.useRef<Set<string>>(new Set());
```

In `handleNodeDragStop` (Step 2), before calling `handleReparent`, record which ids are being reparented:

```ts
const handleNodeDragStop = useCallback(() => {
  if (dropTargetId) {
    justReparentedIdsRef.current = new Set(draggingNodeIdsRef.current);
    handleReparent(draggingNodeIdsRef.current, dropTargetId);
  }
  setDropTargetId(null);
  draggingNodeIdsRef.current = [];
}, [dropTargetId, handleReparent]);
```

In `handleNodesChange`, the drag-end changes are collected at (currently) line 1294-1296:

```ts
const dragEndChanges = structuralChanges.filter(
  (change) => change.type === 'position' && change.dragging === false
);
```

Change this to also exclude ids that were just reparented, then clear the ref right after:

```ts
const dragEndChanges = structuralChanges.filter(
  (change) =>
    change.type === 'position' &&
    change.dragging === false &&
    !justReparentedIdsRef.current.has(change.id)
);
justReparentedIdsRef.current = new Set();
```

- [ ] **Step 5: Add the `isDropTarget` highlight prop**

In `nodeEnhancements` (around line 2432), add `isDropTarget: node.id === dropTargetId` into the `data` object:

```ts
enhancements.set(node.id, {
  data: {
    ...node.data,
    isActive,
    isDropTarget: node.id === dropTargetId,
    visualStyles: updatedVisualStyles,
    // ...unchanged fields below
```

Add `dropTargetId` to the `nodeEnhancements` memo's dependency array.

In `src/components/diagram/nodes/scxml-state-node.tsx`, find where `selected` drives the border/highlight styling (around line 288-301) and add a sibling check for `data.isDropTarget`, applying a distinct highlight (e.g. a colored ring) — for example, alongside the existing `borderStyle` logic:

```ts
const isDropTarget = Boolean((data as any).isDropTarget);
```

and in the rendered container's className/style, add a conditional ring class, e.g. `isDropTarget && 'ring-2 ring-blue-500'` merged into the node's existing className string.

- [ ] **Step 6: Manually verify in the browser**

1. Create 3 sibling states A, B, C. Drag A over B → B highlights with a ring while hovering; release → A disappears from the current view.
2. Drill into B → A appears there as a child.
3. Drag a compound state onto one of its own children → the child never highlights (blocked).
4. Undo (Ctrl+Z) after the nest → A reappears as a sibling of B again.
5. Multi-select A and C (both siblings, not compound), drag both onto B → both vanish from the current view; drilling into B shows both as children.

Expected: all five behaviors match.

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx src/components/diagram/nodes/scxml-state-node.tsx
git commit -m "feat: add drag-to-nest states onto another state"
```

---

## Task 10: Un-nest via in-canvas "Back to parent" drop zone

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Import `Panel` from reactflow**

Extend the existing `reactflow` import (around line 35) to include `Panel`.

- [ ] **Step 2: Compute the grandparent id and track drop-zone hover**

Near `dropTargetId` (from Task 9), add:

```ts
const [isOverUnnestZone, setIsOverUnnestZone] = React.useState(false);

const grandparentId = React.useMemo(() => {
  if (!currentParentId) return undefined;
  const parentNode = parsedData.nodes.find((n) => n.id === currentParentId);
  return parentNode?.parentId;
}, [currentParentId, parsedData.nodes]);
```

- [ ] **Step 3: Extend `handleNodeDrag`/`handleNodeDragStop` to check the drop-zone rect**

The drop-zone is a fixed DOM element (screen-space), while `node.position` is in flow-space, so the two can't be compared directly — use the drag event's `clientX`/`clientY` (screen-space) against `unnestZoneRef.current.getBoundingClientRect()` (also screen-space) instead.

Add a ref near `dropTargetId`:

```ts
const unnestZoneRef = React.useRef<HTMLDivElement>(null);
```

Update `handleNodeDrag` from Task 9, Step 2 to check the zone first, short-circuiting the nest-target check when hovering it:

```ts
const handleNodeDrag = useCallback(
  (event: React.MouseEvent, node: Node) => {
    if (currentParentId && unnestZoneRef.current) {
      const zoneRect = unnestZoneRef.current.getBoundingClientRect();
      const overZone =
        event.clientX >= zoneRect.left &&
        event.clientX <= zoneRect.right &&
        event.clientY >= zoneRect.top &&
        event.clientY <= zoneRect.bottom;
      setIsOverUnnestZone(overZone);
      if (overZone) {
        setDropTargetId(null);
        return;
      }
    } else {
      setIsOverUnnestZone(false);
    }

    // ...rest of the existing handleNodeDrag body from Task 9, Step 2
  },
  [nodes, scxmlContent, currentParentId]
);
```

Update `handleNodeDragStop` (Task 9, Step 4's version, which already sets `justReparentedIdsRef` before reparenting) to check the zone first, keeping that same guard on both branches:

```ts
const handleNodeDragStop = useCallback(() => {
  if (isOverUnnestZone && currentParentId) {
    justReparentedIdsRef.current = new Set(draggingNodeIdsRef.current);
    handleReparent(draggingNodeIdsRef.current, grandparentId);
  } else if (dropTargetId) {
    justReparentedIdsRef.current = new Set(draggingNodeIdsRef.current);
    handleReparent(draggingNodeIdsRef.current, dropTargetId);
  }
  setDropTargetId(null);
  setIsOverUnnestZone(false);
  draggingNodeIdsRef.current = [];
}, [dropTargetId, isOverUnnestZone, currentParentId, grandparentId, handleReparent]);
```

- [ ] **Step 4: Render the drop zone**

Inside `<ReactFlow>` (as a direct child, alongside `<Background>`/`<Controls>`), add:

```tsx
{currentParentId && (
  <Panel position='top-left'>
    <div
      ref={unnestZoneRef}
      className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs shadow-sm transition-colors ${
        isOverUnnestZone
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
          : 'border-default bg-elevated text-muted'
      }`}
    >
      ↑ Back to parent
    </div>
  </Panel>
)}
```

- [ ] **Step 5: Manually verify in the browser**

1. Nest state A into compound state B (via Task 9's gesture), drill into B.
2. A "↑ Back to parent" control appears top-left.
3. Drag A onto that control → it highlights while hovered; on release, A disappears from B's view.
4. Navigate up → A now appears as a sibling of B.
5. Multi-select 2 children of B and drag both onto the control → both un-nest together in one undo step.
6. At the root level (not drilled into anything), the control does not appear at all.

Expected: all six behaviors match.

- [ ] **Step 6: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat: add drag-to-un-nest via in-canvas back-to-parent drop zone"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Marquee select → Task 7. Multi-select toolbar → Task 6/8. Copy/paste (incl. subtree + internal transitions + id uniquification + offset + paste-in-current-context) → Tasks 3, 4, 8. Drag-to-nest (incl. multi-select nest, cycle prevention) → Task 9. Un-nest → Task 10. Every spec Design Decision row maps to a task above.
- **No BaseCommand subclasses** were introduced anywhere in this plan, consistent with the corrected spec architecture — every mutation reuses the `parse → mutate → serialize → onSCXMLChange('structure')` shape already established by `handleAddRootState`.
- **Race condition caught and guarded, not silently ignored:** Task 9 Step 4 identified that React Flow's own drag-end `onNodesChange` event fires independently of the new `onNodeDragStop` handler for the same gesture, which would double-write position/reparent state — `justReparentedIdsRef` filters that stale change out, and Task 10 Step 3's un-nest branch was updated to set the same ref so both nest and un-nest are covered.
