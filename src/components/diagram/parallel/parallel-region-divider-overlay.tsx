'use client';

import React from 'react';
import { useViewport } from 'reactflow';

export interface ParallelRegionDividerOverlayProps {
  /** Absolute canvas-space x of each vertical divider line — one per gap
   * between horizontally-adjacent regions of a Parallel State group, pooled
   * across every currently-visible group (see ParallelGroupWrapperNode's
   * data.dividerLines, collected in visual-diagram.tsx). */
  dividerXs: number[];
}

/** Transforms a canvas-space x into the current viewport's screen-space x. */
export function computeDividerScreenX(
  canvasX: number,
  viewport: { x: number; y: number; zoom: number }
): number {
  return canvasX * viewport.zoom + viewport.x;
}

/**
 * Full-height vertical divider lines between Initial-state work trees,
 * rendered as a viewport-synced overlay sibling to <ReactFlow> rather than
 * embedded in any one node — a divider line always spans the entire visible
 * canvas top-to-bottom, independent of any group's own bounding box, so
 * there's no boxed-in working area left over once the group is large or the
 * user pans around it. Only the horizontal position (which region gap a
 * line marks) is tied to canvas coordinates and moves/scales with pan/zoom;
 * the vertical extent is always the full container height.
 *
 * Purely decorative: pointer-events are disabled throughout so it never
 * intercepts clicks meant for real state nodes or the canvas underneath.
 */
export const ParallelRegionDividerOverlay: React.FC<ParallelRegionDividerOverlayProps> = ({
  dividerXs,
}) => {
  const viewport = useViewport();

  if (dividerXs.length === 0) return null;

  return (
    <div
      data-testid='parallel-region-divider-overlay'
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {dividerXs.map((canvasX, index) => (
        <div
          key={index}
          data-testid={`parallel-full-height-divider-${index}`}
          style={{
            position: 'absolute',
            left: computeDividerScreenX(canvasX, viewport),
            top: 0,
            bottom: 0,
            borderLeft: '2px dashed rgba(124, 58, 237, 0.5)',
          }}
        />
      ))}
    </div>
  );
};
