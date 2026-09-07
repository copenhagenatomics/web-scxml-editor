'use client';

import { Copy, Scissors, Trash2 } from 'lucide-react';

interface MultiSelectToolbarProps {
  count: number;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
}

export function MultiSelectToolbar({ count, onCopy, onCut, onDelete }: MultiSelectToolbarProps) {
  return (
    <div className='absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2 text-xs text-default shadow-lg'>
      <span>
        {count} state{count === 1 ? '' : 's'} selected
      </span>
      <div className='h-4 w-px bg-[var(--ui-border)]' />
      <button
        onClick={onCopy}
        title='Copy selection'
        aria-label='Copy selection'
        className='flex items-center gap-1 text-muted hover:text-default transition-colors'
      >
        <Copy className='h-3.5 w-3.5' />
        Copy
      </button>
      <button
        onClick={onCut}
        title='Cut selection'
        aria-label='Cut selection'
        className='flex items-center gap-1 text-muted hover:text-default transition-colors'
      >
        <Scissors className='h-3.5 w-3.5' />
        Cut
      </button>
      <button
        onClick={onDelete}
        title='Delete selection'
        aria-label='Delete selection'
        className='flex items-center gap-1 text-muted hover:text-error transition-colors'
      >
        <Trash2 className='h-3.5 w-3.5' />
        Delete
      </button>
    </div>
  );
}
