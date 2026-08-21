'use client';

import React from 'react';
import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
  type EdgeMarker,
  type Node,
  MarkerType,
  Position,
  useNodes,
  useReactFlow,
} from 'reactflow';
import {
  getSmartEdge,
  pathfindingAStarNoDiagonal,
  type PathFindingFunction,
  type SVGDrawFunction,
} from '@tisoap/react-flow-smart-edge';
import type { Waypoint } from '@/types/visual-metadata';
import {
  buildRoundedOrthogonalPath,
  buildSelfLoopPath,
  buildSmoothBezierPath,
} from '@/lib/layout/path-builders';
import {
  approximateOrthogonalRoute,
  routeIntersectsAnyRect,
  simplifyOrthogonalGridPath,
  type HandleSide,
  type Rect,
} from '@/lib/layout/edge-obstacle-utils';
import { getTransitionColor } from '@/lib/consts/transition-colors';
import { isNoteId } from '@/types/visual-metadata';

export interface SCXMLTransitionEdgeData {
  event?: string;
  condition?: string;
  actions?: string[];
  labelOffset?: { x: number; y: number };
  offset?: number; // Path offset for parallel edges
  labelOffsetX?: number; // Label X-axis offset — used when the edge bows horizontally (top/bottom handles)
  labelOffsetY?: number; // Label Y-axis offset — used when the edge bows vertically (left/right handles)
  fullLabel?: string; // Full label text for tooltip
  displayEvent?: string; // "after 2s" / "after 714ms" / "after (expr) s" for _t_ time-transition edges
  waypoints?: Waypoint[]; // Waypoint control points for edge routing

  // Handlers for waypoint editing
  onWaypointDrag?: (
    edgeId: string,
    index: number,
    x: number,
    y: number
  ) => void;
  onWaypointDragEnd?: (edgeId: string, index: number) => void;
  onWaypointDelete?: (edgeId: string, index: number) => void;
  onWaypointAdd?: (
    edgeId: string,
    x: number,
    y: number,
    insertIndex: number
  ) => void;
}

// A* over the routing grid with orthogonal moves only. The library's own
// variants run PF.Util.smoothenPath on the result, which cuts line-of-sight
// *diagonal* shortcuts — instead, apply rectilinear smoothing to the raw grid
// walk: staircases collapse into long straight segments and single L-bends,
// verified cell-by-cell against the grid so the path keeps avoiding nodes.
const generateOrthogonalPath: PathFindingFunction = (grid, start, end) => {
  const result = pathfindingAStarNoDiagonal(grid, start, end);
  if (!result) return null;
  const simplified = simplifyOrthogonalGridPath(result.fullPath, (x, y) =>
    grid.isWalkableAt(x, y)
  );
  return { fullPath: result.fullPath, smoothedPath: simplified };
};

// Draw the grid walk in smoothstep style: orthogonal segments, rounded corners
const drawSmoothStepPath: SVGDrawFunction = (source, target, path) =>
  buildRoundedOrthogonalPath(source, target, path, 8);

/**
 * Calculate an offset smoothstep path for parallel edges
 * Creates a stepped path with perpendicular offset for cleaner routing
 */
function getOffsetSmoothStepPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  offset,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  offset: number;
}): [string, number, number] {
  // Use getSmoothStepPath with offset parameter
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: offset, // This offsets the path perpendicular to the direct line
  });

  // Return path and label position from getSmoothStepPath (already accounts for offset)
  return [path, labelX, labelY];
}

/**
 * Waypoint Handle Component - Draggable control point
 */
const WaypointHandle: React.FC<{
  edgeId: string;
  index: number;
  x: number;
  y: number;
  onDrag?: (edgeId: string, index: number, x: number, y: number) => void;
  onDragEnd?: (edgeId: string, index: number) => void;
  onDelete?: (edgeId: string, index: number) => void;
  condition?: string;
  event?: string;
}> = ({ edgeId, index, x, y, onDrag, onDragEnd, onDelete, condition, event }) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const { screenToFlowPosition } = useReactFlow();

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.stopPropagation();
      moveEvent.preventDefault();

      const flowPosition = screenToFlowPosition({
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });

      onDrag?.(edgeId, index, flowPosition.x, flowPosition.y);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd?.(edgeId, index);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete?.(edgeId, index);
  };
  const waypointColor = getTransitionColor(condition, event);
  return (
    <g>
      {/* Larger invisible hit area for easier interaction */}
      <circle
        cx={x}
        cy={y}
        r={12}
        fill='transparent'
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          pointerEvents: 'all',
          // stroke: getTransitionColor(condition, event),
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
      />
      {/* Visible waypoint circle */}
      <circle
        cx={x}
        cy={y}
        r={isDragging ? 7 : isHovered ? 6 : 5}
        fill={isDragging ? waypointColor : isHovered ? waypointColor : '#fff'}
        stroke={waypointColor}
        strokeWidth={2}
        style={{
          pointerEvents: 'none', // Hit area handles events
          transition: isDragging ? 'none' : 'all 0.15s ease',
        }}
      />
    </g>
  );
};

