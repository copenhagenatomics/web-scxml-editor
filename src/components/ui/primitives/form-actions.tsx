'use client';

import React from 'react';

interface FormActionsProps {
  onApply: () => void;
  onDiscard: () => void;
  applyDisabled?: boolean;
  className?: string;
  /**
   * Shows an "Enter to save · Esc to discard" hint beside the buttons and adds the
   * keys to their tooltips. Opt-in: only pass it where the form's fields actually
   * handle Enter/Escape that way.
   */
  showKeyHints?: boolean;
}

const kbdClass = 'px-1 rounded border border-default bg-muted font-sans';

export function FormActions({ onApply, onDiscard, applyDisabled, className, showKeyHints }: FormActionsProps) {
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className ?? ''}`.trim()}>
      {showKeyHints && (
        <span data-testid='form-key-hints' className='mr-auto text-[10px] text-muted'>
          <kbd className={kbdClass}>Enter</kbd> to save · <kbd className={kbdClass}>Esc</kbd> to discard
        </span>
      )}
      <button
        type='button'
        onClick={onDiscard}
        title={showKeyHints ? 'Discard (Esc)' : undefined}
        className='text-xs px-2.5 py-1 rounded border border-default text-muted hover:bg-muted'
      >
        Discard
      </button>
      <button
        type='button'
        onClick={onApply}
        disabled={applyDisabled}
        title={showKeyHints ? 'Apply (Enter)' : undefined}
        className='text-xs px-2.5 py-1 rounded bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-30 disabled:cursor-not-allowed'
      >
        Apply
      </button>
    </div>
  );
}
