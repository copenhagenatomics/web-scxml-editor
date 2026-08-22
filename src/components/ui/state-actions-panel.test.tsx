import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StateActionsPanel } from './state-actions-panel';

const noop = () => {};

const scxmlWithData = (id: string) =>
  `<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel><data id="${id}" expr="0"/></datamodel><state id="StateA"/></scxml>`;

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

describe('StateActionsPanel new-channel suggestions', () => {
  it('offers a "(new channel)" suggestion for an unmatched this_-prefixed location', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });

    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });

  it('does not offer a new-channel suggestion when the variable already exists', () => {
    renderPanel({ scxmlContent: scxmlWithData('this_channel') });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });

    expect(screen.queryByText('(new channel)')).not.toBeInTheDocument();
  });

  it('routes onentry save through onNewChannel instead of onApply when creating a new channel', () => {
    const onApply = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({ onApply, onNewChannel });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onNewChannel).toHaveBeenCalledWith('this_channel', {
      kind: 'actions',
      entryActions: ['assign|this_channel|0'],
      exitActions: [],
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('routes onexit save through onNewChannel with exitActions updated and entryActions unchanged', () => {
    const onApply = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
      onApply,
      onNewChannel,
    });

    fireEvent.click(screen.getByText(/onexit/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onNewChannel).toHaveBeenCalledWith('this_channel', {
      kind: 'actions',
      entryActions: ['assign|a|1'],
      exitActions: ['assign|this_channel|0'],
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('routes reactions save through onNewChannel with kind reactions', () => {
    const onApplyReactions = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({ onApplyReactions, onNewChannel });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('vector'), { target: { value: 'myEvent' } });
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onNewChannel).toHaveBeenCalledWith('this_channel', {
      kind: 'reactions',
      actions: [
        expect.objectContaining({ event: 'myEvent', location: 'this_channel', expr: '0', type: 'internal' }),
      ],
    });
    expect(onApplyReactions).not.toHaveBeenCalled();
  });

  it('still calls onApply for a plain literal location, even when onNewChannel is provided', () => {
    const onApply = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({ onApply, onNewChannel });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'plainVar' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith(['assign|plainVar|1'], []);
    expect(onNewChannel).not.toHaveBeenCalled();
  });

  it('still saves a new this_-prefixed location via onApply when onNewChannel is omitted', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith(['assign|this_channel|0'], []);
  });
});

describe('StateActionsPanel click-outside-to-discard', () => {
  it('discards the in-progress form when clicking elsewhere in the panel', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    expect(screen.getByPlaceholderText('variable or channel')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('StateA'));

    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('does not discard the form when clicking inside it', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.mouseDown(screen.getByPlaceholderText('variable or channel'));

    expect(screen.getByPlaceholderText('variable or channel')).toBeInTheDocument();
  });
});
