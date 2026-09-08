import { describe, it, expect } from 'vitest';
import {
  computeParallelGroupBBoxes,
  computeRegionSeparationTranslations,
  computeLiveParallelDividerXs,
  type NodeRect,
  type LiveNode,
} from './parallel-group-bbox';
import type { AutoParallelGroupInfo } from '@/lib/utils/parallel-group-normalization';

function rect(id: string, x: number, y: number, width = 100, height = 60): NodeRect {
  return { id, x, y, width, height };
}

describe('computeParallelGroupBBoxes', () => {
  it('returns nothing when there are no groups', () => {
    expect(computeParallelGroupBBoxes([], new Map())).toEqual([]);
  });

  it('computes the union bounding box of two single-member regions placed side by side', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }] },
    ];
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 300, 0)],
    ]);
    const [box] = computeParallelGroupBBoxes(groups, nodeRects, 20);
    expect(box.parallelId).toBe('P');
    expect(box.containerId).toBeNull();
    // Union of A(0,0,100,60) and B(300,0,100,60), padded by 20 on every side.
    expect(box.x).toBe(-20);
    expect(box.y).toBe(-20);
    expect(box.width).toBe(300 + 100 + 40);
    expect(box.height).toBe(60 + 40);
  });

  it('computes a per-region sub-bbox for a multi-member region', () => {
    const groups: AutoParallelGroupInfo[] = [
      {
        containerId: null,
        parallelId: 'P',
        regions: [{ memberIds: ['A', 'B'] }, { memberIds: ['C'] }],
      },
    ];
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 0, 200)],
      ['C', rect('C', 400, 0)],
    ]);
    const [box] = computeParallelGroupBBoxes(groups, nodeRects, 10);
    expect(box.regions).toHaveLength(2);
    const abRegion = box.regions.find((r) => r.memberIds.includes('A'))!;
    // A(0,0,100,60) union B(0,200,100,60), padded by 10.
    expect(abRegion.x).toBe(-10);
    expect(abRegion.y).toBe(-10);
    expect(abRegion.width).toBe(100 + 20);
    expect(abRegion.height).toBe(260 + 20);
  });

  it('skips a group entirely when none of its members have a known position', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['Missing'] }] },
    ];
    expect(computeParallelGroupBBoxes(groups, new Map())).toEqual([]);
  });

  it('ignores a region whose members are unpositioned but still includes the group if another region has positions', () => {
    const groups: AutoParallelGroupInfo[] = [
      {
        containerId: null,
        parallelId: 'P',
        regions: [{ memberIds: ['A'] }, { memberIds: ['Missing'] }],
      },
    ];
    const nodeRects = new Map([['A', rect('A', 0, 0)]]);
    const [box] = computeParallelGroupBBoxes(groups, nodeRects, 0);
    expect(box.regions).toHaveLength(1);
    expect(box.regions[0].memberIds).toEqual(['A']);
  });

  it('places one vertical divider line at the midpoint between two side-by-side regions', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }] },
    ];
    // A spans x=[0,100], B spans x=[300,400] — midpoint of the gap is 200.
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 300, 0)],
    ]);
    const [box] = computeParallelGroupBBoxes(groups, nodeRects, 0);
    expect(box.dividerLines).toEqual([200]);
  });

  it('places one divider line per gap for 3+ regions, in left-to-right order regardless of input order', () => {
    const groups: AutoParallelGroupInfo[] = [
      {
        containerId: null,
        parallelId: 'P',
        // Deliberately listed out of left-to-right order.
        regions: [{ memberIds: ['C'] }, { memberIds: ['A'] }, { memberIds: ['B'] }],
      },
    ];
    // A=[0,100], B=[200,300], C=[500,600] — gaps' midpoints: 150, 400.
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 200, 0)],
      ['C', rect('C', 500, 0)],
    ]);
    const [box] = computeParallelGroupBBoxes(groups, nodeRects, 0);
    expect(box.dividerLines).toEqual([150, 400]);
  });

  it('has no divider lines for a single-region group', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }] },
    ];
    const nodeRects = new Map([['A', rect('A', 0, 0)]]);
    const [box] = computeParallelGroupBBoxes(groups, nodeRects, 0);
    expect(box.dividerLines).toEqual([]);
  });
});

