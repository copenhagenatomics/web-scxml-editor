/**
 * Pure geometry helpers for obstacle-aware edge routing.
 *
 * Used in two places:
 * - Handle assignment (scxml-to-xstate.ts): scoring candidate handle pairs by
 *   how many sibling nodes their approximate route would cut through.
 * - Edge rendering (scxml-transition-edge.tsx): deciding whether the default
 *   smoothstep path collides with a node and pathfinding should kick in.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Anchor point of a handle: a state's side can carry more than one handle
 * (see the anchors feature) — `index`/`count` locate this handle among its
 * `count` siblings on that side, evenly spaced at fraction (index+1)/(count+1).
 * Defaults reproduce the original single-handle midpoint behavior.
 */
export function getHandleAnchor(
  rect: Rect,
  side: HandleSide,
  index = 0,
  count = 1
): Point {
  const frac = (index + 1) / (count + 1);
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width * frac, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.width * frac, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + rect.height * frac };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height * frac };
  }
}

/**
 * Splits a handle id into its side and index. Index 0 uses the bare side
 * name ('top') for backward compatibility with documents/tests predating
 * multi-anchor sides; 'top-2' etc. address a specific additional anchor.
 */
export function parseHandleId(handleId: string): { side: HandleSide; index: number } {
  const [side, indexStr] = handleId.split('-');
  return { side: side as HandleSide, index: indexStr ? parseInt(indexStr, 10) : 0 };
}

// Rects are shrunk by this margin before intersection tests so a path that
// merely grazes a node border (e.g. runs along the face the handle sits on)
// is not counted as cutting through the node.
const GRAZE_EPSILON = 0.5;

/**
 * True when the segment a→b passes through the interior of the rect
 * (Liang-Barsky clipping). Touching or running along a border doesn't count.
 */
export function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  const xmin = rect.x + GRAZE_EPSILON;
  const xmax = rect.x + rect.width - GRAZE_EPSILON;
  const ymin = rect.y + GRAZE_EPSILON;
  const ymax = rect.y + rect.height - GRAZE_EPSILON;
  if (xmin >= xmax || ymin >= ymax) return false;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clips: Array<[number, number]> = [
    [-dx, a.x - xmin],
    [dx, xmax - a.x],
    [-dy, a.y - ymin],
    [dy, ymax - a.y],
  ];

  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return false; // parallel and outside this boundary
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }

  // Strict: a single-point touch (t0 === t1) is not a crossing.
  return t0 < t1;
}

/**
 * Approximate the orthogonal polyline a smoothstep edge takes between two
 * handle anchors. Not pixel-exact — just close enough to count which node
 * rects the real path would cut through.
 *
 * - Same side on both ends (e.g. bottom↔bottom): U-shaped loop extending
 *   `detourOffset` past the outermost anchor.
 * - Opposite facing sides (right↔left, bottom↔top): 3 segments through the
 *   midline between the anchors.
 * - Perpendicular sides: single corner, leaving along the source axis.
 */
export function approximateOrthogonalRoute(
  source: Point,
  sourceSide: HandleSide,
  target: Point,
  targetSide: HandleSide,
  detourOffset = 40
): Point[] {
  const isHorizontalSide = (s: HandleSide) => s === 'left' || s === 'right';

  if (sourceSide === targetSide) {
    switch (sourceSide) {
      case 'bottom': {
        const y = Math.max(source.y, target.y) + detourOffset;
        return [source, { x: source.x, y }, { x: target.x, y }, target];
      }
      case 'top': {
        const y = Math.min(source.y, target.y) - detourOffset;
        return [source, { x: source.x, y }, { x: target.x, y }, target];
      }
      case 'right': {
        const x = Math.max(source.x, target.x) + detourOffset;
        return [source, { x, y: source.y }, { x, y: target.y }, target];
      }
      case 'left': {
        const x = Math.min(source.x, target.x) - detourOffset;
        return [source, { x, y: source.y }, { x, y: target.y }, target];
      }
    }
  }

  if (isHorizontalSide(sourceSide) === isHorizontalSide(targetSide)) {
    if (isHorizontalSide(sourceSide)) {
      const midX = (source.x + target.x) / 2;
      return [
        source,
        { x: midX, y: source.y },
        { x: midX, y: target.y },
        target,
      ];
    }
    const midY = (source.y + target.y) / 2;
    return [
      source,
      { x: source.x, y: midY },
      { x: target.x, y: midY },
      target,
    ];
  }

  if (isHorizontalSide(sourceSide)) {
    return [source, { x: target.x, y: source.y }, target];
  }
  return [source, { x: source.x, y: target.y }, target];
}

function routeCrossesRect(route: Point[], rect: Rect): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    if (segmentIntersectsRect(route[i], route[i + 1], rect)) return true;
  }
  return false;
}

/**
 * Number of distinct rects the route passes through (each rect counted once
 * no matter how many segments cross it).
 */
export function countRouteCrossings(route: Point[], rects: Rect[]): number {
  let count = 0;
  for (const rect of rects) {
    if (routeCrossesRect(route, rect)) count++;
  }
  return count;
}

export function routeIntersectsAnyRect(route: Point[], rects: Rect[]): boolean {
  return rects.some((rect) => routeCrossesRect(route, rect));
}

/**
 * Rectilinear smoothing of an A* grid walk. The raw walk makes diagonal
 * progress as alternating 1-cell horizontal/vertical moves — a staircase.
 * This greedily replaces the longest possible prefix of the remaining walk
 * with a straight segment or a single L-bend, but only when every grid cell
 * along the shortcut is walkable, so the path stays orthogonal AND keeps
 * avoiding obstacles. Returns grid points including inserted L corners.
 */
export function simplifyOrthogonalGridPath(
  path: number[][],
  isWalkable: (x: number, y: number) => boolean
): number[][] {
  if (path.length <= 2) return path;

  const clearStraight = (a: number[], b: number[]): boolean => {
    const dx = Math.sign(b[0] - a[0]);
    const dy = Math.sign(b[1] - a[1]);
    let [x, y] = a;
    while (x !== b[0] || y !== b[1]) {
      x += dx;
      y += dy;
      if (!isWalkable(x, y)) return false;
    }
    return true;
  };

  const lCorner = (
    a: number[],
    b: number[],
    horizontalFirst: boolean
  ): number[] | null => {
    const corner = horizontalFirst ? [b[0], a[1]] : [a[0], b[1]];
    if (!isWalkable(corner[0], corner[1])) return null;
    if (clearStraight(a, corner) && clearStraight(corner, b)) return corner;
    return null;
  };

  const result: number[][] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    const a = path[i];
    let jumped = false;

    for (let j = path.length - 1; j > i; j--) {
      const b = path[j];

      if (a[0] === b[0] || a[1] === b[1]) {
        if (clearStraight(a, b)) {
          result.push(b);
          i = j;
          jumped = true;
          break;
        }
        continue;
      }

      // Prefer the corner that continues the incoming axis so the first leg
      // merges with the previous segment instead of adding a wiggle.
      const prev = result.length >= 2 ? result[result.length - 2] : undefined;
      const incomingHorizontal = prev ? prev[1] === a[1] : true;
      const corner =
        lCorner(a, b, incomingHorizontal) ?? lCorner(a, b, !incomingHorizontal);
      if (corner) {
        result.push(corner, b);
        i = j;
        jumped = true;
        break;
      }
    }

    if (!jumped) {
      result.push(path[i + 1]);
      i++;
    }
  }

  return result;
}
