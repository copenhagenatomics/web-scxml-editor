import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiSelectToolbar } from './multi-select-toolbar';

describe('MultiSelectToolbar', () => {
  it('shows the selected count', () => {
    render(<MultiSelectToolbar count={3} onCopy={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('3 states selected')).toBeInTheDocument();
  });

  it('calls onCopy when the Copy button is clicked', () => {
    const onCopy = vi.fn();
    render(<MultiSelectToolbar count={2} onCopy={onCopy} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when the Delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<MultiSelectToolbar count={2} onCopy={() => {}} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('singularizes the label for a count of 1', () => {
    render(<MultiSelectToolbar count={1} onCopy={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('1 state selected')).toBeInTheDocument();
  });
});
