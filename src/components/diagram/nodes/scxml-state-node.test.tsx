import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ReactFlowProvider, useStoreApi } from 'reactflow';
import {
  SCXMLStateNode,
  ANCHOR_LIMIT_MESSAGE,
  type SCXMLStateNodeData,
} from './scxml-state-node';
import { useHostAPIStore } from '@/stores/host-api-store';
import { MAX_ANCHORS_PER_SIDE } from '@/lib/converters/converter-modules/visual-metadata';
import {
  ANCHOR_IN_USE_MESSAGE,
  LAST_ANCHOR_MESSAGE,
} from '@/lib/commands/remove-anchor-point-command';

const baseProps = {
  selected: false,
  type: 'scxmlState',
  zIndex: 0,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  dragging: false,
} as any;

const renderNode = (id: string, data: SCXMLStateNodeData) =>
  render(
    <ReactFlowProvider>
      <SCXMLStateNode {...baseProps} id={id} data={data} />
    </ReactFlowProvider>
  );

const handles = (container: HTMLElement, kind: 'source' | 'target') =>
  container.querySelectorAll(`.react-flow__handle.${kind}`);

/** The node's outer box (the element carrying the border styles). */
const box = (container: HTMLElement) =>
  container.querySelector('.group') as HTMLElement;

describe('SCXMLStateNode — <final>', () => {
  it('renders target handles but no source handles for a final state', () => {
    const { container } = renderNode('Done', { label: 'Done', stateType: 'final' });
    expect(handles(container, 'target').length).toBe(4);
    expect(handles(container, 'source').length).toBe(0);
  });

  it('shows the bullseye icon and a double border for a final state', () => {
    const { container } = renderNode('Done', { label: 'Done', stateType: 'final' });
    expect(screen.getByTestId('final-state-icon')).toHaveTextContent('◉');
    expect(box(container).style.borderStyle).toBe('double');
  });

  it('shows the donedata summary line', () => {
    renderNode('Done', { label: 'Done', stateType: 'final', doneDataSummary: '{status, code}' });
    expect(screen.getByText('done: {status, code}')).toBeInTheDocument();
  });

  it.each(['Final', 'CompleteSetup'])(
    'a normal state named %s is not styled as final',
    (name) => {
      const { container } = renderNode(name, { label: name, stateType: 'simple' });
      expect(screen.queryByTestId('final-state-icon')).not.toBeInTheDocument();
      expect(box(container).style.borderStyle).toBe('solid');
      expect(handles(container, 'source').length).toBe(4);
      expect(handles(container, 'target').length).toBe(4);
    }
  );
});

describe('SCXMLStateNode — shift-click add anchor', () => {
  afterEach(() => {
    cleanup();
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  /** Shift-clicks 2px inside the bottom border of a 200x100 node. */
  const shiftClickBottom = (container: HTMLElement) => {
    const el = box(container);
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
    fireEvent.click(el, { shiftKey: true, clientX: 100, clientY: 98 });
  };

  const warnings = () =>
    useHostAPIStore.getState().feedbackQueue.filter((f) => f.message === ANCHOR_LIMIT_MESSAGE);

  it('adds an anchor to a side that still has room, with no warning', () => {
    const onAddAnchor = vi.fn();
    const { container } = renderNode('A', {
      label: 'A',
      stateType: 'simple',
      anchors: { bottom: MAX_ANCHORS_PER_SIDE - 1 },
      onAddAnchor,
    });
    shiftClickBottom(container);
    expect(onAddAnchor).toHaveBeenCalledWith('bottom');
    expect(warnings()).toHaveLength(0);
  });

  it('shows one warning toast instead of adding when the side is full', () => {
    const onAddAnchor = vi.fn();
    const { container } = renderNode('A', {
      label: 'A',
      stateType: 'simple',
      anchors: { bottom: MAX_ANCHORS_PER_SIDE },
      onAddAnchor,
    });
    shiftClickBottom(container);
    shiftClickBottom(container);
    expect(onAddAnchor).not.toHaveBeenCalled();
    const shown = warnings();
    expect(shown).toHaveLength(1);
    expect(shown[0].level).toBe('warning');
  });
});

describe('SCXMLStateNode — alt-click remove anchor', () => {
  afterEach(() => {
    cleanup();
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  const handleById = (container: HTMLElement, id: string) =>
    container.querySelector(`.react-flow__handle.target[data-handleid="${id}"]`) as HTMLElement;

  const toasts = (message: string) =>
    useHostAPIStore.getState().feedbackQueue.filter((f) => f.message === message);

  it('removes the alt-clicked connection point', () => {
    const onRemoveAnchor = vi.fn();
    const onAddAnchor = vi.fn();
    const { container } = renderNode('A', {
      label: 'A',
      stateType: 'simple',
      anchors: { bottom: 3 },
      onAddAnchor,
      onRemoveAnchor,
    });
    fireEvent.click(handleById(container, 'bottom-2'), { altKey: true, shiftKey: true });
    expect(onRemoveAnchor).toHaveBeenCalledWith('bottom', 2);
    expect(onAddAnchor).not.toHaveBeenCalled();
  });

  it('ignores a plain click on a connection point', () => {
    const onRemoveAnchor = vi.fn();
    const { container } = renderNode('A', {
      label: 'A',
      stateType: 'simple',
      anchors: { bottom: 3 },
      onRemoveAnchor,
    });
    fireEvent.click(handleById(container, 'bottom-1'));
    expect(onRemoveAnchor).not.toHaveBeenCalled();
  });

  it("warns instead of removing a side's only connection point", () => {
    const onRemoveAnchor = vi.fn();
    const { container } = renderNode('A', { label: 'A', stateType: 'simple', onRemoveAnchor });
    fireEvent.click(handleById(container, 'top'), { altKey: true });
    expect(onRemoveAnchor).not.toHaveBeenCalled();
    expect(toasts(LAST_ANCHOR_MESSAGE)).toHaveLength(1);
  });

  it('warns instead of removing a connection point a transition uses', () => {
    const onRemoveAnchor = vi.fn();
    const edges = [
      { id: 'e1', source: 'A', target: 'B', sourceHandle: 'bottom-1', targetHandle: 'top' },
    ];
    // This ReactFlow version's provider has no initialEdges prop — seed the
    // store from inside it instead.
    const SeedEdges = () => {
      const store = useStoreApi();
      React.useLayoutEffect(() => store.setState({ edges }), [store]);
      return null;
    };
    const { container } = render(
      <ReactFlowProvider>
        <SeedEdges />
        <SCXMLStateNode
          {...baseProps}
          id='A'
          data={{ label: 'A', stateType: 'simple', anchors: { bottom: 2 }, onRemoveAnchor }}
        />
      </ReactFlowProvider>
    );
    fireEvent.click(handleById(container, 'bottom-1'), { altKey: true });
    expect(onRemoveAnchor).not.toHaveBeenCalled();
    expect(toasts(ANCHOR_IN_USE_MESSAGE)).toHaveLength(1);
  });
});
