import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValidationStatusBadge, formatValidationSummary } from './validation-status-badge';

describe('formatValidationSummary', () => {
  it.each([
    [0, 0, ''],
    [1, 0, '1 error'],
    [2, 0, '2 errors'],
    [0, 1, '1 warning'],
    [0, 3, '3 warnings'],
    [2, 1, '2 errors · 1 warning'],
  ])('%i errors, %i warnings → "%s"', (errors, warnings, expected) => {
    expect(formatValidationSummary(errors, warnings)).toBe(expected);
  });
});

describe('ValidationStatusBadge', () => {
  it('shows only a check icon (no text) when there are no issues', () => {
    render(<ValidationStatusBadge errorCount={0} warningCount={0} isOpen={false} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'No issues' });
    expect(button).toHaveTextContent('');
  });

  it('labels errors and warnings in the error (red) tone', () => {
    render(<ValidationStatusBadge errorCount={2} warningCount={1} isOpen={false} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: '2 errors · 1 warning' });
    expect(button).toHaveTextContent('2 errors · 1 warning');
    expect(button.className).toContain('text-error');
  });

  it('uses the warning (amber) tone when there are only warnings', () => {
    render(<ValidationStatusBadge errorCount={0} warningCount={1} isOpen={false} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: '1 warning' });
    expect(button.className).toContain('text-warning');
    expect(button.className).not.toContain('text-error');
  });

  it('reflects whether the Errors panel is open and calls onClick', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ValidationStatusBadge errorCount={1} warningCount={0} isOpen={false} onClick={onClick} />
    );
    const button = screen.getByRole('button', { name: '1 error' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<ValidationStatusBadge errorCount={1} warningCount={0} isOpen={true} onClick={onClick} />);
    expect(screen.getByRole('button', { name: '1 error' })).toHaveAttribute('aria-pressed', 'true');
  });
});
