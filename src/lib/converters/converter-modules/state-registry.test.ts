import { describe, it, expect } from 'vitest';
import { registerAllStates, type StateRegistryEntry } from './state-registry';
import { getAttribute, getElements } from './visual-metadata';

function run(root: any) {
  const stateRegistry = new Map<string, StateRegistryEntry>();
  const hierarchyMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();
  const claimedStates = new Set<string>();
  registerAllStates(root, '', stateRegistry, hierarchyMap, parentMap, claimedStates, getAttribute, getElements);
  return { stateRegistry, hierarchyMap, parentMap };
}

describe('registerAllStates — hand-authored <parallel> (regression guard)', () => {
  it('registers a hand-authored parallel and its regions normally (drillable)', () => {
    const root = {
      state: [
        {
          '@_id': 'Container',
          parallel: {
            '@_id': 'Manual',
            state: [{ '@_id': 'RegionA' }, { '@_id': 'RegionB' }],
          },
        },
      ],
    };
    const { stateRegistry, parentMap } = run(root);
    expect(stateRegistry.get('Manual')?.elementType).toBe('parallel');
    expect(parentMap.get('Manual')).toBe('Container');
    expect(parentMap.get('RegionA')).toBe('Manual');
    expect(parentMap.get('RegionB')).toBe('Manual');
  });
});

describe('registerAllStates — viz:auto-parallel flattening', () => {
  it('does not create a registry entry for an auto-parallel wrapper or its members registry-wise as children of it', () => {
    const root = {
      state: [
        {
          '@_id': 'Container',
          parallel: {
            '@_id': 'Container_parallel',
            '@_viz:auto-parallel': 'true',
            state: [{ '@_id': 'A' }, { '@_id': 'B' }],
          },
        },
      ],
    };
    const { stateRegistry } = run(root);
    expect(stateRegistry.has('Container_parallel')).toBe(false);
  });

  it('registers bare single-member regions directly under the original container id', () => {
    const root = {
      state: [
        {
          '@_id': 'Container',
          parallel: {
            '@_id': 'Container_parallel',
            '@_viz:auto-parallel': 'true',
            state: [{ '@_id': 'A' }, { '@_id': 'B' }],
          },
        },
      ],
    };
    const { stateRegistry, parentMap, hierarchyMap } = run(root);
    expect(parentMap.get('A')).toBe('Container');
    expect(parentMap.get('B')).toBe('Container');
    expect(stateRegistry.get('A')?.elementType).toBe('state');
    expect(hierarchyMap.get('Container')?.sort()).toEqual(['A', 'B']);
  });

  it('unwraps an auto-region multi-member group, registering its members directly under the original container id', () => {
    const root = {
      state: [
        {
          '@_id': 'Container',
          parallel: {
            '@_id': 'Container_parallel',
            '@_viz:auto-parallel': 'true',
            state: [
              {
                '@_id': 'main_region_region',
                '@_initial': 'main_region',
                '@_viz:auto-region': 'true',
                state: [
                  { '@_id': 'main_region', transition: { '@_event': 'event', '@_target': 'state_1' } },
                  { '@_id': 'state_1' },
                ],
              },
              { '@_id': 'state_2' },
            ],
          },
        },
      ],
    };
    const { stateRegistry, parentMap, hierarchyMap } = run(root);
    expect(stateRegistry.has('main_region_region')).toBe(false);
    expect(parentMap.get('main_region')).toBe('Container');
    expect(parentMap.get('state_1')).toBe('Container');
    expect(parentMap.get('state_2')).toBe('Container');
    expect(hierarchyMap.get('Container')?.sort()).toEqual(['main_region', 'state_1', 'state_2']);
  });

  it('recurses correctly into a flattened member that is itself a compound state', () => {
    const root = {
      state: [
        {
          '@_id': 'Container',
          parallel: {
            '@_id': 'Container_parallel',
            '@_viz:auto-parallel': 'true',
            state: [
              { '@_id': 'A', state: [{ '@_id': 'A_child' }] },
              { '@_id': 'B' },
            ],
          },
        },
      ],
    };
    const { stateRegistry, parentMap } = run(root);
    expect(parentMap.get('A_child')).toBe('A');
    expect(stateRegistry.get('A')?.isContainer).toBe(true);
    expect(stateRegistry.get('A')?.children).toEqual(['A_child']);
  });
});
