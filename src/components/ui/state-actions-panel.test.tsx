import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { StateActionsPanel } from './state-actions-panel';
import { useHostAPIStore } from '@/stores/host-api-store';
import { useActionClipboardStore } from '@/stores/action-clipboard-store';

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

describe('StateActionsPanel onexit tab visibility', () => {
  it('hides the onexit tab when the state has no onexit actions', () => {
    renderPanel();

    expect(screen.queryByText(/^onexit/)).not.toBeInTheDocument();
  });

  it('shows the onexit tab when the state has onexit actions', () => {
    renderPanel({
      exitActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    expect(screen.getByText(/^onexit/)).toBeInTheDocument();
  });

  it('falls back to onentry when switching to a state with no onexit actions while onexit was active', () => {
    const { rerender } = renderPanel({
      stateId: 'StateA',
      exitActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByText(/^onexit/));
    expect(screen.getByText(/^onexit/)).toHaveClass('text-primary');

    // Same component instance, new stateId with an empty exitActions list —
    // exactly how VisualDiagram drives this panel when the user selects a
    // different state on the canvas.
    rerender(
      <StateActionsPanel
        isVisible
        onClose={noop}
        stateId='StateB'
        entryActions={[]}
        exitActions={[]}
        internalEventActions={[]}
        scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="StateB"/></scxml>'
        stateType='simple'
        isInitial={false}
        canMarkInitial
        onToggleInitial={noop}
        onApply={noop}
        onApplyReactions={noop}
      />
    );

    expect(screen.queryByText(/^onexit/)).not.toBeInTheDocument();
    expect(screen.getByText(/^onentry/)).toHaveClass('text-primary');
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

  it('renders the Location and Expression fields in the normal (non-monospace) font', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));

    expect(screen.getByPlaceholderText('variable or channel')).not.toHaveClass('font-mono');
    expect(screen.getByPlaceholderText('expression')).not.toHaveClass('font-mono');
  });

  it('renders saved assign rows in the normal (non-monospace) font', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    expect(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'a = 1'),
    ).not.toHaveClass('font-mono');
  });

  it('does not offer a new-channel suggestion when the variable already exists', () => {
    renderPanel({ scxmlContent: scxmlWithData('this_channel') });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });

    expect(screen.queryByText('(new channel)')).not.toBeInTheDocument();
  });

  // A new this_ channel is declared by the parent's onApply (syncThisChannels), so the panel
  // saves it like any other row.
  it('saves an onentry assign to a new this_ channel through onApply', () => {
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

  it('saves an onexit assign to a new this_ channel with entryActions unchanged', () => {
    const onApply = vi.fn();
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
      exitActions: [{ type: 'assign', location: 'existingExit', expr: '9' }],
      onApply,
    });

    fireEvent.click(screen.getByText(/onexit/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith(['assign|a|1'], ['assign|existingExit|9', 'assign|this_channel|0']);
  });

  it('saves a reaction assigning a new this_ channel through onApplyReactions', () => {
    const onApplyReactions = vi.fn();
    renderPanel({ onApplyReactions });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('vector'), { target: { value: 'myEvent' } });
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'this_channel' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onApplyReactions).toHaveBeenCalledWith([
      expect.objectContaining({ event: 'myEvent', location: 'this_channel', expr: '0', type: 'internal' }),
    ]);
  });

  it('still calls onApply for a plain literal location', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), {
      target: { value: 'plainVar' },
    });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith(['assign|plainVar|1'], []);
  });

  it('picking a "(new channel)" in the Expression field commits nothing until Apply', () => {
    const onApply = vi.fn();
    renderPanel({
      entryActions: [{ type: 'assign', location: 'existingVar', expr: '1' }],
      onApply,
    });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'target' } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    fireEvent.mouseDown(screen.getByText('(new channel)'));

    // Selecting a suggestion is not applying: a form cancelled now leaves no stray channel behind.
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('expression')).toHaveValue('this_new_thing');
    expect(screen.getByPlaceholderText('variable or channel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith(['assign|existingVar|1', 'assign|target|this_new_thing'], []);
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

describe('StateActionsPanel Location → Expression keyboard flow', () => {
  it('moves focus to Expression after accepting a Location suggestion with Tab', async () => {
    renderPanel({ scxmlContent: scxmlWithData('speed') });

    fireEvent.click(screen.getByTitle('Add action'));
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'spe' } });
    fireEvent.keyDown(location, { key: 'Tab' });

    expect(location).toHaveValue('speed');
    await waitFor(() => expect(screen.getByPlaceholderText('expression')).toHaveFocus());
  });

  it('moves focus to Expression after picking a Location suggestion with the mouse', async () => {
    renderPanel({ scxmlContent: scxmlWithData('speed') });

    fireEvent.click(screen.getByTitle('Add action'));
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'spe' } });
    fireEvent.mouseDown(screen.getByText('speed'));

    expect(location).toHaveValue('speed');
    await waitFor(() => expect(screen.getByPlaceholderText('expression')).toHaveFocus());
  });

  it('Enter in Location (no dropdown open) moves to Expression without applying; Enter there applies', async () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Add action'));
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'plainVar' } });
    fireEvent.keyDown(location, { key: 'Enter' });

    expect(onApply).not.toHaveBeenCalled();
    const expr = screen.getByPlaceholderText('expression');
    await waitFor(() => expect(expr).toHaveFocus());

    fireEvent.change(expr, { target: { value: '1' } });
    fireEvent.keyDown(expr, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith(['assign|plainVar|1'], []);
  });

  it('places the caret at the end of an existing expression when editing a row', async () => {
    renderPanel({
      scxmlContent: scxmlWithData('speed'),
      entryActions: [{ type: 'assign', location: 'speed', expr: 'b + 1' }],
    });

    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'speed = b + 1'),
    );
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'spe' } });
    fireEvent.keyDown(location, { key: 'Tab' });

    const expr = screen.getByPlaceholderText('expression') as HTMLTextAreaElement;
    await waitFor(() => expect(expr).toHaveFocus());
    expect(expr.selectionStart).toBe('b + 1'.length);
  });

  it('Enter on a Location suggestion with an empty Expression moves to Expression without applying', async () => {
    const onApply = vi.fn();
    renderPanel({ scxmlContent: scxmlWithData('speed'), onApply });

    fireEvent.click(screen.getByTitle('Add action'));
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'spe' } });
    fireEvent.keyDown(location, { key: 'Enter' });

    expect(onApply).not.toHaveBeenCalled();
    expect(location).toHaveValue('speed');
    await waitFor(() => expect(screen.getByPlaceholderText('expression')).toHaveFocus());
  });
});

