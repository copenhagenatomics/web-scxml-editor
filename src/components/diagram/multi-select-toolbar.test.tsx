import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiSelectToolbar } from './multi-select-toolbar';

const noop = () => {};

function renderToolbar(overrides: Partial<React.ComponentProps<typeof MultiSelectToolbar>> = {}) {
  return render(
    <MultiSelectToolbar count={2} onCopy={noop} onCut={noop} onGroup={noop} onDelete={noop} {...overrides} />
  );
}

describe('MultiSelectToolbar', () => {
  it('shows the selected count', () => {
    renderToolbar({ count: 3 });
    expect(screen.getByText('3 states selected')).toBeInTheDocument();
  });

  it('calls onCopy when the Copy button is clicked', () => {
    const onCopy = vi.fn();
    renderToolbar({ onCopy });
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('calls onCut when the Cut button is clicked', () => {
    const onCut = vi.fn();
    renderToolbar({ onCut });
    fireEvent.click(screen.getByRole('button', { name: /cut/i }));
    expect(onCut).toHaveBeenCalledTimes(1);
  });

  it('calls onGroup when the Group button is clicked', () => {
    const onGroup = vi.fn();
    renderToolbar({ onGroup });
    fireEvent.click(screen.getByRole('button', { name: /group into composite state/i }));
    expect(onGroup).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when the Delete button is clicked', () => {
    const onDelete = vi.fn();
    renderToolbar({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('singularizes the label for a count of 1', () => {
    renderToolbar({ count: 1 });
    expect(screen.getByText('1 state selected')).toBeInTheDocument();
  });
});
