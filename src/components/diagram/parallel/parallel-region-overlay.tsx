'use client';

import React from 'react';
import { useViewport } from 'reactflow';
import { Plus, Square } from 'lucide-react';
import type { RegionColumnLayout } from '@/lib/layout/region-layout';

interface ParallelRegionOverlayProps {
  columns: RegionColumnLayout[];
  regionStateCounts: Map<string, number>;
  contentBottom: number;
  onAddRegion: () => void;
  onAddStateToRegion: (regionId: string) => void;
}

const TAG_TOP_OFFSET = 46;
const ADD_STATE_GAP = 20;
const ADD_STATE_HEIGHT = 52;
const ADD_REGION_WIDTH = 150;
const ADD_REGION_GAP = 60;
const GROUP_BORDER_PADDING = 28;

// ReactFlow's own layers (.react-flow__renderer, which contains the pane
// and every node/edge hit-area) sit at z-index 4, and .react-flow__panel
// (Controls/MiniMap) at 5 — see node_modules/reactflow/dist/style.css.
// Decorative content (dividers/tags/the group border) stays BELOW that so
// it never visually sits on top of a state node. But interactive controls
// (the two buttons here) MUST sit ABOVE it, or ReactFlow's own transparent
// hit-areas silently swallow every click before it reaches the button —
// they're not covered by anything visible, so the bug is invisible until
// you actually try to click.
const DECORATIVE_Z_INDEX = 0;
const INTERACTIVE_Z_INDEX = 10;

export const ParallelRegionOverlay: React.FC<ParallelRegionOverlayProps> = ({
  columns,
  regionStateCounts,
  contentBottom,
  onAddRegion,
  onAddStateToRegion,
}) => {
  const viewport = useViewport();

  if (columns.length === 0) return null;

  const lastColumn = columns[columns.length - 1];
  const addRegionX = lastColumn.x + lastColumn.width + ADD_REGION_GAP;
  const addStateY = contentBottom + ADD_STATE_GAP;

  const groupTop = -TAG_TOP_OFFSET - GROUP_BORDER_PADDING;
  const groupLeft = columns[0].x - GROUP_BORDER_PADDING;
  const groupRight = addRegionX + ADD_REGION_WIDTH + GROUP_BORDER_PADDING;
  const groupBottom = addStateY + ADD_STATE_HEIGHT + GROUP_BORDER_PADDING;

  const flowSpaceTransform: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
  };

  return (
    <>
      {/* Decorative layer: divider, region tags, group border. Stays behind
          real state nodes (z-index 4+) and never intercepts clicks. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: DECORATIVE_Z_INDEX }}>
        <div style={flowSpaceTransform}>
          <div
            style={{
              position: 'absolute',
              left: groupLeft,
              top: groupTop,
              width: groupRight - groupLeft,
              height: groupBottom - groupTop,
              borderRadius: 16,
              border: '2px solid var(--ui-border)',
            }}
          />

          {columns.map((column, i) => {
            const stateCount = regionStateCounts.get(column.regionId) ?? 0;
            return (
              <React.Fragment key={column.regionId}>
                {i > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: column.x - ADD_REGION_GAP / 2,
                      top: -TAG_TOP_OFFSET,
                      height: addStateY - -TAG_TOP_OFFSET + ADD_STATE_HEIGHT,
                      width: 0,
                      borderLeft: '2px dashed #94a3b8',
                    }}
                  />
                )}

                <div style={{ position: 'absolute', left: column.x, top: -TAG_TOP_OFFSET }} className='flex flex-col gap-1'>
                  <span className='inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300 bg-muted px-2 py-0.5 rounded-md w-fit'>
                    <Square className='h-2.5 w-2.5' />
                    {column.regionLabel}
                  </span>
                  <span className='text-[10.5px] text-dimmed pl-0.5'>
                    region &middot; {stateCount} {stateCount === 1 ? 'state' : 'states'}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Interactive layer: the actual buttons, raised above ReactFlow's own
          pane/edge hit-areas so clicks land on them instead of passing
          through to the (invisible) canvas underneath. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: INTERACTIVE_Z_INDEX }}>
        <div style={flowSpaceTransform}>
          {columns.map((column) => (
            <button
              key={column.regionId}
              onClick={() => onAddStateToRegion(column.regionId)}
              title={`Add state to ${column.regionLabel}`}
              aria-label={`Add state to ${column.regionLabel}`}
              style={{
                position: 'absolute',
                left: column.x,
                top: addStateY,
                width: column.width,
                height: ADD_STATE_HEIGHT,
                pointerEvents: 'auto',
              }}
              className='flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default text-dimmed hover:text-muted hover:border-muted transition-colors bg-elevated'
            >
              <Plus className='h-4 w-4' />
              <span className='text-xs font-bold'>Add State</span>
            </button>
          ))}

          <button
            onClick={onAddRegion}
            title='Add Region'
            aria-label='Add Region'
            style={{
              position: 'absolute',
              left: addRegionX,
              top: -TAG_TOP_OFFSET,
              width: ADD_REGION_WIDTH,
              height: addStateY - -TAG_TOP_OFFSET + ADD_STATE_HEIGHT,
              pointerEvents: 'auto',
            }}
            className='flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default text-dimmed hover:text-muted hover:border-muted transition-colors bg-elevated'
          >
            <Plus className='h-5 w-5' />
            <span className='text-xs font-bold'>Add Region</span>
          </button>
        </div>
      </div>
    </>
  );
};
