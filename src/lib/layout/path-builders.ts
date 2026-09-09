import type { Waypoint } from '@/types/visual-metadata';

export interface Point {
  x: number;
  y: number;
}

// Matches src/lib/layout/edge-obstacle-utils.ts's HandleSide — not imported
// from there to keep this module dependency-free, but kept structurally
// identical (both alias reactflow's Position enum's string values).
export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Build polyline path (straight segments through waypoints)
 * Returns: [pathString, labelX, labelY]
 */
export function buildPolylinePath(
  sourceX: number,
  sourceY: number,
  waypoints: Waypoint[],
  targetX: number,
  targetY: number
): [string, number, number] {
  const points: Point[] = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY },
  ];

  // Build SVG path with straight line segments
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x},${points[i].y}`;
  }

  // Calculate label position - only move if waypoint is nearby
  const midIndex = Math.floor(points.length / 2);

  // Default position at midpoint
  let labelX = points[midIndex].x;
  let labelY = points[midIndex].y;

  // Check if any waypoint is too close to label (within 30px radius)
  const minDistance = 30;
  const hasNearbyWaypoint = waypoints.some((wp) => {
    const distance = Math.sqrt(
      Math.pow(wp.x - labelX, 2) + Math.pow(wp.y - labelY, 2)
    );
    return distance < minDistance;
  });

  // Only adjust position if waypoint is actually nearby
  if (hasNearbyWaypoint && points.length > 2) {
    // Try positioning between segments to find a clear spot
    let bestX = labelX;
    let bestY = labelY;
    let maxMinDistance = 0;

    // Check positions between each pair of points
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const candidateX = (p1.x + p2.x) / 2;
      const candidateY = (p1.y + p2.y) / 2;

      // Find minimum distance to any waypoint
      const minDistToWaypoint = Math.min(
        ...waypoints.map((wp) =>
          Math.sqrt(
            Math.pow(wp.x - candidateX, 2) + Math.pow(wp.y - candidateY, 2)
          )
        )
      );

      // Use position with maximum distance to nearest waypoint
      if (minDistToWaypoint > maxMinDistance) {
        maxMinDistance = minDistToWaypoint;
        bestX = candidateX;
        bestY = candidateY;
      }
    }

    labelX = bestX;
    labelY = bestY;
  }

  return [path, labelX, labelY];
}

/**
 * Build a smoothstep-style SVG path (axis-aligned segments with rounded
 * corners) from an A* grid route. Matches the look of ReactFlow's
 * getSmoothStepPath so obstacle-avoiding edges render consistently with the
 * plain ones.
 *
 * Grid points are snapped to the pathfinding grid, so the hops between the
 * real source/target and the grid can be slightly diagonal — elbows are
 * inserted there to keep every segment orthogonal.
 */
// Shared by buildRoundedOrthogonalPath and getOrthogonalPathMidpoint so the
// label position is always derived from the exact same corner list the line
// itself is drawn through — see getOrthogonalPathMidpoint for why this
// matters (the smart-edge library's own "edge center" is computed from a
// different, unrelated point list and does not track the rendered path).
function computeOrthogonalCorners(
  source: Point,
  target: Point,
  gridPath: number[][],
  targetSide?: HandleSide
): Point[] {
  const raw: Point[] = [
    source,
    ...gridPath.map(([x, y]) => ({ x, y })),
    target,
  ];

  // Insert elbows for diagonal hops, choosing the elbow whose second leg
  // lines up with the neighboring segment so it merges away below.
  const ortho: Point[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = ortho[ortho.length - 1];
    const curr = raw[i];
    if (prev.x === curr.x && prev.y === curr.y) continue; // duplicate
    if (prev.x !== curr.x && prev.y !== curr.y) {
      const next = raw[i + 1];
      const before = ortho[ortho.length - 2];
      let elbow: Point;
      if (next && next.y === curr.y) {
        elbow = { x: prev.x, y: curr.y };
      } else if (next && next.x === curr.x) {
        elbow = { x: curr.x, y: prev.y };
      } else if (before && before.y === prev.y) {
        elbow = { x: curr.x, y: prev.y };
      } else {
        elbow = { x: prev.x, y: curr.y };
      }
      ortho.push(elbow);
    }
    ortho.push(curr);
  }

  // Drop collinear middle points so each remaining point is a real corner
  const pts: Point[] = [];
  ortho.forEach((p, i) => {
    if (i === 0 || i === ortho.length - 1) {
      pts.push(p);
      return;
    }
    const a = ortho[i - 1];
    const b = ortho[i + 1];
    const collinear =
      (a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y);
    if (!collinear) pts.push(p);
  });

  // The A* grid search that produces gridPath is only constrained to reach a
  // cell near the target — nothing forces its last hop to arrive from the
  // side the target's handle is actually on, so the final segment above can
  // legitimately end up on the wrong axis (e.g. horizontal into a 'top'
  // handle). SVG's orient="auto" marker rotates strictly from that segment's
  // tangent, so a wrong-axis final segment renders as an arrowhead pointing
  // sideways into the node instead of through its handle.
  //
  // Every consecutive pair in `pts` already shares an x or a y (that's what
  // the elbow-insertion above guarantees), so when the axis is wrong, `prev`
  // is guaranteed to share the *other* coordinate with target — e.g. for a
  // 'top' target, prev.y === target.y already (the route already arrived
  // level with the handle, just from the wrong side). Inserting a brand-new
  // detour past that point would make the line double back on itself — the
  // route already went as far as target's own row/column, so backing out to
  // some further offset and back in reads as a stray loop right at the
  // arrowhead. Instead, slide the *earlier* corner (before prev) so the turn
  // toward target happens there instead of at prev — reusing distance the
  // path already covers rather than adding a new detour.
  if (targetSide && pts.length >= 2) {
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const beforePrev = pts.length >= 3 ? pts[pts.length - 3] : null;
    const needsVertical = targetSide === 'top' || targetSide === 'bottom';
    const isAligned = needsVertical ? prev.x === last.x : prev.y === last.y;
    // Reusing beforePrev only pays off if the resulting final segment is
    // long enough to carry a full rounded corner — otherwise the existing
    // half-leg radius clamp (below, in buildRoundedOrthogonalPath) shrinks
    // toward 0 on the short segment, rendering as a sharp corner right next
    // to the arrowhead instead of the usual rounded one. The stub fallback
    // guarantees this same minimum length, so require it here too.
    const minApproachLength = 12;
    const beforePrevUsable = beforePrev
      ? needsVertical
        ? Math.abs(beforePrev.y - last.y) >= minApproachLength
        : Math.abs(beforePrev.x - last.x) >= minApproachLength
      : false;
    if (!isAligned && beforePrev && beforePrevUsable) {
      pts[pts.length - 2] = needsVertical
        ? { x: last.x, y: beforePrev.y }
        : { x: beforePrev.x, y: last.y };
    } else if (!isAligned) {
      // No usable earlier corner to reuse (the route arrives at prev almost
      // directly from source, or the earlier corner is also too close to
      // target) — fall back to a short perpendicular stub, accepting the
      // small added detour since there's no existing geometry to reuse.
      const stub = minApproachLength;
      const approach: Point = needsVertical
        ? { x: last.x, y: last.y + (targetSide === 'top' ? -stub : stub) }
        : { x: last.x + (targetSide === 'left' ? -stub : stub), y: last.y };
      const elbow: Point = needsVertical
        ? { x: prev.x, y: approach.y }
        : { x: approach.x, y: prev.y };
      pts.splice(pts.length - 1, 0, elbow, approach);
    }
  }

  return pts;
}

export function buildRoundedOrthogonalPath(
  source: Point,
  target: Point,
  gridPath: number[][],
  borderRadius = 8,
  targetSide?: HandleSide
): string {
  const pts = computeOrthogonalCorners(source, target, gridPath, targetSide);

  if (pts.length < 2) return `M ${source.x},${source.y}`;

  // Step `dist` from an axis-aligned corner toward a neighbor point
  const stepToward = (from: Point, to: Point, dist: number): Point => ({
    x: from.x + Math.sign(to.x - from.x) * dist,
    y: from.y + Math.sign(to.y - from.y) * dist,
  });

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const lenIn = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y);
    const lenOut = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
    // Half-leg clamp so adjacent corners on a short segment can't overlap
    const r = Math.min(borderRadius, lenIn / 2, lenOut / 2);
    const inPt = stepToward(p1, p0, r);
    const outPt = stepToward(p1, p2, r);
    d += ` L ${inPt.x},${inPt.y} Q ${p1.x},${p1.y} ${outPt.x},${outPt.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

/**
 * Midpoint (by arc length) of the corner-to-corner route that
 * buildRoundedOrthogonalPath renders — i.e. a point that actually sits on the
 * visible line. Needed because @tisoap/react-flow-smart-edge's own
 * `edgeCenterX/edgeCenterY` is computed from its raw, unsimplified A* grid
 * walk rather than the simplified/rounded path we actually draw, so it can
 * land far from the rendered line whenever the two point lists diverge
 * (which they normally do for anything but a dead-straight route).
 */
export function getOrthogonalPathMidpoint(
  source: Point,
  target: Point,
  gridPath: number[][],
  targetSide?: HandleSide
): Point {
  const pts = computeOrthogonalCorners(source, target, gridPath, targetSide);
  if (pts.length === 0) return source;
  if (pts.length === 1) return pts[0];

  const segmentLengths = pts.slice(1).map((p, i) => {
    const prev = pts[i];
    return Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
  });
  const totalLength = segmentLengths.reduce((sum, len) => sum + len, 0);

  let remaining = totalLength / 2;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (remaining <= segLen || i === segmentLengths.length - 1) {
      const t = segLen === 0 ? 0 : remaining / segLen;
      const p1 = pts[i];
      const p2 = pts[i + 1];
      return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    }
    remaining -= segLen;
  }
  return pts[Math.floor(pts.length / 2)];
}

