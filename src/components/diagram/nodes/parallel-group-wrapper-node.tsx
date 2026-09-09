'use client';

import React, { memo } from 'react';
import { type NodeProps } from 'reactflow';
import type { SCXMLStateNodeData } from './scxml-state-node';

export interface ParallelGroupWrapperNodeProps
  extends NodeProps<
    SCXMLStateNodeData & {
      isParallelGroupWrapper?: boolean;
      width?: number;
      height?: number;
      /** Absolute x of each vertical divider line, one per gap between
       * horizontally-adjacent regions. Rendered separately, full-height,
       * by ParallelRegionDividerOverlay — this node only carries the data
       * through so visual-diagram.tsx can collect it from the nodes array. */
      dividerLines?: number[];
    }
  > {}

/**
 * Invisible positioning anchor + drag zone for 2+ auto-detected
 * Initial-state work trees (see
 * src/lib/utils/parallel-group-normalization.ts and
 * computeParallelGroupWrapperNodes). Unlike HistoryWrapperNode, this never
 * represents a real drillable/selectable state in its own right — the
 * underlying <parallel> element it corresponds to is deliberately never
 * shown as a separate state, per the feature's own requirement, so this
 * component has no click/navigate handler and no visible content at all —
 * no border, no background, no label. The only visual cue for the group is
 * the full-height vertical divider lines rendered separately by
 * ParallelRegionDividerOverlay (a viewport-synced overlay spanning the
 * whole visible canvas, not just this node's own bounds).
 *
 * The whole root carries the `.parallel-group-drag-handle` class — the
 * `dragHandle` selector configured on the node — and stays pointer-events
 * auto, so the group can still be grabbed from any empty area within its
 * bounds and dragged as a unit (visual-diagram.tsx translates every member
 * node by the same delta). Real member nodes render as separate, later-
 * painted elements at their own screen positions, so a click that actually
 * lands on a member state still reaches that state first — only genuinely
 * empty space within the group's bounds falls through to this drag zone.
 */
export const ParallelGroupWrapperNode = memo<ParallelGroupWrapperNodeProps>(({ data, id }) => {
  const { isParallelGroupWrapper = false } = data;

  if (!isParallelGroupWrapper) {
    return null;
  }

  const width = (data as any).width || 300;
  const height = (data as any).height || 200;

  return (
    <div
      className='parallel-group-wrapper-node parallel-group-drag-handle'
      data-testid={`parallel-group-wrapper-${id}`}
      title='Drag to move the whole Parallel State group'
      style={{
        width,
        height,
        border: 'none',
        backgroundColor: 'transparent',
        position: 'relative',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: 'grab',
      }}
    />
  );
});

ParallelGroupWrapperNode.displayName = 'ParallelGroupWrapperNode';
