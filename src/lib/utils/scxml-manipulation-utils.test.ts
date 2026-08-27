import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import {
  updateTransitionTargets,
  removeStateFromDocument,
  getNextTransitionEventName,
  isDescendantOf,
  detachStateFromParent,
  cloneStateSubtreeWithFreshIds,
  rewriteOrDropTransitions,
} from './scxml-manipulation-utils';

describe('updateTransitionTargets', () => {
  it('updates a single-value root initial (existing behavior)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    updateTransitionTargets(d, 'A', 'A2');
    expect(d.scxml['@_initial']).toBe('A2');
  });

  it('replaces only the matching token in a multi-value root initial', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    updateTransitionTargets(d, 'A', 'A2');
    expect(d.scxml['@_initial']).toBe('A2 B');
  });

  it('replaces only the matching token in a nested compound state initial', () => {
    const child = { '@_id': 'ChildA' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA ChildB', state: [child, { '@_id': 'ChildB' }] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    updateTransitionTargets(d, 'ChildA', 'ChildA2');
    expect((parent as any)['@_initial']).toBe('ChildA2 ChildB');
  });
});

describe('removeStateFromDocument', () => {
  it('drops the removed id from a multi-value root initial without touching the rest', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    removeStateFromDocument(d, 'A');
    expect(d.scxml['@_initial']).toBe('B');
  });

  it('clears the root initial attribute entirely when the removed id was the only one (no forced fallback at root)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }] } as any };
    removeStateFromDocument(d, 'A');
    expect(d.scxml['@_initial']).toBeUndefined();
  });

  it('auto-falls-back to a remaining sibling when a nested compound parent would otherwise lose its only initial', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA', state: [childA, childB] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    removeStateFromDocument(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });

  it('drops just the removed token from a nested compound parent that still has another initial marker', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA ChildB', state: [childA, childB] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    removeStateFromDocument(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });
});

describe('getNextTransitionEventName', () => {
  it('returns event1 for a document with no transitions', () => {
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }] } as any };
    expect(getNextTransitionEventName(d)).toBe('event1');
  });

  it('skips numbers already used anywhere in the document', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'event1', '@_target': 'B' } },
          { '@_id': 'B', transition: { '@_event': 'event2', '@_target': 'A' } },
        ],
      } as any,
    };
    expect(getNextTransitionEventName(d)).toBe('event3');
  });

  it('finds the first free gap rather than always appending', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'event1', '@_target': 'B' } },
          { '@_id': 'B', transition: { '@_event': 'event3', '@_target': 'A' } },
        ],
      } as any,
    };
    expect(getNextTransitionEventName(d)).toBe('event2');
  });

  it('checks transitions nested inside parallel regions and child states', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: [
          {
            '@_id': 'P',
            state: [
              { '@_id': 'P1', transition: { '@_event': 'event1', '@_target': 'P2' } },
              { '@_id': 'P2' },
            ],
          },
        ],
      } as any,
    };
    expect(getNextTransitionEventName(d)).toBe('event2');
  });

  it('treats every token inside a comma-separated @_event list as used', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'event1, event2', '@_target': 'B' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    expect(getNextTransitionEventName(d)).toBe('event3');
  });
});

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
    expect((clone as any)['@_viz:xywh']).toBe('140,140,120,60');
  });

  it('leaves a state with no viz:xywh untouched (no crash)', () => {
    const original = { '@_id': 'A' } as any;
    const { clone } = cloneStateSubtreeWithFreshIds(original, new Set(['A']), 40, 40);
    expect((clone as any)['@_viz:xywh']).toBeUndefined();
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
