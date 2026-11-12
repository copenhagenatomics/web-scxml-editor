import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TipsPopover, filterTipsForTab, type Tip } from './tips-popover';

const TIPS: Tip[] = [
  { tab: 'code', content: 'Code tip' },
  { tab: 'both', content: 'Shared tip' },
  { tab: 'visual', content: 'Visual tip one' },
  { tab: 'visual', content: 'Visual tip two' },
];

const openTips = () => fireEvent.click(screen.getByRole('button', { name: 'Tips' }));

describe('TipsPopover', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows only the 💡 button until clicked', () => {
    render(<TipsPopover tips={TIPS} activeTab='visual' />);
    expect(screen.getByRole('button', { name: 'Tips' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Shared tip')).not.toBeInTheDocument();
  });

  it("opens on the first tip for the active tab, with its position", () => {
    render(<TipsPopover tips={TIPS} activeTab='visual' />);
    openTips();
    expect(screen.getByRole('dialog', { name: 'Tips' })).toBeInTheDocument();
    expect(screen.getByText('Tip 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Shared tip')).toBeInTheDocument();
  });

  it('steps through tips with next/previous, wrapping around', () => {
    render(<TipsPopover tips={TIPS} activeTab='visual' />);
    openTips();
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    expect(screen.getByText('Visual tip one')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    expect(screen.getByText('Shared tip')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous tip' }));
    expect(screen.getByText('Visual tip two')).toBeInTheDocument();
    expect(screen.getByText('Tip 3 of 3')).toBeInTheDocument();
  });

  it('never advances on its own', () => {
    vi.useFakeTimers();
    render(<TipsPopover tips={TIPS} activeTab='visual' />);
    openTips();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Tip 1 of 3')).toBeInTheDocument();
  });

  it('closes on Escape, on its close button, and on a click outside, but not on a click inside', () => {
    render(
      <div>
        <span>outside</span>
        <TipsPopover tips={TIPS} activeTab='visual' />
      </div>
    );

    openTips();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openTips();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openTips();
    fireEvent.mouseDown(screen.getByText('Shared tip'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles closed when the 💡 button is clicked again', () => {
    render(<TipsPopover tips={TIPS} activeTab='visual' />);
    openTips();
    openTips();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches to the other tab’s tips from the first one', () => {
    const { rerender } = render(<TipsPopover tips={TIPS} activeTab='visual' />);
    openTips();
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    rerender(<TipsPopover tips={TIPS} activeTab='code' />);
    expect(screen.getByText('Tip 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Code tip')).toBeInTheDocument();
  });

  it('hides the arrows and counter when only one tip applies', () => {
    render(<TipsPopover tips={[{ tab: 'visual', content: 'Only tip' }]} activeTab='visual' />);
    openTips();
    expect(screen.getByText('Tip')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next tip' })).not.toBeInTheDocument();
  });

  it('renders nothing when no tip applies to the active tab', () => {
    const { container } = render(<TipsPopover tips={[{ tab: 'code', content: 'x' }]} activeTab='visual' />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('filterTipsForTab', () => {
  it('keeps tips for the tab, for both tabs, and untagged tips', () => {
    const untagged: Tip = { content: 'any' };
    expect(filterTipsForTab([...TIPS, untagged], 'code').map((t) => t.content)).toEqual([
      'Code tip',
      'Shared tip',
      'any',
    ]);
  });
});
