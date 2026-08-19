import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StateActionsPanel } from './state-actions-panel';

const noop = () => {};

type Props = Parameters<typeof StateActionsPanel>[0];

function renderPanel(overrides: Partial<Props> = {}) {
  return render(
    <StateActionsPanel
      isVisible
      onClose={noop}
      stateId='StateA'
      entryActions={[]}
      exitActions={[]}
      internalEventActions={[]}
      scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="StateA"/></scxml>'
      stateType='simple'
      isInitial={false}
      canMarkInitial
      onToggleInitial={noop}
      onApply={noop}
      onApplyReactions={noop}
      {...overrides}
    />
  );
}

describe('StateActionsPanel action ordering', () => {
  it('numbers onentry rows in array order', () => {
    renderPanel({
      entryActions: [
        { type: 'assign', location: 'a', expr: '1' },
        { type: 'assign', location: 'b', expr: '2' },
        { type: 'assign', location: 'c', expr: '3' },
      ],
    });

    const badges = screen.getAllByTestId('action-order-badge');
    expect(badges.map((b) => b.textContent)).toEqual(['1', '2', '3']);
  });

  it('drag handles are enabled when no row is being added or edited', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    const handle = screen.getByRole('button', { name: 'Reorder action' });
    expect(handle).not.toBeDisabled();
  });

  it('disables the remaining drag handles while a row is being edited', () => {
    renderPanel({
      entryActions: [
        { type: 'assign', location: 'a', expr: '1' },
        { type: 'assign', location: 'b', expr: '2' },
      ],
    });

    // The row's text is split across sibling spans (per-token styling), so a
    // plain string query can't match it — Testing Library only matches direct
    // text-node children, not concatenated descendant text. Use the function
    // matcher form it recommends for this case.
    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'a = 1'),
    );

    const handles = screen.getAllByRole('button', { name: 'Reorder action' });
    expect(handles).toHaveLength(1);
    expect(handles[0]).toBeDisabled();
  });

  it('disables drag handles while adding a new row', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Add action'));

    const handle = screen.getByRole('button', { name: 'Reorder action' });
    expect(handle).toBeDisabled();
  });
});

describe('StateActionsPanel reaction ordering', () => {
  it('numbers reaction rows in array order across different events', () => {
    renderPanel({
      internalEventActions: [
        { event: 'evtA', location: 'x', expr: '1', type: 'internal' },
        { event: 'evtB', location: 'y', expr: '2', type: 'internal' },
      ],
    });

    fireEvent.click(screen.getByText(/event reactions/));

    const badges = screen.getAllByTestId('action-order-badge');
    expect(badges.map((b) => b.textContent)).toEqual(['1', '2']);
  });

  it('disables drag handles while adding a new reaction', () => {
    renderPanel({
      internalEventActions: [{ event: 'evtA', location: 'x', expr: '1', type: 'internal' }],
    });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Add action'));

    const handle = screen.getByRole('button', { name: 'Reorder action' });
    expect(handle).toBeDisabled();
  });
});
