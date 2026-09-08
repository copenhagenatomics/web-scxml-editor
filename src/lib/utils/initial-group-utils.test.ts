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

  it('flattens bare-region members of an auto-wrapped <parallel> child in as direct children', () => {
    const container = {
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      },
    };
    expect(getDirectChildStates(container as any).map((c) => c['@_id']).sort()).toEqual(['A', 'B']);
  });

  it('flattens the members of a multi-member auto-region two levels in as direct children', () => {
    const container = {
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [
          {
            '@_id': 'main_region_region',
            '@_initial': 'main_region',
            '@_viz:auto-region': 'true',
            state: [{ '@_id': 'main_region' }, { '@_id': 'state_1' }],
          },
          { '@_id': 'state_2' },
        ],
      },
    };
    expect(getDirectChildStates(container as any).map((c) => c['@_id']).sort()).toEqual([
      'main_region',
      'state_1',
      'state_2',
    ]);
  });

  it('does not flatten a hand-authored <parallel> child (no viz:auto-parallel marker)', () => {
    const container = {
      parallel: { '@_id': 'Manual', state: [{ '@_id': 'RegionA' }, { '@_id': 'RegionB' }] },
    };
    expect(getDirectChildStates(container as any)).toEqual([]);
  });

  it('never mutates the container\'s own .state array when flattening an auto-wrapped parallel (repeated calls must not accumulate duplicates)', () => {
    // Reproduces a real bug: since JS arrays are passed by reference, pushing
    // the flattened parallel members directly onto container.state (instead
    // of a copy) permanently corrupts the document — every subsequent call
    // (this function is called many times per single connection check, via
    // findParentContainer's recursive search, getInitialIds, and
    // getSiblingEdges all calling it again on the same container) re-adds
    // the same members again, producing duplicate ids in the result and,
    // downstream, a state showing up as "conflicting with itself" in
    // wouldMergeDistinctGroups.
    const ownArray = [{ '@_id': 'flat_sibling' }];
    const container = {
      state: ownArray,
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      },
    };

    getDirectChildStates(container as any);
    getDirectChildStates(container as any);
    const thirdCall = getDirectChildStates(container as any);

    expect(ownArray).toEqual([{ '@_id': 'flat_sibling' }]);
    expect(thirdCall.map((c) => c['@_id']).sort()).toEqual(['A', 'B', 'flat_sibling']);
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

  it('resolves the logical (pre-wrap) container for a bare-region member of an auto-wrapped root <parallel>', () => {
    // Reproduces the reported bug: after two Initial States get auto-wrapped,
    // findParentContainer must still resolve to the root scxml element for a
    // bare-region member, not fail to find it because it's now nested inside
    // <parallel> rather than a direct <state> child.
    const scxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      },
    };
    const d = doc(scxml as any);
    expect(findParentContainer(d, 'B')).toBe(d.scxml);
  });

  it('resolves the logical container for a member nested inside a multi-member auto-region', () => {
    const scxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [
          {
            '@_id': 'main_region_region',
            '@_initial': 'main_region',
            '@_viz:auto-region': 'true',
            state: [{ '@_id': 'main_region' }, { '@_id': 'state_1' }],
          },
          { '@_id': 'state_2' },
        ],
      },
    };
    const d = doc(scxml as any);
    expect(findParentContainer(d, 'state_1')).toBe(d.scxml);
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

  it('does not re-add a bare region that @_initial no longer names, even though it is still physically present in the <parallel> (reproduces the "uncheck does nothing" bug)', () => {
    // This is the intermediate shape ToggleInitialStateCommand now produces
    // when unmarking a wrapped state: it writes the real remaining token
    // list straight onto @_initial, without itself restructuring the still-
    // wrapped <parallel> (that's normalizeParallelGroups's job, on the next
    // pass). A bare region's mere physical presence must not override an
    // @_initial that already resolves to real tokens.
    const container = {
      '@_initial': 'A B',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'C' }],
      },
    };
    expect(getInitialIds(container as any)).toEqual(new Set(['A', 'B']));
  });

  it('recovers the real Initial ids from an auto-wrapped <parallel> child, once @_initial itself only names the parallel', () => {
    const container = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [
          {
            '@_id': 'main_region_region',
            '@_initial': 'main_region',
            '@_viz:auto-region': 'true',
            state: [{ '@_id': 'main_region' }, { '@_id': 'state_1' }],
          },
          { '@_id': 'state_2' },
        ],
      },
    };
    expect(getInitialIds(container as any)).toEqual(new Set(['main_region', 'state_2']));
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

  it('sees an edge between two members flattened out of a multi-member auto-region', () => {
    const container = {
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [
          {
            '@_id': 'main_region_region',
            '@_initial': 'main_region',
            '@_viz:auto-region': 'true',
            state: [
              { '@_id': 'main_region', transition: { '@_target': 'state_1' } },
              { '@_id': 'state_1' },
            ],
          },
          { '@_id': 'state_2' },
        ],
      },
    };
    expect(getSiblingEdges(container as any)).toEqual([['main_region', 'state_1']]);
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

  it('allows connecting a bare-region member of an auto-wrapped <parallel> to an unassigned flat sibling outside it (reproduces the "conflicts with itself" bug)', () => {
    // Before the array-mutation fix, getDirectChildStates corrupted
    // container.state on every call (this function alone triggers several,
    // via findParentContainer's recursive search, getInitialIds and
    // getSiblingEdges), duplicating state_1's id in childIds — which made
    // analyzeGroups see two "different" Initial roots that were actually
    // the same id ("rooted at 'state_1' and 'state_1'"), incorrectly
    // blocking a perfectly legal island-joins-a-group connection.
    const scxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'main_region' }, { '@_id': 'state_2' }, { '@_id': 'state_1' }],
      },
      state: [{ '@_id': 'state_3' }, { '@_id': 'state_4' }],
    };
    const result = wouldMergeDistinctGroups(doc(scxml as any), 'state_1', 'state_3');
    expect(result.blocked).toBe(false);
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

  it('reports a bare-region member of an auto-wrapped <parallel> as marked initial (reproduces the State Actions panel checkbox bug)', () => {
    // Before the fix, findParentContainer could not see through <parallel>
    // to find this state's real container, so isMarkedInitial always
    // returned false for any wrapped member — the "Initial State" checkbox
    // showed unchecked (and toggling did nothing useful) even though the
    // diagram's own "Initial" badge was rendered.
    const scxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      },
    };
    expect(isMarkedInitial(doc(scxml as any), 'A')).toBe(true);
    expect(isMarkedInitial(doc(scxml as any), 'B')).toBe(true);
  });

  it('reports the initial member of a multi-member auto-region as marked initial, and the non-initial member as not', () => {
    const scxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [
          {
            '@_id': 'main_region_region',
            '@_initial': 'main_region',
            '@_viz:auto-region': 'true',
            state: [{ '@_id': 'main_region' }, { '@_id': 'state_1' }],
          },
          { '@_id': 'state_2' },
        ],
      },
    };
    expect(isMarkedInitial(doc(scxml as any), 'main_region')).toBe(true);
    expect(isMarkedInitial(doc(scxml as any), 'state_1')).toBe(false);
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
