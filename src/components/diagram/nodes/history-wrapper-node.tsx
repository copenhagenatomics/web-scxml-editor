'use client';

import React, { memo } from 'react';
import { type NodeProps } from 'reactflow';
import { History } from 'lucide-react';
import type { SCXMLStateNodeData } from './scxml-state-node';

export interface HistoryWrapperNodeProps
  extends NodeProps<
    SCXMLStateNodeData & {
      isHistoryWrapper?: boolean;
      wrappedContainerId?: string;
    }
  > {}

export const HistoryWrapperNode = memo<HistoryWrapperNodeProps>(
  ({ data, selected, id }) => {
    const { label, isHistoryWrapper = false, wrappedContainerId } = data;

    if (!isHistoryWrapper) {
      // Fallback to regular state rendering if not marked as history wrapper
      return null;
    }

    // Get dynamic width and height from ReactFlow style first, then data
    const width = (data as any).width || 200;
    const height = (data as any).height || 150;

    const borderStyle = {
      borderWidth: 3,
      borderStyle: 'dashed',
      borderColor: '#8b5cf6',
      borderRadius: '12px',
      backgroundColor: 'rgba(139, 92, 246, 0.05)',
      position: 'relative' as const,
      width: width,
      height: height,
      boxSizing: 'border-box' as const,
      zIndex: 1, // Render above other elements
    };

    const selectedStyle = selected
      ? {
          borderWidth: 3,
          borderStyle: 'dashed',
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.3)',
        }
      : {};

    return (
      <div
        style={{
          ...borderStyle,
          ...selectedStyle,
        }}
        className='history-wrapper-node'
      >
        {/* History indicator in top-left corner */}
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            left: '8px',
            backgroundColor: '#8b5cf6',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            zIndex: 10,
          }}
        >
          <History className='h-3 w-3' />
          <span>{label}</span>
        </div>

        {/* Optional: Add corner decorations to emphasize the wrapper */}
        <div
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '0',
            height: '0',
            borderLeft: '8px solid transparent',
            borderRight: '8px solid #8b5cf6',
            borderBottom: '8px solid transparent',
            opacity: 0.6,
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            width: '0',
            height: '0',
            borderLeft: '8px solid #8b5cf6',
            borderRight: '8px solid transparent',
            borderTop: '8px solid transparent',
            opacity: 0.6,
          }}
        />
      </div>
    );
  }
);

HistoryWrapperNode.displayName = 'HistoryWrapperNode';
