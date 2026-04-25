import type { Waypoint } from '@/types/visual-metadata';

export interface Point {
  x: number;
  y: number;
}

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
