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

  it('does not collide a fallback-positioned node with an explicitly-positioned sibling', () => {
    const regions = [{ id: 'Left', label: 'Left' }];
    const nodes = new Map<string, RegionLayoutNode[]>([
      [
        'Left',
        [
          { id: 'Explicit', regionId: 'Left', width: 190, height: 80, relativeX: 0, relativeY: 300 },
          { id: 'Fallback', regionId: 'Left', width: 190, height: 80 },
        ],
      ],
    ]);
    const result = computeParallelRegionColumns(regions, nodes);
    const explicit = result.positions.get('Explicit')!;
    const fallback = result.positions.get('Fallback')!;
    expect(explicit.y).toBe(REGION_COLUMN_TOP_MARGIN + 300);
    expect(fallback.y).toBe(REGION_COLUMN_TOP_MARGIN);
    expect(fallback.y).not.toBe(explicit.y);
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
