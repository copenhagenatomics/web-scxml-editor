import { describe, it, expect } from 'vitest';
import {
  isInitialState,
  computeParallelGroupWrapperNodes,
  separateParallelRegions,
  markParallelGroupMembers,
} from './layout-positioning';
import { getAttribute as realGetAttribute, getElements as realGetElements } from './visual-metadata';
import type { AutoParallelGroupInfo } from '@/lib/utils/parallel-group-normalization';
import type { HierarchicalNode } from '@/types/hierarchical-node';

function getAttribute(element: any, attrName: string): string | undefined {
  return element?.[`@_${attrName}`];
}
function getElements(parent: any, elementName: string): any {
  return parent?.[elementName];
}

describe('isInitialState', () => {
  it('returns true for a single-value root initial (existing behavior)', () => {
    const rootScxml = { '@_initial': 'A' };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }]]);
    expect(isInitialState('A', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('B', '', rootScxml, registry as any, getAttribute, getElements)).toBe(false);
  });

  it('returns true for every id listed in a multi-value root initial', () => {
    const rootScxml = { '@_initial': 'A B' };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }], ['C', { state: {} }]]);
    expect(isInitialState('A', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('B', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('C', '', rootScxml, registry as any, getAttribute, getElements)).toBe(false);
  });

  it('returns true for every id listed in a multi-value nested-parent initial', () => {
    const parentState = { '@_initial': 'ChildA ChildB' };
    const registry = new Map([['Parent', { state: parentState }]]);
    const rootScxml = {};
    expect(
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(true);
    expect(
      isInitialState('ChildB', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(true);
    expect(
      isInitialState('ChildC', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(false);
  });

  it('does not throw for a compound state using the <initial> child-element form (no @_initial attribute), using the real getAttribute helper', () => {
    // Reproduces the reported crash: getAttribute('initial')'s unprefixed
    // fallback returns the parsed <initial> child-element object (not a
    // string) when only that form is used, since 'initial' the attribute and
    // 'initial' the child element share the same unprefixed property key.
    const parentState = {
      initial: { transition: { '@_target': 'ChildB' } },
    };
    const registry = new Map([['Parent', { state: parentState }]]);
    const rootScxml = {};

    expect(() =>
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).not.toThrow();

    // The <initial> element's own transition target is still recognized.
    expect(
      isInitialState('ChildB', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
    expect(
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(false);
  });

  it('does not throw for a root using the <initial> child-element form (no @_initial attribute), using the real getAttribute helper', () => {
    const rootScxml = {
      initial: { transition: { '@_target': 'B' } },
    };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }]]);

    expect(() =>
      isInitialState('A', '', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).not.toThrow();

    expect(
      isInitialState('B', '', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
  });

  it('recovers Initial status for a flattened member of an auto-wrapped root <parallel> (bare region)', () => {
    // After parallel-group-normalization wraps 2+ root work trees, the
    // root's own @_initial becomes the <parallel>'s id, not the members'
    // ids — isInitialState must fall back to the wrapper's own structure.
    const rootScxml = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        '@_viz:auto-parallel': 'true',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      },
    };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }]]);
    expect(
      isInitialState('A', '', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
    expect(
      isInitialState('B', '', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
  });

  it('recovers Initial status for a flattened member of an auto-wrapped nested <parallel> (multi-member auto-region)', () => {
    const parentState = {
      '@_id': 'Parent',
      '@_initial': 'Parent_parallel',
      parallel: {
        '@_id': 'Parent_parallel',
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
    const registry = new Map([['Parent', { state: parentState }]]);
    const rootScxml = {};
    expect(
      isInitialState('main_region', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
    expect(
      isInitialState('state_1', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(false);
    expect(
      isInitialState('state_2', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
  });
});

function node(id: string, x: number, y: number, parentId?: string): HierarchicalNode {
  return {
    id,
    type: 'scxmlState',
    position: { x, y },
    data: { label: id, stateType: 'simple', width: 100, height: 60 } as any,
    parentId,
    depth: 0,
  } as unknown as HierarchicalNode;
}

describe('computeParallelGroupWrapperNodes', () => {
  it('returns nothing when there are no groups', () => {
    expect(computeParallelGroupWrapperNodes([node('A', 0, 0)], [])).toEqual([]);
  });

  it('synthesizes one wrapper node per group, parented under the container, with clicks passing through to member nodes except via its own drag handle', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }] },
    ];
    const allNodes = [node('A', 0, 0), node('B', 300, 0)];
    const [wrapper] = computeParallelGroupWrapperNodes(allNodes, groups);

    expect(wrapper.id).toBe('P');
    expect(wrapper.type).toBe('scxmlParallelGroupWrapper');
    expect(wrapper.parentId).toBeUndefined();
    expect(wrapper.selectable).toBe(false);
    // Draggable from any empty area within its bounds (dragHandle covers the
    // whole node — see ParallelGroupWrapperNode). Member nodes still get
    // their own clicks first: computeParallelGroupWrapperNodes's caller
    // inserts the wrapper FIRST in the node list (unshift, not push) so it
    // always paints below every member node, regardless of this pointer-
    // events:auto style — see scxml-to-xstate.ts.
    expect(wrapper.draggable).toBe(true);
    expect(wrapper.dragHandle).toBe('.parallel-group-drag-handle');
    expect((wrapper.style as any)?.pointerEvents).toBe('auto');
    expect((wrapper.data as any).isParallelGroupWrapper).toBe(true);
    // Two side-by-side regions get one divider line between them, not a box
    // drawn around each one.
    expect((wrapper.data as any).dividerLines).toHaveLength(1);
    expect((wrapper.data as any).memberIds.sort()).toEqual(['A', 'B']);
  });

  it('parents the wrapper node under its container when nested', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: 'Parent', parallelId: 'Parent_parallel', regions: [{ memberIds: ['X'] }, { memberIds: ['Y'] }] },
    ];
    const allNodes = [node('X', 0, 0, 'Parent'), node('Y', 300, 0, 'Parent')];
    const [wrapper] = computeParallelGroupWrapperNodes(allNodes, groups);
    expect(wrapper.parentId).toBe('Parent');
  });
});

describe('separateParallelRegions', () => {
  it('does nothing when there are no groups', () => {
    const allNodes = [node('A', 0, 0)];
    separateParallelRegions(allNodes, []);
    expect(allNodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('leaves already-separated regions untouched', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }] },
    ];
    const allNodes = [node('A', 0, 0), node('B', 400, 0)];
    separateParallelRegions(allNodes, groups);
    expect(allNodes[0].position).toEqual({ x: 0, y: 0 });
    expect(allNodes[1].position).toEqual({ x: 400, y: 0 });
  });

  it('pulls a region sandwiched inside another region out to a clean non-overlapping band, leaving y untouched', () => {
    // Region 1 (A, Z) spans x=[0,600]; region 2 (B) sits at x=[200,300],
    // entirely inside region 1's span — the interleaved layout the flat ELK
    // pass can produce, which makes a single straight divider impossible
    // without moving anything.
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A', 'Z'] }, { memberIds: ['B'] }] },
    ];
    const allNodes = [node('A', 0, 0), node('Z', 500, 40), node('B', 200, 80)];
    separateParallelRegions(allNodes, groups);
    // Region 1 members never move.
    expect(allNodes[0].position).toEqual({ x: 0, y: 0 });
    expect(allNodes[1].position).toEqual({ x: 500, y: 40 });
    // Region 2 (B) is pushed right of region 1's right edge (600) + default gap.
    const bNode = allNodes.find((n) => n.id === 'B')!;
    expect(bNode.position.x).toBeGreaterThan(600);
    expect(bNode.position.y).toBe(80);
  });
});

describe('markParallelGroupMembers', () => {
  it('does nothing when there are no groups', () => {
    const allNodes = [node('A', 0, 0)];
    markParallelGroupMembers(allNodes, []);
    expect((allNodes[0].data as any).isParallelGroupMember).toBeUndefined();
  });

  it('flags every member of every region as a parallel-group member, leaving unrelated siblings untouched', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A', 'Z'] }, { memberIds: ['B'] }] },
    ];
    const allNodes = [node('A', 0, 0), node('Z', 500, 0), node('B', 200, 0), node('Unrelated', 900, 0)];
    markParallelGroupMembers(allNodes, groups);
    expect((allNodes.find((n) => n.id === 'A')!.data as any).isParallelGroupMember).toBe(true);
    expect((allNodes.find((n) => n.id === 'Z')!.data as any).isParallelGroupMember).toBe(true);
    expect((allNodes.find((n) => n.id === 'B')!.data as any).isParallelGroupMember).toBe(true);
    expect((allNodes.find((n) => n.id === 'Unrelated')!.data as any).isParallelGroupMember).toBeUndefined();
  });
});
