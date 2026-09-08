import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { ParallelGroupWrapperNode } from './parallel-group-wrapper-node';

const baseProps = {
  id: 'Container_parallel',
  selected: false,
  type: 'scxmlParallelGroupWrapper',
  zIndex: 0,
  isConnectable: false,
  xPos: 0,
  yPos: 0,
  dragging: false,
} as any;

const renderNode = (ui: React.ReactElement) =>
  render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('ParallelGroupWrapperNode', () => {
  it('sizes its (invisible) root to the given width/height', () => {
    renderNode(
      <ParallelGroupWrapperNode
        {...baseProps}
        data={{ label: 'Container_parallel', stateType: 'parallel', isParallelGroupWrapper: true, width: 300, height: 200 }}
      />
    );
    const box = screen.getByTestId('parallel-group-wrapper-Container_parallel');
    expect(box).toHaveStyle({ width: '300px', height: '200px' });
  });

  it('renders no visible label, border, or background — purely an invisible drag zone, with dividers drawn separately by ParallelRegionDividerOverlay', () => {
    renderNode(
      <ParallelGroupWrapperNode
        {...baseProps}
        data={{ label: 'Container_parallel', stateType: 'parallel', isParallelGroupWrapper: true, width: 300, height: 200 }}
      />
    );
    expect(screen.queryByText('Parallel State')).not.toBeInTheDocument();
    const box = screen.getByTestId('parallel-group-wrapper-Container_parallel');
    expect(box.style.borderWidth).toBeFalsy();
    expect(box.style.borderColor).toBeFalsy();
    expect(box.style.backgroundColor).toBe('transparent');
  });

  it('renders nothing when isParallelGroupWrapper is not set (defensive fallback, matching HistoryWrapperNode)', () => {
    const { container } = renderNode(
      <ParallelGroupWrapperNode {...baseProps} data={{ label: 'x', stateType: 'parallel' }} />
    );
    expect(container.textContent).toBe('');
  });

  it('has no click handler and is not interactive — clicking it does nothing observable', () => {
    renderNode(
      <ParallelGroupWrapperNode
        {...baseProps}
        data={{ label: 'Container_parallel', stateType: 'parallel', isParallelGroupWrapper: true }}
      />
    );
    const box = screen.getByTestId('parallel-group-wrapper-Container_parallel');
    expect(() => fireEvent.click(box)).not.toThrow();
  });

  it('is itself the drag handle — the whole invisible root carries the drag-handle class and stays hittable for dragging, unlike the old corner-label-only design', () => {
    renderNode(
      <ParallelGroupWrapperNode
        {...baseProps}
        data={{ label: 'Container_parallel', stateType: 'parallel', isParallelGroupWrapper: true }}
      />
    );
    const box = screen.getByTestId('parallel-group-wrapper-Container_parallel');
    expect(box.classList.contains('parallel-group-drag-handle')).toBe(true);
    expect(box.style.pointerEvents).toBe('auto');
    expect(box.style.cursor).toBe('grab');
  });
});
