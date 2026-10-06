import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import {
  getDirectChildStates,
  findParentContainer,
  getInitialIds,
  getSiblingEdges,
  analyzeGroups,
  wouldMergeDistinctGroups,
  wouldConflictIfMarkedInitial,
  isMarkedInitial,
  isParallelRegion,
  findParentEntry,
} from './initial-group-utils';

function doc(scxml: SCXMLDocument['scxml']): SCXMLDocument {
  return { scxml };
}

describe('getDirectChildStates', () => {
  it('returns an empty array when there are no children', () => {
    expect(getDirectChildStates({ '@_version': '1.0' } as any)).toEqual([]);
  });

  it('normalizes a single state to an array', () => {
    const child = { '@_id': 'A' };
    expect(getDirectChildStates({ state: child } as any)).toEqual([child]);
  });

  it('passes through an array of states', () => {
    const children = [{ '@_id': 'A' }, { '@_id': 'B' }];
    expect(getDirectChildStates({ state: children } as any)).toEqual(children);
  });

  it('counts the regions of the root __root_parallel as children of the root', () => {
    const container = { parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      } };
    expect(getDirectChildStates(container as any).map((c) => c['@_id']).sort()).toEqual(['A_region', 'B_region']);
  });

  it('counts any other <parallel> child as one child state', () => {
    const container = {
      state: { '@_id': 'S' },
      parallel: { '@_id': 'P', state: [{ '@_id': 'RegionA' }, { '@_id': 'RegionB' }] },
    };
    expect(getDirectChildStates(container as any).map((c) => c['@_id']).sort()).toEqual(['P', 'S']);
  });

  it('never mutates the container own .state array (repeated calls must not accumulate duplicates)', () => {
    // Reproduces a real bug: pushing children directly onto container.state
    // (instead of a copy) permanently corrupted the document a little more
    // on every call — this function is called many times per single check.
    const ownArray = [{ '@_id': 'flat_sibling' }];
    const container = { state: ownArray, parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      } };

    getDirectChildStates(container as any);
    getDirectChildStates(container as any);
    const thirdCall = getDirectChildStates(container as any);

    expect(ownArray).toEqual([{ '@_id': 'flat_sibling' }]);
    expect(thirdCall.map((c) => c['@_id']).sort()).toEqual(['A_region', 'B_region', 'flat_sibling']);
  });
});

describe('findParentContainer', () => {
  it('finds the scxml root as the parent of a root-level state', () => {
    const scxml = { state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    const d = doc(scxml as any);
    expect(findParentContainer(d, 'A')).toBe(d.scxml);
  });

  it('finds a nested compound state as the parent of its child', () => {
    const child = { '@_id': 'Child' };
    const parent = { '@_id': 'Parent', '@_initial': 'Child', state: child };
    const scxml = { state: [parent] };
    const d = doc(scxml as any);
    expect(findParentContainer(d, 'Child')).toBe(parent);
  });

  it('returns null for an unknown state id', () => {
    const d = doc({ state: [{ '@_id': 'A' }] } as any);
    expect(findParentContainer(d, 'Nope')).toBeNull();
  });

  it('resolves the <scxml> root for a region of __root_parallel', () => {
    const d = doc({ '@_initial': '__root_parallel', parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      } } as any);
    expect(findParentContainer(d, 'B_region')).toBe(d.scxml);
  });

  it('resolves the region for a state inside a region, and the <parallel> for a region', () => {
    const p = { '@_id': 'P', state: [{ '@_id': 'R1', '@_initial': 'X', state: { '@_id': 'X' } }, { '@_id': 'R2' }] };
    const d = doc({ parallel: p } as any);
    expect(findParentContainer(d, 'X')).toBe((p.state as any[])[0]);
    expect(findParentEntry(d, 'R2')).toEqual({ container: p, kind: 'parallel' });
  });
});

