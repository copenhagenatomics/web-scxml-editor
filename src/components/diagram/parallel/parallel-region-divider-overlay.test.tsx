import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import {
  ParallelRegionDividerOverlay,
  computeDividerScreenX,
} from './parallel-region-divider-overlay';

const renderOverlay = (ui: React.ReactElement) =>
  render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('computeDividerScreenX', () => {
  it('returns the canvas x unchanged at zoom 1 with no pan', () => {
    expect(computeDividerScreenX(100, { x: 0, y: 0, zoom: 1 })).toBe(100);
  });

  it('scales by zoom and offsets by pan', () => {
    expect(computeDividerScreenX(100, { x: 50, y: 0, zoom: 2 })).toBe(250);
  });

  it('handles a negative canvas x (a line left of the diagram origin)', () => {
    expect(computeDividerScreenX(-40, { x: 10, y: 0, zoom: 1 })).toBe(-30);
  });
});

describe('ParallelRegionDividerOverlay', () => {
  it('renders one full-height line per divider x, at the default (unpanned, unzoomed) viewport', () => {
    renderOverlay(<ParallelRegionDividerOverlay dividerXs={[100, 250]} />);
    const lines = screen.getAllByTestId(/parallel-full-height-divider-/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveStyle({ left: '100px', top: '0px', bottom: '0px' });
    expect(lines[1]).toHaveStyle({ left: '250px' });
  });

  it('renders nothing (not even the container) when there are no divider lines', () => {
    const { container } = renderOverlay(<ParallelRegionDividerOverlay dividerXs={[]} />);
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('parallel-region-divider-overlay')).toBeNull();
  });

  it('disables pointer events throughout, so it never intercepts clicks meant for real nodes or the canvas', () => {
    renderOverlay(<ParallelRegionDividerOverlay dividerXs={[100]} />);
    const overlay = screen.getByTestId('parallel-region-divider-overlay');
    expect(overlay.style.pointerEvents).toBe('none');
  });
});