/**
 * Build a self-loop path for a transition whose source and target are the
 * same node. The default bottom/top handles are vertically aligned through
 * the node's own body — a plain smoothstep path between them cuts straight
 * through the box. This instead routes a small rectangular loop out past the
 * node's right edge, so the loop is always drawn outside the node bounds.
 */
export function buildSelfLoopPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  bulge = 40,
  borderRadius = 8
): [string, number, number] {
  const stub = Math.max(8, Math.min(20, Math.abs(sourceY - targetY) / 4));
  const outX = nodeX + nodeWidth + bulge;

  const p1: Point = { x: sourceX, y: sourceY + stub };
  const p2: Point = { x: outX, y: sourceY + stub };
  const p3: Point = { x: outX, y: targetY - stub };
  const p4: Point = { x: targetX, y: targetY - stub };

  const path = buildRoundedOrthogonalPath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    [
      [p1.x, p1.y],
      [p2.x, p2.y],
      [p3.x, p3.y],
      [p4.x, p4.y],
    ],
    borderRadius
  );

  const labelX = outX;
  const labelY = (p2.y + p3.y) / 2;

  return [path, labelX, labelY];
}

/**
 * Build smooth Bezier curve through waypoints
 * Uses Catmull-Rom spline for smooth interpolation
 */