describe('StateActionsPanel autosave on leaving the form', () => {
  const panelEl = (overrides: Partial<Props>) => (
    <StateActionsPanel
      isVisible
      onClose={noop}
      stateId='StateA'
      entryActions={[]}
      exitActions={[]}
      internalEventActions={[]}
      scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="StateA"/><state id="StateB"/></scxml>'
      stateType='simple'
      isInitial={false}
      canMarkInitial
      onToggleInitial={noop}
      onApply={noop}
      onApplyReactions={noop}
      {...overrides}
    />
  );

  const fillNewAssign = (location: string, expr: string) => {
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: location } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: expr } });
  };

  afterEach(() => useHostAPIStore.setState({ feedbackQueue: [] }));

  it('saves a complete form when clicking elsewhere in the panel', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fillNewAssign('x', '1');
    fireEvent.mouseDown(screen.getByText('StateA'));

    expect(onApply).toHaveBeenCalledWith(['assign|x|1'], []);
    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('saves when switching tabs', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fillNewAssign('x', '1');
    fireEvent.click(screen.getByText(/event reactions/));

    expect(onApply).toHaveBeenCalledWith(['assign|x|1'], []);
  });

  it('saves to the state being edited when another state is selected', () => {
    const onApplyA = vi.fn();
    const onApplyB = vi.fn();
    const { rerender } = render(panelEl({ onApply: onApplyA }));

    fillNewAssign('x', '1');
    rerender(panelEl({ stateId: 'StateB', onApply: onApplyB }));

    expect(onApplyA).toHaveBeenCalledWith(['assign|x|1'], []);
    expect(onApplyB).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('saves when the panel is hidden', () => {
    const onApply = vi.fn();
    const { rerender } = render(panelEl({ onApply }));

    fillNewAssign('x', '1');
    rerender(panelEl({ onApply, isVisible: false }));

    expect(onApply).toHaveBeenCalledWith(['assign|x|1'], []);
  });

  it('does not save, toast or create an undo entry for a row opened and left unchanged', () => {
    const onApply = vi.fn();
    renderPanel({ entryActions: [{ type: 'assign', location: 'a', expr: '1' }], onApply });

    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'a = 1'),
    );
    fireEvent.mouseDown(screen.getByText('StateA'));

    expect(onApply).not.toHaveBeenCalled();
    expect(useHostAPIStore.getState().feedbackQueue).toEqual([]);
  });

  it('drops an incomplete form on leave and says so', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'x' } });
    fireEvent.mouseDown(screen.getByText('StateA'));

    expect(onApply).not.toHaveBeenCalled();
    expect(useHostAPIStore.getState().feedbackQueue.map((f) => [f.message, f.level])).toEqual([
      ['Incomplete action not saved.', 'warning'],
    ]);
    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('drops an untouched new form silently', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.mouseDown(screen.getByText('StateA'));

    expect(useHostAPIStore.getState().feedbackQueue).toEqual([]);
  });

  it('Discard still throws the edit away', () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fillNewAssign('x', '1');
    fireEvent.click(screen.getByText('Discard'));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });
});

