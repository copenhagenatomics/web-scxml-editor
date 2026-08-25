import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StateActionsPanel } from './state-actions-panel';
import { useHostAPIStore } from '@/stores/host-api-store';

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

  it('registers a new channel referenced inside the Expression field immediately on selection, without touching the committed action lists', () => {
    const onApply = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({
      entryActions: [{ type: 'assign', location: 'existingVar', expr: '1' }],
      onApply,
      onNewChannel,
    });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'target' } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    fireEvent.mouseDown(screen.getByText('(new channel)'));

    // Registration fires immediately — before Apply is ever clicked — and
    // carries the *current* committed lists unchanged (the in-progress
    // "target = this_new_thing" row isn't in here yet; that only happens
    // when Apply is clicked, same as any other row).
    expect(onNewChannel).toHaveBeenCalledWith('this_new_thing', {
      kind: 'actions',
      entryActions: ['assign|existingVar|1'],
      exitActions: [],
    });
    expect(onApply).not.toHaveBeenCalled();

    // The textarea now contains the accepted suggestion; the form is still
    // open and editable (selecting a suggestion is not the same as applying).
    expect(screen.getByPlaceholderText('expression')).toHaveValue('this_new_thing');
    expect(screen.getByPlaceholderText('variable or channel')).toBeInTheDocument();
  });

  it('registers a new channel from the Expression field on the onexit tab, leaving entryActions untouched', () => {
    const onApply = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
      onApply,
      onNewChannel,
    });

    fireEvent.click(screen.getByText(/onexit/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'target' } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    fireEvent.mouseDown(screen.getByText('(new channel)'));

    expect(onNewChannel).toHaveBeenCalledWith('this_new_thing', {
      kind: 'actions',
      entryActions: ['assign|a|1'],
      exitActions: [],
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('registers a new channel from the Expression field on the reactions tab, without touching localReactions', () => {
    const onApplyReactions = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({
      internalEventActions: [{ event: 'existingEvent', location: 'x', expr: '1', type: 'internal' }],
      onApplyReactions,
      onNewChannel,
    });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('vector'), { target: { value: 'myEvent' } });
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'target' } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    fireEvent.mouseDown(screen.getByText('(new channel)'));

    expect(onNewChannel).toHaveBeenCalledWith('this_new_thing', {
      kind: 'reactions',
      actions: [
        expect.objectContaining({ event: 'existingEvent', location: 'x', expr: '1', type: 'internal' }),
      ],
    });
    expect(onApplyReactions).not.toHaveBeenCalled();
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

describe('StateActionsPanel expression field autocomplete', () => {
  it('suggests a matching datamodel variable while typing in the Expression field', () => {
    renderPanel({ scxmlContent: scxmlWithData('MainLight_color') });

    fireEvent.click(screen.getByTitle('Add action'));
    const textarea = screen.getByPlaceholderText('expression') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'MainLight_col' } });

    // Scoped to the Expression field's own wrapper: the Location field is
    // autoFocus'd and, since it's still empty at this point, its own
    // (pre-existing, unrelated) suggestion dropdown also lists every
    // datamodel variable — including this one — because an empty prefix
    // matches everything. An unscoped screen.getByText would match both
    // dropdowns and fail as ambiguous.
    expect(within(textarea.parentElement as HTMLElement).getByText('MainLight_color')).toBeInTheDocument();
  });

  it('replaces only the token at the cursor when selecting a suggestion, preserving the rest of the expression', () => {
    renderPanel({ scxmlContent: scxmlWithData('MainLight_color') });

    fireEvent.click(screen.getByTitle('Add action'));
    const textarea = screen.getByPlaceholderText('expression') as HTMLTextAreaElement;
    // fireEvent.change assigns target.value onto the real node before dispatching
    // the input event, and selectionStart is a settable property on <textarea> —
    // this sets the cursor to right after "MainLight_col" (position 13; the
    // string "MainLight_col" is 13 characters long) in the same step,
    // deterministically, instead of relying on jsdom's selection behavior when
    // re-setting an unchanged value.
    fireEvent.change(textarea, { target: { value: 'MainLight_col == 1', selectionStart: 13 } });

    // Scoped for the same reason as the previous test — see comment there.
    // The suggestion row is wired to onMouseDown (not onClick), matching the
    // existing Location dropdown's convention: onMouseDown fires before the
    // textarea's debounced onBlur can close the dropdown, whereas onClick
    // would lose the race (blur fires first, dropdown closes, click never
    // lands). fireEvent.click() only dispatches a 'click' event and would
    // never reach an onMouseDown handler, so this must fire mouseDown.
    fireEvent.mouseDown(within(textarea.parentElement as HTMLElement).getByText('MainLight_color'));

    expect(textarea.value).toBe('MainLight_color == 1');
  });

  it('offers a "(new channel)" suggestion for an unmatched this_-prefixed token in the Expression field', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });

  it('cycles the active suggestion with ArrowDown and accepts it with Enter', () => {
    renderPanel({
      scxmlContent:
        '<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel>' +
        '<data id="abc_one" expr="0"/><data id="abc_two" expr="0"/>' +
        '</datamodel><state id="StateA"/></scxml>',
    });

    fireEvent.click(screen.getByTitle('Add action'));
    const textarea = screen.getByPlaceholderText('expression') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'abc', selectionStart: 3 } });

    // First ArrowDown selects the first suggestion (abc_one), second
    // ArrowDown moves to the next one (abc_two) — proves activeIndex
    // actually cycles rather than accepting the default (index 0) suggestion.
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(textarea.value).toBe('abc_two');
  });

  it('shows a live preview of the highlighted suggestion while arrow-cycling, before it is accepted', () => {
    renderPanel({ scxmlContent: scxmlWithData('MainLight_color') });

    fireEvent.click(screen.getByTitle('Add action'));
    const textarea = screen.getByPlaceholderText('expression') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'MainLight_col == 1', selectionStart: 13 } });

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });

    // Previewed live in the textarea itself — matching the Location field's
    // existing arrow-cycle preview — without needing Enter/Tab to commit it.
    expect(textarea.value).toBe('MainLight_color == 1');
  });
});

describe('StateActionsPanel expression field mapped-channel suggestions', () => {
  afterEach(() => {
    useHostAPIStore.setState({ channels: [], channelMappings: [] });
  });

  it('shows the mapped physical channel as a hint next to a mapped-channel suggestion', () => {
    useHostAPIStore.setState({
      channels: [{ name: 'physical_out_1', type: 'out' }],
      channelMappings: [{ scxmlRef: 'aliasName', mappedChannel: 'physical_out_1' }],
    });
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'alias' } });

    expect(screen.getByText('aliasName')).toBeInTheDocument();
    expect(screen.getByText('→ physical_out_1')).toBeInTheDocument();
  });
});