export function buildSmoothBezierPath(
  sourceX: number,
  sourceY: number,
  waypoints: Waypoint[],
  targetX: number,
  targetY: number
): [string, number, number] {
  const points: Point[] = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY },
  ];

  if (points.length === 2) {
    // No waypoints - use simple line
    return buildPolylinePath(sourceX, sourceY, waypoints, targetX, targetY);
  }

  // Use Catmull-Rom spline for smooth curves
  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Calculate control points for smooth curve
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  // Calculate label position - only move if waypoint is nearby
  const midIndex = Math.floor(points.length / 2);

  // Default position at midpoint
  let labelX = points[midIndex].x;
  let labelY = points[midIndex].y;

  // Check if any waypoint is too close to label (within 30px radius)
  const minDistance = 30;
  const hasNearbyWaypoint = waypoints.some((wp) => {
    const distance = Math.sqrt(
      Math.pow(wp.x - labelX, 2) + Math.pow(wp.y - labelY, 2)
    );
    return distance < minDistance;
  });

  // Only adjust position if waypoint is actually nearby
  if (hasNearbyWaypoint && points.length > 2) {
    // Try positioning between segments to find a clear spot
    let bestX = labelX;
    let bestY = labelY;
    let maxMinDistance = 0;

    // Check positions between each pair of points
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const candidateX = (p1.x + p2.x) / 2;
      const candidateY = (p1.y + p2.y) / 2;

      // Find minimum distance to any waypoint
      const minDistToWaypoint = Math.min(
        ...waypoints.map((wp) =>
          Math.sqrt(
            Math.pow(wp.x - candidateX, 2) + Math.pow(wp.y - candidateY, 2)
          )
        )
      );

      // Use position with maximum distance to nearest waypoint
      if (minDistToWaypoint > maxMinDistance) {
        maxMinDistance = minDistToWaypoint;
        bestX = candidateX;
        bestY = candidateY;
      }
    }

    labelX = bestX;
    labelY = bestY;
  }

  return [path, labelX, labelY];
}