describe('getInitialIds', () => {
  it('parses a single-value initial attribute', () => {
    const container = { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(getInitialIds(container as any)).toEqual(new Set(['A']));
  });

  it('parses a multi-value space-separated initial attribute', () => {
    const container = { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'C' }] };
    expect(getInitialIds(container as any)).toEqual(new Set(['A', 'B']));
  });

  it('returns an empty set when there is no initial attribute', () => {
    const container = { state: [{ '@_id': 'A' }] };
    expect(getInitialIds(container as any)).toEqual(new Set());
  });

  it('recognizes a target named via the older <initial> child-element form', () => {
    const container = {
      initial: { transition: { '@_target': 'off' } },
      state: [{ '@_id': 'off' }, { '@_id': 'test_running' }],
    };
    expect(getInitialIds(container as any)).toEqual(new Set(['off']));
  });

  it('unions the <initial> element target with the initial attribute list', () => {
    const container = {
      '@_initial': 'B',
      initial: { transition: { '@_target': 'A' } },
      state: [{ '@_id': 'A' }, { '@_id': 'B' }],
    };
    expect(getInitialIds(container as any)).toEqual(new Set(['A', 'B']));
  });

  it('expands the __root_parallel id in the root initial to all of its regions', () => {
    const container = { '@_initial': '__root_parallel C', state: { '@_id': 'C' }, parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      } };
    expect(getInitialIds(container as any, 'root')).toEqual(new Set(['A_region', 'B_region', 'C']));
  });

  it('treats every child of a <parallel> as Initial (regions are always active)', () => {
    const container = { '@_id': 'P', state: [{ '@_id': 'R1' }, { '@_id': 'R2' }] };
    expect(getInitialIds(container as any, 'parallel')).toEqual(new Set(['R1', 'R2']));
  });
});

describe('getSiblingEdges', () => {
  it('builds an edge for a transition between two siblings', () => {
    const a = { '@_id': 'A', transition: { '@_target': 'B' } };
    const b = { '@_id': 'B' };
    const container = { state: [a, b] };
    expect(getSiblingEdges(container as any)).toEqual([['A', 'B']]);
  });

  it('ignores a transition target that is not a sibling', () => {
    const a = { '@_id': 'A', transition: { '@_target': 'Outside' } };
    const container = { state: [a] };
    expect(getSiblingEdges(container as any)).toEqual([]);
  });

  it('handles multiple transitions on one state', () => {
    const a = { '@_id': 'A', transition: [{ '@_target': 'B' }, { '@_target': 'C' }] };
    const container = { state: [a, { '@_id': 'B' }, { '@_id': 'C' }] };
    expect(getSiblingEdges(container as any)).toEqual([['A', 'B'], ['A', 'C']]);
  });

  it('sees an edge between two regions of __root_parallel', () => {
    const container = {
      parallel: {
        '@_id': '__root_parallel',
        state: [{ '@_id': 'R1', transition: { '@_target': 'R2' } }, { '@_id': 'R2' }],
      },
    };
    expect(getSiblingEdges(container as any)).toEqual([['R1', 'R2']]);
  });
});

describe('analyzeGroups', () => {
  it('assigns a state to its own group when it is the only Initial marker', () => {
    const result = analyzeGroups(['A'], new Set(['A']), []);
    expect(result.groupsByState.get('A')).toBe('A');
    expect(result.conflictedGroups).toEqual([]);
  });

  it('leaves a state with no Initial marker and no connection unassigned', () => {
    const result = analyzeGroups(['A'], new Set(), []);
    expect(result.groupsByState.get('A')).toBeNull();
  });

  it('propagates a group root through a chain of transitions', () => {
    // Initial A -> State1 -> State2 (the spec's Graph A example)
    const childIds = ['A', 'State1', 'State2'];
    const edges: [string, string][] = [['A', 'State1'], ['State1', 'State2']];
    const result = analyzeGroups(childIds, new Set(['A']), edges);
    expect(result.groupsByState.get('State1')).toBe('A');
    expect(result.groupsByState.get('State2')).toBe('A');
    expect(result.conflictedGroups).toEqual([]);
  });

  it('flags a component that contains two different Initial markers', () => {
    const childIds = ['A', 'B'];
    const edges: [string, string][] = [['A', 'B']];
    const result = analyzeGroups(childIds, new Set(['A', 'B']), edges);
    expect(result.conflictedGroups).toEqual([['A', 'B']]);
  });
});