describe('StateActionsPanel Enter to save', () => {
  it('tells the user in the form that Enter saves and Esc discards', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));

    expect(screen.getByTestId('form-key-hints')).toHaveTextContent('Enter to save · Esc to discard');
    expect(screen.getByText('Apply')).toHaveAttribute('title', 'Apply (Enter)');
    expect(screen.getByText('Discard')).toHaveAttribute('title', 'Discard (Esc)');
  });

  const twoVars =
    '<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel><data id="maxspeed" expr="0"/><data id="speed" expr="0"/></datamodel><state id="StateA"/></scxml>';

  it('Enter in Location saves an edited row when Expression is already filled', () => {
    const onApply = vi.fn();
    renderPanel({ entryActions: [{ type: 'assign', location: 'a', expr: '1' }], onApply });

    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'a = 1'),
    );
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'b' } });
    fireEvent.keyDown(location, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith(['assign|b|1'], []);
    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('Enter with the suggestion list open saves the exact typed name, not a longer one listed first', () => {
    const onApply = vi.fn();
    renderPanel({
      scxmlContent: twoVars,
      entryActions: [{ type: 'assign', location: 'speed', expr: '1' }],
      onApply,
    });

    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'speed = 1'),
    );
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'speed' } });
    // Both names contain "speed" and maxspeed is listed first.
    expect(screen.getByText('maxspeed')).toBeInTheDocument();
    fireEvent.keyDown(location, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith(['assign|speed|1'], []);
  });

  it('Enter with a highlighted suggestion saves that suggestion when Expression is filled', () => {
    const onApply = vi.fn();
    renderPanel({
      scxmlContent: twoVars,
      entryActions: [{ type: 'assign', location: 'speed', expr: '1' }],
      onApply,
    });

    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'speed = 1'),
    );
    const location = screen.getByPlaceholderText('variable or channel');
    fireEvent.change(location, { target: { value: 'speed' } });
    fireEvent.keyDown(location, { key: 'ArrowDown' }); // highlights maxspeed
    fireEvent.keyDown(location, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith(['assign|maxspeed|1'], []);
  });

  it('Enter in the Event field does not save a reaction with empty Location/Expression', () => {
    const onApplyReactions = vi.fn();
    renderPanel({ onApplyReactions });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.keyDown(screen.getByPlaceholderText('vector'), { key: 'Enter' });

    expect(onApplyReactions).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('vector')).toBeInTheDocument();
  });

  it('Enter in Event saves a complete reaction', () => {
    const onApplyReactions = vi.fn();
    renderPanel({ onApplyReactions });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: '1' } });
    fireEvent.keyDown(screen.getByPlaceholderText('vector'), { key: 'Enter' });

    expect(onApplyReactions).toHaveBeenCalledWith([
      expect.objectContaining({ event: 'vector', location: 'x', expr: '1', type: 'internal' }),
    ]);
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

describe('StateActionsPanel copy action', () => {
  afterEach(() => {
    useActionClipboardStore.setState({ copied: null });
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  it('copies an assign row to the clipboard store when its Copy button is clicked', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Copy action'));

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'a', expr: '1' },
    });
  });

  it('shows a confirmation toast after copying', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Copy action'));

    expect(useHostAPIStore.getState().feedbackQueue.map((f) => f.message)).toContain('Action copied.');
  });

  it('clicking Copy does not open the row for editing', () => {
    renderPanel({
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
    });

    fireEvent.click(screen.getByTitle('Copy action'));

    expect(screen.queryByPlaceholderText('variable or channel')).not.toBeInTheDocument();
  });

  it('renders one Copy button per assign row', () => {
    renderPanel({
      entryActions: [
        { type: 'assign', location: 'a', expr: '1' },
        { type: 'assign', location: 'b', expr: '2' },
      ],
    });

    expect(screen.getAllByTitle('Copy action')).toHaveLength(2);
  });

  it('copies a reaction row to the clipboard store when its Copy button is clicked', () => {
    renderPanel({
      internalEventActions: [{ event: 'evtA', location: 'x', expr: '1', type: 'internal' }],
    });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Copy action'));

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'reaction',
      row: { event: 'evtA', location: 'x', expr: '1', type: 'internal' },
    });
  });
});

