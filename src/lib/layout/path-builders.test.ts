import { describe, it, expect } from 'vitest';
import { getOrthogonalPathMidpoint } from './path-builders';

describe('getOrthogonalPathMidpoint', () => {
  it('returns the exact midpoint of a straight two-point route', () => {
    const midpoint = getOrthogonalPathMidpoint(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      []
    );
    expect(midpoint).toEqual({ x: 50, y: 0 });
  });

  it('stays on the rendered line for an L-shaped route with very unequal legs', () => {
    // A short horizontal leg (10px) followed by a long vertical leg (100px) —
    // this is exactly the shape that broke @tisoap/react-flow-smart-edge's
    // own edgeCenterX/edgeCenterY, which picks the point at the middle INDEX
    // of the raw, unsimplified A* grid walk rather than the middle of arc
    // length along the actual simplified/rendered path. Because the grid
    // walk samples the long leg far more densely than the short one, its
    // "middle index" point lands off both legs entirely (e.g. around
    // x=5, y=50) — a point that is nowhere near the visible line, which
    // only ever has x=0 (on the horizontal leg) or x=10 (on the vertical
    // leg). getOrthogonalPathMidpoint must always land on one of the actual
    // corner-to-corner segments instead.
    const midpoint = getOrthogonalPathMidpoint(
      { x: 0, y: 0 },
      { x: 10, y: 100 },
      [[10, 0]]
    );

    // Total route length is 110 (10 horizontal + 100 vertical); the halfway
    // point (55) falls 45px into the vertical leg, so it must sit exactly on
    // that leg (x === 10), never at some off-line blend of both legs.
    expect(midpoint.x).toBe(10);
    expect(midpoint.y).toBeCloseTo(45, 5);
  });

  it('falls back to the source point when there are no corners', () => {
    const point = { x: 3, y: 7 };
    expect(getOrthogonalPathMidpoint(point, point, [])).toEqual(point);
  });
});