describe('wouldMergeDistinctGroups', () => {
  it('allows connecting two states already in the same group (State1 -> State2)', () => {
    const scxml = {
      '@_initial': 'A',
      state: [
        { '@_id': 'A' },
        { '@_id': 'State1', transition: { '@_target': 'A' } },
        { '@_id': 'State2' },
      ],
    };
    const result = wouldMergeDistinctGroups(doc(scxml as any), 'State1', 'State2');
    expect(result.blocked).toBe(false);
  });

  it('blocks connecting two different Initial States directly, in either direction', () => {
    const scxml = { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'A', 'B').blocked).toBe(true);
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'B', 'A').blocked).toBe(true);
  });

  it("blocks the spec's State2 -> State5 example (bridging two established graphs)", () => {
    const scxml = {
      '@_initial': 'InitialA InitialB',
      state: [
        { '@_id': 'InitialA' },
        { '@_id': 'State1', transition: { '@_target': 'InitialA' } },
        { '@_id': 'State2', transition: { '@_target': 'State1' } },
        { '@_id': 'InitialB' },
        { '@_id': 'State4', transition: { '@_target': 'InitialB' } },
        { '@_id': 'State5', transition: { '@_target': 'State4' } },
      ],
    };
    const result = wouldMergeDistinctGroups(doc(scxml as any), 'State2', 'State5');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('InitialA');
    expect(result.reason).toContain('InitialB');
  });

  it('allows two unassigned states to connect to each other', () => {
    const scxml = { state: [{ '@_id': 'X' }, { '@_id': 'Y' }] };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'X', 'Y').blocked).toBe(false);
  });

  it('allows an unassigned state to join an existing group', () => {
    const scxml = {
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'Island' }],
    };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'A', 'Island').blocked).toBe(false);
  });

  it('does not block when source and target have different parents (handled elsewhere)', () => {
    const scxml = {
      state: [
        { '@_id': 'P1', '@_initial': 'A', state: { '@_id': 'A' } },
        { '@_id': 'P2', '@_initial': 'B', state: { '@_id': 'B' } },
      ],
    };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'A', 'B').blocked).toBe(false);
  });

  it('allows an unassigned root sibling to connect to another, next to __root_parallel (reproduces the "conflicts with itself" bug)', () => {
    const scxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      },
      state: [{ '@_id': 'state_3' }, { '@_id': 'state_4' }],
    };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'state_3', 'state_4').blocked).toBe(false);
  });

  it('leaves a transition between two regions of a <parallel> to the cross-region check', () => {
    const scxml = { parallel: { '@_id': 'P', state: [{ '@_id': 'R1' }, { '@_id': 'R2' }] } };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'R1', 'R2').blocked).toBe(false);
  });
});

