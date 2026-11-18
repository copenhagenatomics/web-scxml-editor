import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValidationPanel } from './validation-panel';
import type { ValidationError } from '@/types/common';

const fix = { label: 'Set initial value to 0.0', kind: 'set-data-expr' as const, dataId: 'this_n', expr: '0.0' };

function renderPanel(errors: ValidationError[], overrides: Partial<Parameters<typeof ValidationPanel>[0]> = {}) {
  return render(
    <ValidationPanel
      errors={errors}
      hostErrors={[]}
      isVisible
      activeTab='validation'
      onClose={() => {}}
      onTabChange={() => {}}
      onDismissHostError={() => {}}
      onClearHostErrors={() => {}}
      {...overrides}
    />
  );
}

describe('ValidationPanel fix button', () => {
  it('applies the fix without also navigating to the error', () => {
    const onApplyFix = vi.fn();
    const onErrorClick = vi.fn();
    renderPanel([{ message: 'type mismatch', severity: 'warning', line: 4, column: 5, fix }], {
      onApplyFix,
      onErrorClick,
    });

    // The card itself is role=button too (click to navigate), so find the fix button by its text.
    fireEvent.click(screen.getByText(/^Fix: Set initial value to 0\.0$/).closest('button')!);

    expect(onApplyFix).toHaveBeenCalledWith(fix);
    expect(onErrorClick).not.toHaveBeenCalled();
  });

  it('shows no fix button for errors without a fix, or when fixes are not handled', () => {
    renderPanel([{ message: 'plain problem', severity: 'error' }], { onApplyFix: vi.fn() });
    expect(screen.queryByText(/^Fix:/)).not.toBeInTheDocument();
  });

  it('shows no fix button when the panel has no onApplyFix', () => {
    renderPanel([{ message: 'type mismatch', severity: 'warning', fix }]);
    expect(screen.queryByText(/Fix:/)).not.toBeInTheDocument();
  });
});
