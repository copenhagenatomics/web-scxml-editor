import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import {
  updateTransitionTargets,
  removeStateFromDocument,
  getNextTransitionEventName,
  isDescendantOf,
  detachStateFromParent,
  cloneStateSubtreeWithFreshIds,
  rewriteOrDropTransitions,
  resolveCarriedOverInitialIds,
  findStateById,
  findElementById,
  addStateToDocument,
  detachElementFromParent,
  collectExistingIds,
  isFinalState,
  resolveFinalStateRegion,
  findParallelContext,
  addLooseStateToParallel,
} from './scxml-manipulation-utils';
import { getInitialIds, isParallelRegion } from './initial-group-utils';
import { normalizeParallelGroups } from './parallel-group-normalization';

describe('<final> lookups', () => {
  const makeDoc = () =>
    ({
      scxml: {
        state: { '@_id': 'Job', state: { '@_id': 'Work' }, final: { '@_id': 'JobDone' } },
        final: { '@_id': 'Done' },
      },
    }) as any as SCXMLDocument;

  it('findElementById finds <final> elements and reports their tag', () => {
    const d = makeDoc();
    expect(findElementById(d, 'Done')?.tag).toBe('final');
    expect(findElementById(d, 'JobDone')?.tag).toBe('final');
    expect(findElementById(d, 'Work')?.tag).toBe('state');
  });

  it('isFinalState is true only for <final> elements', () => {
    const d = makeDoc();
    expect(isFinalState(d, 'Done')).toBe(true);
    expect(isFinalState(d, 'JobDone')).toBe(true);
    expect(isFinalState(d, 'Job')).toBe(false);
    expect(isFinalState(d, 'missing')).toBe(false);
  });

  it('a <final> added via addStateToDocument survives a real serialize → parse round trip', () => {
    // Mirrors the canvas "F" (Add Final State) button: parse, add, serialize.
    const parser = new SCXMLParser();
    const parsed = parser.parse(
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A"><state id="A"/><state id="Job" initial="Work"><state id="Work"/></state></scxml>'
    );
    const doc = parsed.data!;
    addStateToDocument(doc, { '@_id': 'final_1' } as any, undefined, 'final');
    addStateToDocument(doc, { '@_id': 'final_2' } as any, 'Job', 'final');

    const xml = parser.serialize(doc, true);
    expect(xml).toMatch(/<final id="final_1"/);
    expect(xml).toMatch(/<final id="final_2"/);
    expect(xml).not.toMatch(/<state id="final_/);

    const reparsed = parser.parse(xml).data!;
    expect(findElementById(reparsed, 'final_1')?.tag).toBe('final');
    expect(findElementById(reparsed, 'final_2')?.tag).toBe('final');
  });

  describe('resolveFinalStateRegion (canvas "Add Final State")', () => {
    const doc = () =>
      ({
        scxml: {
          state: { '@_id': 'main_region', state: { '@_id': 'Plain' } },
          parallel: {
            '@_id': 'P',
            state: [
              { '@_id': 'R1', '@_initial': 'A', state: [{ '@_id': 'A', state: { '@_id': 'A1' } }, { '@_id': 'A2' }] },
              { '@_id': 'R2', '@_initial': 'B', state: { '@_id': 'B' } },
              { '@_id': 'Empty' },
            ],
            parallel: { '@_id': 'Q', state: [{ '@_id': 'Q1' }, { '@_id': 'Q2' }] },
          },
        },
      }) as any as SCXMLDocument;

    it('refuses at a top level with no __root_parallel and inside an ordinary compound state', () => {
      expect(resolveFinalStateRegion(doc(), null, ['main_region'])).toEqual({
        error: 'Final states can only be added inside a parallel state.',
      });
      expect('error' in resolveFinalStateRegion(doc(), 'main_region', ['Plain'])).toBe(true);
    });

    it("targets the selected state's region, including for nested selections", () => {
      expect(resolveFinalStateRegion(doc(), 'P', ['A2'])).toEqual({ regionId: 'R1' });
      expect(resolveFinalStateRegion(doc(), 'P', ['A1'])).toEqual({ regionId: 'R1' });
      expect(resolveFinalStateRegion(doc(), 'P', ['B'])).toEqual({ regionId: 'R2' });
    });

    it('refuses a second final state in a region that already has one', () => {
      const d = doc();
      (d.scxml as any).parallel.state[1].final = { '@_id': 'R2Done' };
      const refusal = { error: 'This region already has a final state.' };
      expect(resolveFinalStateRegion(d, 'P', ['R2Done'])).toEqual(refusal);
      expect(resolveFinalStateRegion(d, 'P', ['B'])).toEqual(refusal);
      expect(isDescendantOf(d, 'R2Done', 'R2')).toBe(true);
      expect(isDescendantOf(d, 'R2Done', 'R1')).toBe(false);
      // Other regions are unaffected.
      expect(resolveFinalStateRegion(d, 'P', ['A2'])).toEqual({ regionId: 'R1' });
    });

    it('refuses adding (e.g. pasting) more than one final state into a region at once', () => {
      expect(resolveFinalStateRegion(doc(), 'P', ['B'], 2)).toEqual({
        error: 'This region already has a final state.',
      });
    });

    it('targets an empty region shown as its own node when that node is selected', () => {
      expect(resolveFinalStateRegion(doc(), 'P', ['Empty'])).toEqual({ regionId: 'Empty' });
    });

    it('refuses with no selection, or a selection spanning regions', () => {
      expect(resolveFinalStateRegion(doc(), 'P', [])).toEqual({
        error: 'Select a state in the region where the final state should go.',
      });
      expect(resolveFinalStateRegion(doc(), 'P', ['A', 'B'])).toEqual({
        error: 'Select states from a single region to add a final state.',
      });
    });

    it('refuses when the region is itself a <parallel>', () => {
      expect('error' in resolveFinalStateRegion(doc(), 'P', ['Q1'])).toBe(true);
    });

    it("finds the region through a compound state's transparent {id}__parallel", () => {
      const d = {
        scxml: {
          state: {
            '@_id': 'H',
            '@_initial': 'H__parallel',
            state: { '@_id': 'Loose' },
            parallel: {
              '@_id': 'H__parallel',
              state: [
                { '@_id': 'R1', '@_initial': 'A', state: { '@_id': 'A' } },
                { '@_id': 'R2', '@_initial': 'B', state: { '@_id': 'B' } },
              ],
            },
          },
        },
      } as any as SCXMLDocument;
      expect(resolveFinalStateRegion(d, 'H', ['B'])).toEqual({ regionId: 'R2' });
    });

    it("finds the region through the root's transparent __root_parallel at the top level", () => {
      const d = {
        scxml: {
          '@_initial': '__root_parallel',
          state: { '@_id': 'Loose' },
          parallel: {
            '@_id': '__root_parallel',
            state: [
              { '@_id': 'R1', '@_initial': 'A', state: { '@_id': 'A' } },
              { '@_id': 'R2', '@_initial': 'B', state: { '@_id': 'B' } },
            ],
          },
        },
      } as any as SCXMLDocument;
      expect(resolveFinalStateRegion(d, null, ['B'])).toEqual({ regionId: 'R2' });
      expect(resolveFinalStateRegion(d, undefined, ['A'])).toEqual({ regionId: 'R1' });
      expect(resolveFinalStateRegion(d, null, ['Loose'])).toEqual({
        error: 'Select a state in the region where the final state should go.',
      });
    });

    it('findParallelContext sees explicit and transparent parallels, not ordinary views (paste guard)', () => {
      const d = {
        scxml: {
          '@_initial': '__root_parallel',
          state: { '@_id': 'H', '@_initial': 'H__parallel', state: { '@_id': 'Plain' }, parallel: { '@_id': 'H__parallel', state: [{ '@_id': 'X' }, { '@_id': 'Y' }] } },
          parallel: [
            { '@_id': '__root_parallel', state: [{ '@_id': 'R1' }, { '@_id': 'R2' }] },
            { '@_id': 'P', state: [{ '@_id': 'P1' }, { '@_id': 'P2' }] },
          ],
        },
      } as any as SCXMLDocument;
      expect(findParallelContext(d, null)?.['@_id']).toBe('__root_parallel');
      expect(findParallelContext(d, 'H')?.['@_id']).toBe('H__parallel');
      expect(findParallelContext(d, 'P')?.['@_id']).toBe('P');
      expect(findParallelContext(d, 'Plain')).toBeNull();
      expect(findParallelContext(doc(), null)).toBeNull();
      expect(findParallelContext(doc(), 'main_region')).toBeNull();
    });

    describe('addLooseStateToParallel (canvas "Add State" inside a <parallel>)', () => {
      it('adds the state beside the regions, moved into a transparent {id}__parallel, instead of as a new region', () => {
        const d = doc();
        expect(addLooseStateToParallel(d, 'P', { '@_id': 'New' } as any)).toBe(true);

        const p = findElementById(d, 'P')!;
        expect(p.tag).toBe('state');
        expect((d.scxml as any).parallel).toBeUndefined();
        const el = p.element as any;
        expect(el['@_initial']).toBe('P__parallel');
        expect(el.state['@_id']).toBe('New');
        expect(el.parallel['@_id']).toBe('P__parallel');
        expect(el.parallel.state.map((r: any) => r['@_id'])).toEqual(['R1', 'R2', 'Empty']);
        expect(el.parallel.parallel['@_id']).toBe('Q');
        expect(isParallelRegion(d, 'R1')).toBe(true);
        expect(isParallelRegion(d, 'New')).toBe(false);
        // Not Initial: P's initial stands for its regions only.
        expect(getInitialIds(el, 'state').has('New')).toBe(false);
      });

      it('stays loose through normalization', () => {
        const d = doc();
        addLooseStateToParallel(d, 'P', { '@_id': 'New' } as any);
        expect(normalizeParallelGroups(d).changed).toBe(false);
      });

      it('changes nothing when the target is not a <parallel>', () => {
        const d = doc();
        const before = JSON.stringify(d);
        expect(addLooseStateToParallel(d, 'main_region', { '@_id': 'New' } as any)).toBe(false);
        expect(JSON.stringify(d)).toBe(before);
      });
    });
  });

  it('detaching and re-adding a <final> keeps it a <final>', () => {
    const d = makeDoc();
    const detached = detachElementFromParent(d, 'JobDone');
    expect(detached?.tag).toBe('final');
    addStateToDocument(d, detached!.element, undefined, detached!.tag);
    expect(findElementById(d, 'JobDone')?.tag).toBe('final');
    expect((d.scxml as any).state.final).toBeUndefined();
  });
});

describe('findStateById', () => {
  it('finds a state nested directly inside a <parallel> element', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'P',
          state: [{ '@_id': 'RegionA' }, { '@_id': 'RegionB' }],
        },
      } as any,
    };
    expect(findStateById(d, 'RegionA')?.['@_id']).toBe('RegionA');
  });

  it('finds a <parallel> by its own id (e.g. a compound state converted into a <parallel>)', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: {
          '@_id': 'Outer',
          parallel: { '@_id': 'P', state: [] },
        },
      } as any,
    };
    expect(findStateById(d, 'P')?.['@_id']).toBe('P');
  });

  it('finds a state nested inside a <state> child of a <parallel> element', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'P',
          state: [
            { '@_id': 'RegionA', state: [{ '@_id': 'Deep' }] },
          ],
        },
      } as any,
    };
    expect(findStateById(d, 'Deep')?.['@_id']).toBe('Deep');
  });
});

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
  it('gives a nested <final> a fresh id and keeps internal transitions into it', () => {
    const original = {
      '@_id': 'Job',
      '@_initial': 'Work',
      state: { '@_id': 'Work', transition: { '@_event': 'done', '@_target': 'JobDone' } },
      final: { '@_id': 'JobDone', '@_viz:xywh': '10,20,120,60' },
    };
    const { clone, idMap } = cloneStateSubtreeWithFreshIds(
      original as any,
      new Set(['Job', 'Work', 'JobDone']),
      40,
      40
    );
    rewriteOrDropTransitions(clone, idMap);

    const c = clone as any;
    expect(c.final['@_id']).toBe('JobDone_copy');
    expect(c.final['@_viz:xywh']).toBe('50,60,120,60');
    expect(idMap.get('JobDone')).toBe('JobDone_copy');
    // The internal Work → JobDone transition survives, retargeted to the copy
    expect(c.state.transition['@_target']).toBe('JobDone_copy');
    expect(original.final['@_id']).toBe('JobDone');
  });

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

  it('reuses the original id, with no "_copy" suffix, when it is no longer taken (cut then paste)', () => {
    const original = { '@_id': 'A' };
    const { clone, idMap } = cloneStateSubtreeWithFreshIds(
      original as any,
      new Set(),
      40,
      40
    );
    expect(clone['@_id']).toBe('A');
    expect(idMap.get('A')).toBe('A');
  });

  it('still de-dupes against sibling ids reserved earlier in the same paste', () => {
    const original = { '@_id': 'A' };
    const existingIds = new Set(['A']);
    const { clone } = cloneStateSubtreeWithFreshIds(original as any, existingIds, 40, 40);
    expect(clone['@_id']).toBe('A_copy');
    expect(existingIds.has('A_copy')).toBe(true);
  });

  it('rewrites a legacy <initial> child-element transition target to the new child id', () => {
    const child = { '@_id': 'Child' };
    const original = {
      '@_id': 'Parent',
      state: [child],
      initial: { transition: { '@_target': 'Child' } },
    } as any;
    const { clone } = cloneStateSubtreeWithFreshIds(
      original,
      new Set(['Parent', 'Child']),
      0,
      0
    );
    expect((clone as any).initial.transition['@_target']).toBe('Child_copy');
  });

  it('rewrites every target in an array of <initial> transitions', () => {
    const childA = { '@_id': 'A' };
    const childB = { '@_id': 'B' };
    const original = {
      '@_id': 'Parent',
      state: [childA, childB],
      initial: {
        transition: [{ '@_target': 'A' }, { '@_target': 'B' }],
      },
    } as any;
    const { clone } = cloneStateSubtreeWithFreshIds(
      original,
      new Set(['Parent', 'A', 'B']),
      0,
      0
    );
    expect((clone as any).initial.transition[0]['@_target']).toBe('A_copy');
    expect((clone as any).initial.transition[1]['@_target']).toBe('B_copy');
  });
});

