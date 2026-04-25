'use client';

import React from 'react';
import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
  type EdgeMarker,
  MarkerType,
  Position,
  useReactFlow,
} from 'reactflow';
import type { Waypoint } from '@/types/visual-metadata';
import { buildSmoothBezierPath } from '@/lib/layout/path-builders';

export interface SCXMLTransitionEdgeData {
  event?: string;
  condition?: string;
  actions?: string[];
  labelOffset?: { x: number; y: number };
  offset?: number; // Path offset for parallel edges
  labelOffsetY?: number; // Label Y-axis offset for parallel edges
  fullLabel?: string; // Full label text for tooltip
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
}> = ({ edgeId, index, x, y, onDrag, onDragEnd, onDelete, condition }) => {
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
  const waypointColor = condition ? '#ef4444' : '#3b82f6';
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
          // stroke: condition ? '#ef4444' : '#3b82f6',
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
  const labelOffsetY = data?.labelOffsetY || 0;
  const waypoints = data?.waypoints || [];
  const onWaypointDrag = data?.onWaypointDrag;
  const onWaypointDragEnd = data?.onWaypointDragEnd;
  const onWaypointDelete = data?.onWaypointDelete;

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
  const getEdgeColor = () => {
    if (selected) return condition ? '#ef4444' : '#3b82f6'; // Keep color based on type when selected
    if (condition) return '#ef4444'; // red-500 (conditional transitions)
    return '#3b82f6'; // blue-500 (non-conditional/event transitions)
  };

  const getStrokeStyle = () => {
    if (selected) return 'solid'; // Solid when selected
    if (condition) return 'solid'; // Solid for conditional
    return 'dashed'; // Dashed for non-conditional
  };

  const strokeWidth = selected ? 3 : actions.length > 0 ? 2.5 : 2;
  const edgeColor = getEdgeColor();

  // Create label content
  const getLabelContent = () => {
    const parts: string[] = [];
    if (event) parts.push(`${event}`);
    if (condition) parts.push(`${condition}`);
    if (actions.length > 0)
      parts.push(`/ ${actions.length} action${actions.length > 1 ? 's' : ''}`);
    return parts.join(' ');
  };

  // Truncate label to prevent overflow
  const truncateLabel = (text: string, maxLength: number = 15) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const fullLabelContent = getLabelContent();
  const labelContent = truncateLabel(fullLabelContent);

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
            />
          ))}
        </g>
      )}

      {/* Render label - allow pointer events to pass through to waypoints */}
      {labelContent && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          <foreignObject
            width={Math.max(labelContent.length * 8, 60)}
            height={26}
            x={
              labelX - Math.max(labelContent.length * 8, 60) / 2 + labelOffset.x
            }
            y={labelY - 13 + labelOffset.y + labelOffsetY}
            style={{
              overflow: 'visible',
              zIndex: 10000,
              pointerEvents: 'none',
            }}
          >
            <div
              className='px-2 py-1 rounded text-xs font-semibold text-center'
              style={{
                fontSize: '12px',
                lineHeight: '1.2',
                whiteSpace: 'nowrap',
                position: 'relative',
                zIndex: 10000,
                backgroundColor: condition ? '#ef4444' : '#3b82f6', // Red for conditional, blue for non-conditional
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
          </foreignObject>
        </g>
      )}
    </>
  );
};
