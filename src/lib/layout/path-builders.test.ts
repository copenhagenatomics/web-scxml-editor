import { describe, it, expect } from 'vitest';
import {
  buildRoundedOrthogonalPath,
  getOrthogonalPathMidpoint,
} from './path-builders';

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

describe('buildRoundedOrthogonalPath — target handle alignment', () => {
  // Reproduces a real reported case: an A*-routed transition into a 'top'
  // handle whose grid route approaches the target laterally rather than
  // from directly above. Nothing in the A* search forces the last hop to
  // arrive from the handle's own side, so without correction the final
  // rendered segment is horizontal — and since the SVG arrowhead marker
  // uses orient="auto" (rotating strictly from that segment's tangent), the
  // arrow renders pointing sideways into the node instead of down through
  // its handle.
  it('forces the final approach segment vertical for a route that arrives sideways into a top handle', () => {
    const d = buildRoundedOrthogonalPath(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      [
        [50, 0],
        [50, 100],
      ],
      8,
      'top'
    );

    // The last two coordinate pairs in the drawn path define the segment
    // the arrowhead marker is rotated to.
    const coords = d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)!;
    const [finalX, finalY] = coords[coords.length - 1]
      .split(',')
      .map(Number);
    const [prevX, prevY] = coords[coords.length - 2].split(',').map(Number);

    expect([finalX, finalY]).toEqual([100, 100]);
    // Same x as the target (vertical approach)...
    expect(prevX).toBe(finalX);
    // ...arriving from above (smaller y), matching a 'top' handle.
    expect(prevY).toBeLessThan(finalY);
  });

  it('falls back to a short stub when there is no earlier corner to reuse', () => {
    // Only two points at all (no corner before "prev" to slide) — the
    // fallback stub path is the only option here.
    const d = buildRoundedOrthogonalPath(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      [],
      8,
      'top'
    );

    const coords = d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)!;
    const [finalX, finalY] = coords[coords.length - 1]
      .split(',')
      .map(Number);
    const [prevX, prevY] = coords[coords.length - 2].split(',').map(Number);

    expect([finalX, finalY]).toEqual([100, 50]);
    expect(prevX).toBe(finalX);
    expect(prevY).toBeLessThan(finalY);
  });

  it('leaves an already axis-aligned approach unchanged', () => {
    const withoutTargetSide = buildRoundedOrthogonalPath(
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      [],
      8
    );
    const withTargetSide = buildRoundedOrthogonalPath(
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      [],
      8,
      'top'
    );

    expect(withTargetSide).toBe(withoutTargetSide);
  });
});

describe('getOrthogonalPathMidpoint — target handle alignment', () => {
  it('accounts for the corrected corner so the midpoint still lands on the rendered line', () => {
    const midpoint = getOrthogonalPathMidpoint(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      [
        [50, 0],
        [50, 100],
      ],
      'top'
    );

    // Corrected route: (0,0) -> (50,0) -> (100,0) -> (100,100) — the
    // (50,100) corner slides up to (100,0), reusing the existing (50,0)
    // corner's height rather than adding a new detour. Total length =
    // 50 + 50 + 100 = 200; halfway (100) lands exactly on the (100,0) corner.
    expect(midpoint).toEqual({ x: 100, y: 0 });
  });
});
