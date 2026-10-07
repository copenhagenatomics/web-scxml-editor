import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { SCXMLStateNode, type SCXMLStateNodeData } from './scxml-state-node';

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
