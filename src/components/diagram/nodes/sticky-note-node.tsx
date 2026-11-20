// sticky-note-node
'use client';

import React, { memo } from 'react';
import { type NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import { Trash2 } from 'lucide-react';
import { VISUAL_METADATA_CONSTANTS, clampNoteSize } from '@/types/visual-metadata';
import {
  useNoteSizing,
  NOTE_CONTENT_PADDING,
  NOTE_LINE_HEIGHT,
} from './use-note-sizing';

const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;

const NOTE_FULL_MESSAGE =
  'Note is full — store large documentation externally and reference it.';

export interface StickyNoteNodeData {
  text: string;
  /** Stored base width/height from viz:xywh (user-resizable) */
  width?: number;
  height?: number;
  isEditing?: boolean;
  onTextChange?: (newText: string) => void;
  onDelete?: () => void;
  onResize?: (x: number, y: number, width: number, height: number) => void;
}

/**
 * Post-it note annotation node. Resizable via NodeResizer handles while
 * selected, not connectable (no handles). The stored width × height is the
 * base box; useNoteSizing shrinks the font and, if needed, grows the height
 * beyond the base to fit the text (the XML always stores the base size).
 */
export const StickyNoteNode = memo<NodeProps<StickyNoteNodeData>>(
  ({ data, selected, id }) => {
    const { setNodes } = useReactFlow();
    const { text, isEditing = false, onTextChange, onDelete, onResize } = data;
    const storedSize = clampNoteSize(data.width, data.height);

    // Box under the cursor during an active resize drag; null otherwise
    const [liveSize, setLiveSize] = React.useState<{
      width: number;
      height: number;
    } | null>(null);
    const baseWidth = liveSize?.width ?? storedSize.width;
    const baseHeight = liveSize?.height ?? storedSize.height;

    const [editing, setEditing] = React.useState(false);
    const [tempText, setTempText] = React.useState(text);
    // True after a keystroke was rejected because the note is at capacity
    const [inputBlocked, setInputBlocked] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Focus the textarea with the caret at the end of the existing text
    React.useEffect(() => {
      if (editing && textareaRef.current) {
        const el = textareaRef.current;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        el.scrollTop = el.scrollHeight;
      }
    }, [editing]);

    const displayText = editing ? tempText : text;
    // No auto-expansion mid-drag, so the note tracks the resize handles exactly
    const { fontSize, height, isFull, fits } = useNoteSizing(
      displayText,
      baseWidth,
      baseHeight,
      liveSize === null
    );

    // Respond to isEditing flag from parent (triggered by double-click on node)
    React.useEffect(() => {
      if (isEditing) {
        setEditing(true);
        setTempText(text);
      }
    }, [isEditing, text]);

    const clearEditingFlag = () => {
      setEditing(false);
      setInputBlocked(false);
      if (isEditing) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id
              ? { ...node, data: { ...node.data, isEditing: false } }
              : node
          )
        );
      }
    };

    const handleSubmit = () => {
      if (onTextChange && tempText !== text) {
        onTextChange(tempText);
      }
      clearEditingFlag();
    };

    const handleCancel = () => {
      setTempText(text);
      clearEditingFlag();
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const candidate = e.target.value;
      // Deletions/shrinking are always allowed so over-capacity notes stay
      // editable; only growth beyond the maximum capacity is rejected.
      if (candidate.length < tempText.length || fits(candidate)) {
        setTempText(candidate);
        setInputBlocked(false);
      } else {
        setInputBlocked(true);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSubmit();
      }
    };

    const showFullBanner = isFull || inputBlocked;

    return (
      <>
      {selected && onResize && !editing && (
        <NodeResizer
          onResizeStart={(_event, params) =>
            setLiveSize({ width: params.width, height: params.height })
          }
          onResize={(_event, params) => {
            setLiveSize({ width: params.width, height: params.height });
            // Top/left handles move the node's origin as well
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? { ...node, position: { x: params.x, y: params.y } }
                  : node
              )
            );
          }}
          onResizeEnd={(_event, params) => {
            onResize(params.x, params.y, params.width, params.height);
            // Keep the dropped size until the committed SCXML re-parses
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        width: params.width,
                        height: params.height,
                      },
                    }
                  : node
              )
            );
            setLiveSize(null);
          }}
          minWidth={NOTE.MIN_WIDTH}
          minHeight={NOTE.MIN_HEIGHT}
          maxWidth={NOTE.MAX_WIDTH}
          maxHeight={NOTE.MAX_HEIGHT}
          handleClassName='!w-3 !h-3 !bg-yellow-500 !border-yellow-700'
          lineClassName='!border-yellow-600'
          color='#ca8a04'
          isVisible={selected}
        />
      )}
      <div
        className={`group relative bg-yellow-200 shadow-md rounded-sm border ${
          selected
            ? 'border-yellow-600 ring-2 ring-yellow-500/50'
            : 'border-yellow-300'
        }`}
        style={{ width: baseWidth, height }}
      >
        {/* Delete button - same hover pattern as state nodes */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className='absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 border border-gray-200 hover:border-red-300 rounded-lg shadow-sm transition-all duration-200 opacity-0 hover:opacity-100 group-hover:opacity-70 hover:!opacity-100 z-20 cursor-pointer'
            title='Delete note'
          >
            <Trash2 className='h-4 w-4 text-gray-600 hover:text-red-600 transition-colors' />
          </button>
        )}

        {editing ? (
          <textarea
            ref={textareaRef}
            value={tempText}
            onChange={handleChange}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className='nodrag nowheel scrollbar-note absolute inset-0 w-full h-full bg-transparent text-gray-900 resize-none outline-none border-2 border-yellow-500 rounded-sm'
            style={{
              fontSize,
              lineHeight: NOTE_LINE_HEIGHT,
              padding: NOTE_CONTENT_PADDING,
            }}
            autoFocus
            placeholder='Write a reminder, TODO or comment…'
            title='Ctrl+Enter or click outside to save, Escape to cancel'
          />
        ) : (
          <div
            className='w-full h-full overflow-hidden whitespace-pre-wrap break-words text-gray-900'
            style={{
              fontSize,
              lineHeight: NOTE_LINE_HEIGHT,
              padding: NOTE_CONTENT_PADDING,
            }}
            title='Double-click to edit note'
          >
            {text || (
              <span className='italic text-gray-500'>
                Double-click to add text
              </span>
            )}
          </div>
        )}

        {showFullBanner && (
          <div className='absolute bottom-0 inset-x-0 bg-amber-100 text-amber-900 text-xs px-2 py-1 border-t border-amber-300 z-10'>
            {NOTE_FULL_MESSAGE}
          </div>
        )}
      </div>
      </>
    );
  }
);

StickyNoteNode.displayName = 'StickyNoteNode';
