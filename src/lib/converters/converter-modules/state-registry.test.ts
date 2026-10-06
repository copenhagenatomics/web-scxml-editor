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

describe('registerAllStates — root __root_parallel', () => {
  const root = {
    '@_initial': '__root_parallel',
    parallel: {
      '@_id': '__root_parallel',
      state: [
        { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
        { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
      ],
    },
  };

  it('registers neither __root_parallel nor its regions as nodes', () => {
    const { stateRegistry } = run(root);
    expect(stateRegistry.has('__root_parallel')).toBe(false);
    expect(stateRegistry.has('A_region')).toBe(false);
    expect(stateRegistry.has('B_region')).toBe(false);
  });

  it('registers the contents of the regions at root level', () => {
    const { stateRegistry } = run(root);
    expect(stateRegistry.get('A')?.parentPath).toBe('');
    expect(stateRegistry.get('A2')?.parentPath).toBe('');
    expect(stateRegistry.get('B')?.parentPath).toBe('');
  });

  it('registers a <parallel> region of __root_parallel as a parallel node', () => {
    const { stateRegistry } = run({
      parallel: {
        '@_id': '__root_parallel',
        state: { '@_id': 'S' },
        parallel: { '@_id': 'Q', state: [{ '@_id': 'Q1' }, { '@_id': 'Q2' }] },
      },
    });
    expect(stateRegistry.get('Q')?.elementType).toBe('parallel');
    expect(stateRegistry.get('Q')?.parentPath).toBe('');
  });
});

describe('registerAllStates — <parallel> regions drawn as columns', () => {
  it('registers a <parallel> as a drillable node whose children are the contents of its regions', () => {
    const root = {
      '@_initial': 'main_region',
      parallel: {
        '@_id': 'main_region',
        state: [
          { '@_id': 'A_region', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'A2' }] },
          { '@_id': 'B_region', '@_initial': 'B', state: { '@_id': 'B' } },
        ],
      },
    };
    const { stateRegistry, parentMap, hierarchyMap } = run(root);
    expect(stateRegistry.get('main_region')?.elementType).toBe('parallel');
    expect(stateRegistry.has('A_region')).toBe(false);
    expect(hierarchyMap.get('main_region')?.sort()).toEqual(['A', 'A2', 'B']);
    expect(parentMap.get('A')).toBe('main_region');
    expect(parentMap.get('B')).toBe('main_region');
  });

  it('registers an empty region as the node itself', () => {
    const { stateRegistry, parentMap } = run({
      parallel: { '@_id': 'P', state: [{ '@_id': 'Empty' }, { '@_id': 'R', state: { '@_id': 'X' } }] },
    });
    expect(stateRegistry.has('Empty')).toBe(true);
    expect(parentMap.get('Empty')).toBe('P');
    expect(parentMap.get('X')).toBe('P');
  });

  it('keeps a hand-written <parallel> nested in an ordinary state drillable the same way', () => {
    const { stateRegistry, parentMap } = run({
      state: [
        {
          '@_id': 'Container',
          parallel: { '@_id': 'Manual', state: [{ '@_id': 'RegionA' }, { '@_id': 'RegionB' }] },
        },
      ],
    });
    expect(stateRegistry.get('Manual')?.elementType).toBe('parallel');
    expect(parentMap.get('Manual')).toBe('Container');
    expect(parentMap.get('RegionA')).toBe('Manual');
  });
});

describe('registerAllStates — __root_parallel is only transparent directly under <scxml>', () => {
  it('registers a nested <parallel> named __root_parallel as an ordinary drillable parallel', () => {
    const { stateRegistry, parentMap } = run({
      state: {
        '@_id': 'Outer',
        parallel: { '@_id': '__root_parallel', state: [{ '@_id': 'R1' }, { '@_id': 'R2' }] },
      },
    });
    expect(stateRegistry.get('__root_parallel')?.elementType).toBe('parallel');
    expect(parentMap.get('__root_parallel')).toBe('Outer');
    expect(parentMap.get('R1')).toBe('__root_parallel');
  });
});