export const SCXMLTransitionEdge: React.FC<
  EdgeProps<SCXMLTransitionEdgeData>
> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
  style,
}) => {
  // Safely extract data properties FIRST
  const event = data?.event;
  const condition = data?.condition;
  const actions = data?.actions || [];
  const labelOffset = data?.labelOffset || { x: 0, y: 0 };
  const offset = data?.offset || 0;
  const labelOffsetX = data?.labelOffsetX || 0;
  const labelOffsetY = data?.labelOffsetY || 0;
  const displayEvent = data?.displayEvent;
  const waypoints = data?.waypoints || [];
  const onWaypointDrag = data?.onWaypointDrag;
  const onWaypointDragEnd = data?.onWaypointDragEnd;
  const onWaypointDelete = data?.onWaypointDelete;

  const nodes = useNodes();
  const isSelfLoop = source === target;

  // Self-loops default to bottom/top handles on the SAME node — those two
  // points are vertically aligned through the node's own body, so a plain
  // smoothstep path between them cuts straight through it. Route a small
  // loop out past the node's right edge instead.
  const selfLoopPath = React.useMemo(() => {
    if (!isSelfLoop || waypoints.length > 0) return null;
    const node = nodes.find((n) => n.id === source);
    if (!node || !node.width || !node.height) return null;
    const pos = node.positionAbsolute ?? node.position;
    return buildSelfLoopPath(
      sourceX,
      sourceY,
      targetX,
      targetY,
      pos.x,
      pos.y,
      node.width,
      node.height
    );
  }, [isSelfLoop, waypoints.length, nodes, source, sourceX, sourceY, targetX, targetY]);

  // Obstacle-avoiding path for the default (no waypoints, no parallel offset)
  // case: when the plain smoothstep route would cut through a sibling node,
  // fall back to A* pathfinding around node bounding boxes. Null means "no
  // collision (or pathfinding unavailable) — keep the plain smoothstep path".
  const smartPath = React.useMemo(() => {
    if (isSelfLoop || waypoints.length > 0 || offset !== 0) return null;

    const sourceNode = nodes.find((n) => n.id === source);
    if (!sourceNode) return null;

    // Only nodes at the edge's own hierarchy level count as obstacles —
    // including an enclosing container would wall off routing inside it.
    // Notes are annotations, not diagram structure, so edges must ignore
    // them entirely rather than routing around them.
    const siblings = nodes.filter(
      (n) =>
        n.parentNode === sourceNode.parentNode &&
        !n.hidden &&
        !isNoteId(n.id)
    );

    const nodeRect = (n: Node): Rect | null => {
      const pos = n.positionAbsolute ?? n.position;
      if (!n.width || !n.height) return null;
      return { x: pos.x, y: pos.y, width: n.width, height: n.height };
    };

    const obstacles = siblings
      .filter((n) => n.id !== source && n.id !== target)
      .map(nodeRect)
      .filter((r): r is Rect => r !== null);
    if (obstacles.length === 0) return null;

    // Cheap pre-check: approximate the smoothstep route and only run A* when
    // it actually crosses a node.
    const directRoute = approximateOrthogonalRoute(
      { x: sourceX, y: sourceY },
      sourcePosition as unknown as HandleSide,
      { x: targetX, y: targetY },
      targetPosition as unknown as HandleSide
    );
    if (!routeIntersectsAnyRect(directRoute, obstacles)) return null;

    try {
      return getSmartEdge({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        nodes: siblings,
        options: {
          // Orthogonal step routing drawn with rounded corners to match the
          // smoothstep style of the other edges — the defaults produce
          // diagonal smoothed curves.
          generatePath: generateOrthogonalPath,
          drawEdge: drawSmoothStepPath,
        },
      });
    } catch {
      return null;
    }
  }, [
    isSelfLoop,
    nodes,
    waypoints.length,
    offset,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  ]);

  // Calculate edge path - prioritize waypoints over other rendering modes
  let edgePath: string;
  let labelX: number;
  let labelY: number;
  if (waypoints.length > 0) {
    // Use smooth Bezier curve through waypoints for better UX
    [edgePath, labelX, labelY] = buildSmoothBezierPath(
      sourceX,
      sourceY,
      waypoints,
      targetX,
      targetY
    );
  } else if (selfLoopPath) {
    [edgePath, labelX, labelY] = selfLoopPath;
  } else if (offset > 0) {
    // Use smoothstep path with offset for parallel edges
    [edgePath, labelX, labelY] = getOffsetSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      offset,
    });
  } else if (smartPath) {
    // Direct route would cut through a sibling node — use the A* path around it
    edgePath = smartPath.svgPathString;
    labelX = smartPath.edgeCenterX;
    labelY = smartPath.edgeCenterY;
  } else {
    // Standard smoothstep path for single edges
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    });
  }

  // Determine edge styling based on transition properties
  const getEdgeColor = () => getTransitionColor(condition, event); // Keep color based on type, selected or not

  const getStrokeStyle = () => {
    if (selected) return 'solid'; // Solid when selected
    if (condition) return 'solid'; // Solid for conditional
    return 'dashed'; // Dashed for non-conditional
  };

  const strokeWidth = selected ? 3 : actions.length > 0 ? 2.5 : 2;
  const edgeColor = getEdgeColor();

  // Create label content — use displayEvent (e.g. "after 2s") for _t_ time-transition edges
  const getLabelContent = () => {
    const parts: string[] = [];
    if (displayEvent ?? event) parts.push(`${displayEvent ?? event}`);
    if (condition) parts.push(`${condition}`);
    if (actions.length > 0)
      parts.push(`/ ${actions.length} action${actions.length > 1 ? 's' : ''}`);
    return parts.join(' ');
  };

  const lineLength = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
  const maxLabelWidth = Math.max(lineLength * 0.7, 60);

  const labelContent = getLabelContent();

  // Update marker color to match edge color
  const updatedMarkerEnd =
    markerEnd && typeof markerEnd === 'object'
      ? ({ ...(markerEnd as EdgeMarker), color: edgeColor } as EdgeMarker)
      : ({
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: edgeColor,
        } as EdgeMarker);

  return (
    <>
      {/* Invisible wider stroke for easier clicking and waypoint addition */}
      <path
        d={edgePath}
        fill='none'
        stroke='transparent'
        strokeWidth={20}
        style={{
          pointerEvents: 'stroke',
          cursor: 'pointer',
        }}
      />

      <defs>
        <marker
          id={id}
          viewBox='0 0 24 24'
          refX='12'
          refY='12'
          markerWidth='10'
          markerHeight='10'
          orient='auto'
        >
          {/* You can put any SVG shape here */}
          <path d='M4 4 L20 12 L4 20 Q8 12, 4 4 Z' fill={edgeColor} />
        </marker>
      </defs>

      <BaseEdge
        path={edgePath}
        markerEnd={`url('#${id}')`}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: strokeWidth,
          strokeDasharray: getStrokeStyle() === 'dashed' ? '8,4' : 'none',
        }}
      />

      {/* Render waypoint handles when edge is selected */}
      {selected && waypoints.length > 0 && (
        <g style={{ pointerEvents: 'all', zIndex: 10001 }}>
          {waypoints.map((waypoint, index) => (
            <WaypointHandle
              key={`waypoint-${id}-${index}`}
              edgeId={id}
              index={index}
              x={waypoint.x}
              y={waypoint.y}
              onDrag={onWaypointDrag}
              onDragEnd={onWaypointDragEnd}
              onDelete={onWaypointDelete}
              condition={condition}
              event={event}
            />
          ))}
        </g>
      )}

      {/* Render label - allow pointer events to pass through to waypoints */}
      {labelContent && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          <foreignObject
            width={maxLabelWidth}
            height={26}
            x={labelX - maxLabelWidth / 2 + labelOffset.x + labelOffsetX}
            y={labelY - 13 + labelOffset.y + labelOffsetY}
            style={{
              overflow: 'hidden',
              zIndex: 10000,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                className='px-2 py-1 rounded text-xs font-semibold'
                style={{
                  fontSize: '10px',
                  lineHeight: '1.2',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: 'fit-content',
                  maxWidth: '100%',
                  zIndex: 10000,
                backgroundColor: getTransitionColor(condition, event),
                  color: '#fff',
                  opacity: 0.95,
                  cursor: 'pointer',
                pointerEvents: 'auto', // Re-enable pointer events only on the label itself
                userSelect: 'none', // Prevent text selection
                WebkitUserSelect: 'none', // Safari/Chrome
                MozUserSelect: 'none', // Firefox
                msUserSelect: 'none', // IE/Edge
                }}
              >
                {labelContent}
              </div>
            </div>
          </foreignObject>
        </g>
      )}
    </>
  );
};