describe('computeLiveParallelDividerXs', () => {
  function liveNode(
    id: string,
    x: number,
    y: number,
    data?: LiveNode['data'],
    width = 100,
    height = 60
  ): LiveNode {
    return { id, position: { x, y }, width, height, data };
  }

  it('returns nothing when there is no wrapper node', () => {
    expect(computeLiveParallelDividerXs([liveNode('A', 0, 0)])).toEqual([]);
  });

  it('computes the divider from a wrapper node carrying its regions', () => {
    const wrapper = liveNode('P', 0, 0, {
      isParallelGroupWrapper: true,
      regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }],
    });
    const nodes = [wrapper, liveNode('A', 0, 0), liveNode('B', 300, 0)];
    expect(computeLiveParallelDividerXs(nodes)).toEqual([200]);
  });

  it('tracks a member being dragged to a new position, not the value baked into the wrapper at last parse', () => {
    // Regression test: reported symptom was the divider line staying at its
    // old position after dragging a region's member, only catching up once
    // the user clicked elsewhere on the canvas. The wrapper's own data still
    // carries a stale dividerLines value (as it would right after a drag,
    // before/without a fresh SCXML re-parse landing) but the live node
    // positions have already moved — the live computation must follow the
    // live positions, not the stale baked-in value.
    const wrapper = liveNode('P', 0, 0, {
      isParallelGroupWrapper: true,
      regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }],
      // stale, pre-drag value — must be ignored
      ...({ dividerLines: [200] } as any),
    });
    // B was dragged from x=300 to x=700 — new midpoint between A[0,100] and
    // B[700,800] is 400, not the stale 200 baked into the wrapper.
    const nodes = [wrapper, liveNode('A', 0, 0), liveNode('B', 700, 0)];
    expect(computeLiveParallelDividerXs(nodes)).toEqual([400]);
  });

  it('pools divider lines across multiple visible groups', () => {
    const wrapper1 = liveNode('P1', 0, 0, {
      isParallelGroupWrapper: true,
      regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }],
    });
    const wrapper2 = liveNode('P2', 0, 0, {
      isParallelGroupWrapper: true,
      regions: [{ memberIds: ['C'] }, { memberIds: ['D'] }],
    });
    const nodes = [
      wrapper1,
      wrapper2,
      liveNode('A', 0, 0),
      liveNode('B', 300, 0),
      liveNode('C', 1000, 0),
      liveNode('D', 1300, 0),
    ];
    expect(computeLiveParallelDividerXs(nodes).sort((a, b) => a - b)).toEqual([200, 1200]);
  });

  it('ignores a wrapper node with no regions data', () => {
    const wrapper = liveNode('P', 0, 0, { isParallelGroupWrapper: true });
    expect(computeLiveParallelDividerXs([wrapper, liveNode('A', 0, 0)])).toEqual([]);
  });

  it('falls back to default width/height when a node has neither top-level nor data dimensions', () => {
    const wrapper: LiveNode = {
      id: 'P',
      position: { x: 0, y: 0 },
      data: {
        isParallelGroupWrapper: true,
        regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }],
      },
    };
    const a: LiveNode = { id: 'A', position: { x: 0, y: 0 } };
    const b: LiveNode = { id: 'B', position: { x: 300, y: 0 } };
    // A defaults to width 160, so A spans [0,160]; B defaults too, spans
    // [300,460] — midpoint of the gap is (160+300)/2 = 230.
    expect(computeLiveParallelDividerXs([wrapper, a, b])).toEqual([230]);
  });
});

describe('computeRegionSeparationTranslations', () => {
  it('returns no translations when there are no groups', () => {
    expect(computeRegionSeparationTranslations([], new Map())).toEqual(new Map());
  });

  it('returns no translations for a single-region group', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }] },
    ];
    const nodeRects = new Map([['A', rect('A', 0, 0)]]);
    expect(computeRegionSeparationTranslations(groups, nodeRects)).toEqual(new Map());
  });

  it('leaves two already-separated, side-by-side regions untouched', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }] },
    ];
    // A=[0,100], B=[300,400] — plenty of gap already, well past the default gap.
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 300, 0)],
    ]);
    expect(computeRegionSeparationTranslations(groups, nodeRects, 50)).toEqual(new Map());
  });

  it('pushes a region right by the gap when it overlaps the previous region', () => {
    const groups: AutoParallelGroupInfo[] = [
      { containerId: null, parallelId: 'P', regions: [{ memberIds: ['A'] }, { memberIds: ['B'] }] },
    ];
    // A=[0,100], B=[50,150] — B overlaps A by 50.
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 50, 0)],
    ]);
    const translations = computeRegionSeparationTranslations(groups, nodeRects, 20);
    // A stays put (leftmost region never moves); B must start at 100+20=120,
    // so it moves by 120-50=70.
    expect(translations.get('A')).toBeFalsy();
    expect(translations.get('B')).toBe(70);
  });

  it('pulls a region that is fully sandwiched inside another region out to a clean, non-overlapping band', () => {
    const groups: AutoParallelGroupInfo[] = [
      {
        containerId: null,
        parallelId: 'P',
        regions: [{ memberIds: ['A', 'Z'] }, { memberIds: ['B'] }],
      },
    ];
    // Region 1 (A, Z) spans x=[0,600] — Z sits far to the right of A.
    // Region 2 (B) sits at x=[200,300], entirely INSIDE region 1's span —
    // the "sandwiched" case that makes a single straight divider impossible
    // without moving anything.
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['Z', rect('Z', 500, 0)],
      ['B', rect('B', 200, 0)],
    ]);
    const translations = computeRegionSeparationTranslations(groups, nodeRects, 50);
    // Region 1's own members never move (it's the leftmost/reference region).
    expect(translations.get('A')).toBeFalsy();
    expect(translations.get('Z')).toBeFalsy();
    // Region 2 (B) must move to start at region1's right edge (600) + gap (50) = 650.
    expect(translations.get('B')).toBe(450); // 650 - 200
  });

  it('orders 3+ regions by current leftmost x and cumulatively separates them', () => {
    const groups: AutoParallelGroupInfo[] = [
      {
        containerId: null,
        parallelId: 'P',
        // Deliberately listed out of left-to-right order.
        regions: [{ memberIds: ['C'] }, { memberIds: ['A'] }, { memberIds: ['B'] }],
      },
    ];
    // A=[0,100] (leftmost, stays put), B=[80,180] (overlaps A), C=[900,1000] (already clear of B).
    const nodeRects = new Map([
      ['A', rect('A', 0, 0)],
      ['B', rect('B', 80, 0)],
      ['C', rect('C', 900, 0)],
    ]);
    const translations = computeRegionSeparationTranslations(groups, nodeRects, 20);
    expect(translations.get('A')).toBeFalsy();
    // B must start at 100+20=120, moves by 120-80=40.
    expect(translations.get('B')).toBe(40);
    // C is already at 900, past B's new right edge (120+100+20=240) — untouched.
    expect(translations.get('C')).toBeFalsy();
  });
});
