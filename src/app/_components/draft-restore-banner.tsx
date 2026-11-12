'use client';

import { History, X } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import type { DraftBannerState } from '../_hooks/use-draft-autosave';

/** "14:05" for today, otherwise "12 Nov 2026, 14:05" (in the viewer's locale). */
export function formatDraftTime(savedAt: number, now: number = Date.now()): string {
  const saved = new Date(savedAt);
  const today = new Date(now);
  const sameDay = saved.toDateString() === today.toDateString();
  return sameDay
    ? saved.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : saved.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

interface DraftRestoreBannerProps {
  state: DraftBannerState | null;
  onRestore: () => void;
  onDiscard: () => void;
  onDiscardRestored: () => void;
  onDismissRestored: () => void;
}

export function DraftRestoreBanner({
  state,
  onRestore,
  onDiscard,
  onDiscardRestored,
  onDismissRestored,
}: DraftRestoreBannerProps) {
  if (!state) return null;

  return (
    <div
      role={state.kind === 'offer' ? 'alert' : 'status'}
      className='flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated text-sm text-default'
    >
      <History className='h-4 w-4 text-warning flex-shrink-0' />
      {state.kind === 'offer' ? (
        <>
          <span className='flex-1 min-w-0'>
            You have unsaved changes from {formatDraftTime(state.draft.savedAt)}.
            {state.baseChanged &&
              ' They were made on a different version than the one now open, and restoring will replace it.'}
          </span>
          <Button size='sm' onClick={onRestore}>
            Restore
          </Button>
          <Button size='sm' variant='ghost' onClick={onDiscard}>
            Discard
          </Button>
        </>
      ) : (
        <>
          <span className='flex-1 min-w-0'>
            Restored your unsaved changes from {formatDraftTime(state.savedAt)}.
          </span>
          <Button size='sm' variant='ghost' onClick={onDiscardRestored}>
            Discard
          </Button>
          <button
            onClick={onDismissRestored}
            aria-label='Dismiss'
            className='p-1 text-dimmed hover:text-default transition-colors flex-shrink-0'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </>
      )}
    </div>
  );
}