describe('resolveCarriedOverInitialIds', () => {
  it('carries the id over when the copied state was Initial and the target has none', () => {
    const copied = [{ '@_id': 'A' }] as any;
    const idMap = new Map([['A', 'A_copy']]);
    expect(resolveCarriedOverInitialIds(copied, new Set(['A']), idMap, true)).toEqual(['A_copy']);
  });

  it('does nothing when the target container already has an Initial state', () => {
    const copied = [{ '@_id': 'A' }] as any;
    const idMap = new Map([['A', 'A_copy']]);
    expect(resolveCarriedOverInitialIds(copied, new Set(['A']), idMap, false)).toEqual([]);
  });

  it('does nothing when none of the copied states were Initial', () => {
    const copied = [{ '@_id': 'A' }] as any;
    const idMap = new Map([['A', 'A_copy']]);
    expect(resolveCarriedOverInitialIds(copied, new Set(), idMap, true)).toEqual([]);
  });

  it('carries over every formerly-Initial state, not just the first, so a copied Parallel State (2+ regions, each Initial in its own work tree) re-triggers the auto-<parallel>-wrap normalization on paste', () => {
    const copied = [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'C' }] as any;
    const idMap = new Map([['A', 'A_copy'], ['B', 'B_copy'], ['C', 'C_copy']]);
    expect(resolveCarriedOverInitialIds(copied, new Set(['A', 'C']), idMap, true)).toEqual([
      'A_copy',
      'C_copy',
    ]);
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

describe('<parallel> elements keep their tag through lookup, add, detach and clone', () => {
  // main_region is a compound state converted into a <parallel>
  // (parallel-group-normalization.ts), holding two regions.
  const makeDoc = (): SCXMLDocument =>
    ({
      scxml: {
        '@_initial': 'main_region',
        state: { '@_id': 'Other' },
        parallel: {
          '@_id': 'main_region',
          state: [
            { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
            { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
          ],
        },
      },
    }) as any;

  it('findElementById reports the tag of each element', () => {
    const d = makeDoc();
    expect(findElementById(d, 'main_region')?.tag).toBe('parallel');
    expect(findElementById(d, 'A2')?.tag).toBe('state');
    expect(findElementById(d, 'nope')).toBeNull();
  });

  it('addStateToDocument files a <parallel> under .parallel', () => {
    const d = makeDoc();
    addStateToDocument(d, { '@_id': 'P2', state: [] } as any, 'Other', 'parallel');
    const other = d.scxml.state as any;
    expect(other.parallel['@_id']).toBe('P2');
    expect(other.state).toBeUndefined();
  });

  it('detaches a state nested inside a region of a <parallel> (drag-to-nest out of a parallel)', () => {
    const d = makeDoc();
    const detached = detachElementFromParent(d, 'A2');
    expect(detached?.tag).toBe('state');
    expect(detached?.element['@_id']).toBe('A2');
    expect(findStateById(d, 'A2')).toBeNull();
  });

  it('detaches a <parallel> itself, reporting its tag so it can be re-added as one', () => {
    const d = makeDoc();
    const detached = detachElementFromParent(d, 'main_region');
    expect(detached?.tag).toBe('parallel');
    expect(d.scxml.parallel).toBeUndefined();
    addStateToDocument(d, detached!.element, 'Other', detached!.tag);
    expect(findElementById(d, 'main_region')?.tag).toBe('parallel');
  });

  it('never writes an initial onto a <parallel> when detaching one of its regions', () => {
    const d = makeDoc();
    detachElementFromParent(d, 'B_region');
    expect((d.scxml.parallel as any)['@_initial']).toBeUndefined();
  });

  it('isDescendantOf sees through <parallel> children', () => {
    const d = makeDoc();
    expect(isDescendantOf(d, 'A2', 'main_region')).toBe(true);
    expect(isDescendantOf(d, 'main_region', 'A2')).toBe(false);
  });

  it('cloning gives fresh ids to everything under a <parallel> and rewrites its inner transitions', () => {
    const d = makeDoc();
    const region = (d.scxml.parallel as any).state[0];
    region.state[0].transition = { '@_target': 'A2' };
    region.parallel = { '@_id': 'Nested', state: [{ '@_id': 'N1' }, { '@_id': 'N2' }] };
    const existing = new Set(['main_region', 'A_region', 'A', 'A2', 'B_region', 'B', 'Nested', 'N1', 'N2']);
    const { clone, idMap } = cloneStateSubtreeWithFreshIds(d.scxml.parallel as any, existing, 0, 0);
    rewriteOrDropTransitions(clone, idMap);

    expect(idMap.get('Nested')).toBe('Nested_copy');
    expect(idMap.get('N1')).toBe('N1_copy');
    const cloneRegion = (clone as any).state[0];
    expect(cloneRegion['@_initial']).toBe('A_copy');
    expect(cloneRegion.state[0].transition['@_target']).toBe('A2_copy');
  });
});

describe('collectExistingIds', () => {
  const d = (): SCXMLDocument =>
    ({
      scxml: {
        '@_initial': '__root_parallel',
        parallel: {
          '@_id': '__root_parallel',
          state: [
            {
              '@_id': 'R1',
              '@_initial': 'X',
              state: { '@_id': 'X' },
              parallel: { '@_id': 'P', state: [{ '@_id': 'P_region', state: { '@_id': 'Y' } }, { '@_id': 'Z' }] },
              history: { '@_id': 'H' },
            },
            { '@_id': 'R2', final: { '@_id': 'Done' } },
          ],
        },
      },
    }) as any;

  it('includes ids that are never rendered as nodes (regions, __root_parallel) and every element kind', () => {
    const ids = collectExistingIds(d(), [{ id: 'note_1' }]);
    for (const id of ['__root_parallel', 'R1', 'R2', 'X', 'P', 'P_region', 'Y', 'Z', 'H', 'Done', 'note_1']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('makes a copied <parallel> get fresh ids for its regions instead of reusing the originals (no duplicates)', () => {
    const doc = d();
    const source = findElementById(doc, 'P')!.element;
    const copied = JSON.parse(JSON.stringify(source));
    // Rendered nodes alone would not include the hidden region P_region.
    const { idMap } = cloneStateSubtreeWithFreshIds(copied, collectExistingIds(doc, [{ id: 'Y' }]), 0, 0);
    expect(idMap.get('P_region')).toBe('P_region_copy');
    expect(idMap.get('P')).toBe('P_copy');
  });
});