describe('StateActionsPanel paste action', () => {
  afterEach(() => {
    useActionClipboardStore.setState({ copied: null });
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  it('disables Paste when nothing has been copied', () => {
    renderPanel();

    expect(screen.getByTitle('Copy an action first')).toBeDisabled();
  });

  it('pastes a copied assign action as a new onentry row and calls onApply', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenCalledWith(['assign|copied|42'], []);
  });

  it('shows a confirmation toast after pasting', () => {
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel();

    fireEvent.click(screen.getByTitle('Paste action'));

    expect(useHostAPIStore.getState().feedbackQueue.map((f) => f.message)).toContain('Action pasted.');
  });

  it('pastes a copied assign action from onentry into onexit (cross-tab)', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({
      onApply,
      entryActions: [{ type: 'assign', location: 'a', expr: '1' }],
      exitActions: [{ type: 'assign', location: 'existingExit', expr: '9' }],
    });

    fireEvent.click(screen.getByText(/onexit/));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenCalledWith(['assign|a|1'], ['assign|existingExit|9', 'assign|copied|42']);
  });

  it('pastes the same copied action twice, producing two independent rows', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenLastCalledWith(['assign|copied|42', 'assign|copied|42'], []);
  });

  it('pastes a copied assign action into the reactions tab with default event/type', () => {
    const onApplyReactions = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApplyReactions });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApplyReactions).toHaveBeenCalledWith([
      expect.objectContaining({ event: 'vector', location: 'copied', expr: '42', type: 'internal' }),
    ]);
  });

  it('pastes a copied reaction into onentry as an assign action', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'reaction',
      row: { event: 'evtA', location: 'x', expr: '1', type: 'external' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApply).toHaveBeenCalledWith(['assign|x|1'], []);
  });

  it('pastes a copied reaction as a new reaction row and calls onApplyReactions', () => {
    const onApplyReactions = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'reaction',
      row: { event: 'evtA', location: 'x', expr: '1', type: 'internal' },
    });
    renderPanel({ onApplyReactions });

    fireEvent.click(screen.getByText(/event reactions/));
    fireEvent.click(screen.getByTitle('Paste action'));

    expect(onApplyReactions).toHaveBeenCalledWith([
      expect.objectContaining({ event: 'evtA', location: 'x', expr: '1', type: 'internal' }),
    ]);
  });

  it('a pasted row can be clicked afterward to edit it like any other row', () => {
    const onApply = vi.fn();
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });
    renderPanel({ onApply });

    fireEvent.click(screen.getByTitle('Paste action'));
    fireEvent.click(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent === 'copied = 42'),
    );

    expect(screen.getByPlaceholderText('variable or channel')).toHaveValue('copied');
    expect(screen.getByPlaceholderText('expression')).toHaveValue('42');
  });

  it('supports copying an action in one state and pasting it into a different state (headline use case)', () => {
    const onApplyStateA = vi.fn();
    const onApplyStateB = vi.fn();

    const { rerender } = render(
      <StateActionsPanel
        isVisible
        onClose={noop}
        stateId='StateA'
        entryActions={[{ type: 'assign', location: 'copied', expr: '42' }]}
        exitActions={[]}
        internalEventActions={[]}
        scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="StateA"/></scxml>'
        stateType='simple'
        isInitial={false}
        canMarkInitial
        onToggleInitial={noop}
        onApply={onApplyStateA}
        onApplyReactions={noop}
      />
    );

    // Copy the row from StateA.
    fireEvent.click(screen.getByTitle('Copy action'));
    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'copied', expr: '42' },
    });

    // Switch to StateB — same component instance, new stateId/props, exactly
    // how VisualDiagram drives this panel in the real app (single instance,
    // no `key`, state switch is purely a prop change).
    rerender(
      <StateActionsPanel
        isVisible
        onClose={noop}
        stateId='StateB'
        entryActions={[]}
        exitActions={[]}
        internalEventActions={[]}
        scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="StateB"/></scxml>'
        stateType='simple'
        isInitial={false}
        canMarkInitial
        onToggleInitial={noop}
        onApply={onApplyStateB}
        onApplyReactions={noop}
      />
    );

    // The clipboard survived the state switch (it's a module-level store, not
    // component state) — Paste should still be enabled.
    fireEvent.click(screen.getByTitle('Paste action'));

    // Pasted into StateB's (empty) onentry list, via StateB's onApply — not
    // StateA's, and StateB's list didn't inherit anything from StateA beyond
    // the pasted row itself.
    expect(onApplyStateB).toHaveBeenCalledWith(['assign|copied|42'], []);
    expect(onApplyStateA).not.toHaveBeenCalledWith(expect.arrayContaining(['assign|copied|42']), expect.anything());
  });
});
