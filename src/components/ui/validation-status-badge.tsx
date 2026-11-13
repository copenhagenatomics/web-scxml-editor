'use client';

import React from 'react';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** "2 errors · 1 warning", "1 warning", or "" when there is nothing to report. */
export function formatValidationSummary(errorCount: number, warningCount: number): string {
  const parts: string[] = [];
  if (errorCount > 0) parts.push(plural(errorCount, 'error'));
  if (warningCount > 0) parts.push(plural(warningCount, 'warning'));
  return parts.join(' · ');
}

interface ValidationStatusBadgeProps {
  errorCount: number;
  warningCount: number;
  /** Whether the Errors panel is currently open (shown as pressed). */
  isOpen: boolean;
  onClick: () => void;
}

/**
 * Toolbar validation status (issue #82). Replaces a bare colored dot that users didn't
 * notice or understand: problems now show as a labelled pill ("2 errors · 1 warning"),
 * red when there are errors, amber for warnings only. A clean document shows just a
 * small green check, to keep the toolbar quiet. Clicking toggles the Errors panel.
 */
export function ValidationStatusBadge({
  errorCount,
  warningCount,
  isOpen,
  onClick,
}: ValidationStatusBadgeProps) {
  const summary = formatValidationSummary(errorCount, warningCount);

  if (!summary) {
    return (
      <button
        onClick={onClick}
        title='No issues'
        aria-label='No issues'
        aria-pressed={isOpen}
        className={`p-2 rounded-md text-success transition-colors hover:bg-muted ${isOpen ? 'bg-muted' : ''}`}
      >
        <CircleCheck className='h-4 w-4' />
      </button>
    );
  }

  const hasErrors = errorCount > 0;
  const Icon = hasErrors ? CircleX : TriangleAlert;
  const tone = hasErrors
    ? 'bg-[var(--ui-error)]/15 text-error hover:bg-[var(--ui-error)]/25 ring-[var(--ui-error)]'
    : 'bg-[var(--ui-warning)]/15 text-warning hover:bg-[var(--ui-warning)]/25 ring-[var(--ui-warning)]';

  return (
    <button
      onClick={onClick}
      title={`${summary}. Click to ${isOpen ? 'hide' : 'show'} details.`}
      aria-label={summary}
      aria-pressed={isOpen}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${tone} ${
        isOpen ? 'ring-1' : ''
      }`}
    >
      <Icon className='h-3.5 w-3.5 flex-shrink-0' />
      <span>{summary}</span>
    </button>
  );
}