describe('isMarkedInitial', () => {
  it('reports a listed state as marked initial', () => {
    const scxml = { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(isMarkedInitial(doc(scxml as any), 'A')).toBe(true);
    expect(isMarkedInitial(doc(scxml as any), 'B')).toBe(true);
  });

  it('reports an unlisted state as not marked initial', () => {
    const scxml = { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(isMarkedInitial(doc(scxml as any), 'B')).toBe(false);
  });

  it('reports a state named via the <initial> element form as marked initial', () => {
    const scxml = {
      initial: { transition: { '@_target': 'off' } },
      state: [{ '@_id': 'off' }, { '@_id': 'on' }],
    };
    expect(isMarkedInitial(doc(scxml as any), 'off')).toBe(true);
    expect(isMarkedInitial(doc(scxml as any), 'on')).toBe(false);
  });

  it('reports a region of a <parallel> (or of __root_parallel) as not Initial — regions are always active', () => {
    const d = doc({ '@_initial': '__root_parallel', parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      } } as any);
    expect(isMarkedInitial(d, 'A_region')).toBe(false);
    expect(isParallelRegion(d, 'A_region')).toBe(true);
  });

  it('reports the initial member inside a region as marked initial, and the other member as not', () => {
    const d = doc({ '@_initial': '__root_parallel', parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      } } as any);
    expect(isMarkedInitial(d, 'A')).toBe(true);
    expect(isMarkedInitial(d, 'A2')).toBe(false);
    expect(isParallelRegion(d, 'A')).toBe(false);
  });
});

describe('wouldConflictIfMarkedInitial', () => {
  it('blocks marking a state Initial when it is already connected to another Initial state', () => {
    // main_region (Initial) --event--> state_2, marking state_2 Initial too
    // would merge the chain into one with two Initial markers.
    const scxml = {
      '@_initial': 'main_region',
      state: [
        { '@_id': 'main_region', transition: { '@_target': 'state_2' } },
        { '@_id': 'state_2' },
      ],
    };
    const result = wouldConflictIfMarkedInitial(doc(scxml as any), 'state_2');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('main_region');
  });

  it('blocks marking a state Initial when connected only indirectly through an unassigned intermediate', () => {
    const scxml = {
      '@_initial': 'main_region',
      state: [
        { '@_id': 'main_region', transition: { '@_target': 'mid' } },
        { '@_id': 'mid', transition: { '@_target': 'state_5' } },
        { '@_id': 'state_5' },
      ],
    };
    const result = wouldConflictIfMarkedInitial(doc(scxml as any), 'state_5');
    expect(result.blocked).toBe(true);
  });

  it('allows marking an unconnected, unassigned state Initial', () => {
    const scxml = {
      '@_initial': 'main_region',
      state: [{ '@_id': 'main_region' }, { '@_id': 'island' }],
    };
    expect(wouldConflictIfMarkedInitial(doc(scxml as any), 'island').blocked).toBe(false);
  });

  it('allows marking a state Initial when there is no existing Initial state in the chain yet', () => {
    const scxml = {
      state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }],
    };
    expect(wouldConflictIfMarkedInitial(doc(scxml as any), 'A').blocked).toBe(false);
  });

  it('allows marking a different sibling Initial after the chain has been unmarked back to zero', () => {
    // Reproduces the reassignment flow: unmark A first (chain now has zero
    // Initial markers), then B — the sibling A used to be connected to via a
    // transition — must be markable, since there's no longer any conflict.
    const scxml = {
      state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }],
    };
    expect(wouldConflictIfMarkedInitial(doc(scxml as any), 'B').blocked).toBe(false);
  });

  it('blocks marking a sibling Initial when the existing marker uses the <initial> element form (not the attribute)', () => {
    // Distilled from a real hand-authored document: main_region's Initial is
    // expressed as <initial><transition target="off"/></initial>, with no
    // initial attribute at all. off/test_running/Reset_counter/Error_Oven_stop
    // are all transitively connected, so marking any of the other three must
    // be blocked as a conflict with 'off'.
    const scxml = {
      initial: { transition: { '@_target': 'off' } },
      state: [
        { '@_id': 'off', transition: [{ '@_target': 'test_running' }, { '@_target': 'Reset_counter' }] },
        { '@_id': 'test_running', transition: { '@_target': 'Error_Oven_stop' } },
        { '@_id': 'Reset_counter', transition: { '@_target': 'off' } },
        { '@_id': 'Error_Oven_stop', transition: { '@_target': 'off' } },
      ],
    };
    const result = wouldConflictIfMarkedInitial(doc(scxml as any), 'test_running');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('off');
  });
});
