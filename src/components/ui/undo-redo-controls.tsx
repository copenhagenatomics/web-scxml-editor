'use client';

import React, { useEffect, useCallback } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useHistoryStore } from '@/stores/history-store';
import { HistoryManager } from '@/lib/history/history-manager';
import type { ActionType } from '@/types/history';

interface UndoRedoControlsProps {
  onUndo?: (content: string, actionType: ActionType) => void;
  onRedo?: (content: string, actionType: ActionType) => void;
  className?: string;
  showTooltips?: boolean;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({
  onUndo,
  onRedo,
  className = '',
  showTooltips = true,
}) => {
  const { canUndo, canRedo, getUndoDescription, getRedoDescription } =
    useHistoryStore();
  const historyManager = HistoryManager.getInstance();

  const handleUndo = useCallback(() => {
    const result = historyManager.undo();
    if (result !== null && onUndo) {
      onUndo(result.content, result.actionType);
    }
  }, [onUndo]);

  const handleRedo = useCallback(() => {
    const result = historyManager.redo();
    if (result !== null && onRedo) {
      onRedo(result.content, result.actionType);
    }
  }, [onRedo]);

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlCmd = isMac ? event.metaKey : event.ctrlKey;

      if (isCtrlCmd && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        if (canUndo()) {
          handleUndo();
        }
      } else if (
        (isCtrlCmd && event.shiftKey && event.key === 'z') ||
        (isCtrlCmd && event.key === 'y')
      ) {
        event.preventDefault();
        if (canRedo()) {
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, handleUndo, handleRedo]);

  const undoDescription = getUndoDescription();
  const redoDescription = getRedoDescription();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={handleUndo}
        disabled={!canUndo()}
        className={`
          p-2 rounded-md transition-all duration-200
          ${
            canUndo()
              ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              : 'text-gray-400 cursor-not-allowed'
          }
        `}
        title={showTooltips ? undoDescription || 'Undo (Ctrl+Z)' : undefined}
        aria-label='Undo'
      >
        <Undo2 className='h-4 w-4' />
      </button>

      <button
        onClick={handleRedo}
        disabled={!canRedo()}
        className={`
          p-2 rounded-md transition-all duration-200
          ${
            canRedo()
              ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              : 'text-gray-400 cursor-not-allowed'
          }
        `}
        title={showTooltips ? redoDescription || 'Redo (Ctrl+Y)' : undefined}
        aria-label='Redo'
      >
        <Redo2 className='h-4 w-4' />
      </button>
    </div>
  );
};
