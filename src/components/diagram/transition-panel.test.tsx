import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransitionPanel } from './transition-panel';
import { useHostAPIStore } from '@/stores/host-api-store';

const noop = () => {};

function renderPanel(overrides: Partial<Parameters<typeof TransitionPanel>[0]> = {}) {
  return render(
    <TransitionPanel
      edgeId='e1'
      source='StateA'
      target='StateB'
      cond=''
      scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel><data id="MainLight_color" expr="0"/></datamodel><state id="StateA"/><state id="StateB"/></scxml>'
      onApply={() => undefined}
      onClose={noop}
      {...overrides}
    />
  );
}

beforeEach(() => {
  useHostAPIStore.setState({
    channels: [{ name: 'conf_red', type: 'cf' }],
    channelMappings: [],
    events: [],
  });
});

describe('TransitionPanel condition-mode suggestions (characterization)', () => {
  it('suggests known variables and channels by substring match while typing', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'color' } });

    expect(screen.getByText('MainLight_color')).toBeInTheDocument();
  });

  it('suggests operators right after a completed identifier followed by a space', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'MainLight_color ' } });

    expect(screen.getByText('==')).toBeInTheDocument();
  });

  it('waits for a letter after an operator instead of listing every name (operand may be numeric)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    const input = screen.getByPlaceholderText('Enter condition');
    fireEvent.change(input, { target: { value: 'MainLight_color == ' } });

    expect(screen.queryByText('conf_red')).not.toBeInTheDocument();
    expect(screen.queryByText(/No match/)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'MainLight_color == 2' } });
    expect(screen.queryByText(/No match/)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'MainLight_color == co' } });
    expect(screen.getByText('conf_red')).toBeInTheDocument();
  });

  it('suggests for the token under the caret when editing the left operand of an existing condition', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    const input = screen.getByPlaceholderText('Enter condition') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Main == true' } });
    input.setSelectionRange(4, 4);
    fireEvent.select(input);

    const option = screen.getByText('MainLight_color');
    fireEvent.mouseDown(option);
    expect(input.value).toBe('MainLight_color == true');
  });

  it('offers a new-channel suggestion for an unmatched this_-prefixed token', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'this_brand_new' } });

    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });

  // The handler behind onApply declares the channel (syncThisChannels); the panel just applies.
  it.each([['this_brand_new'], ['this_number == 2'], ['!this_door']])(
    'applies %j as a plain condition on a single Enter',
    (value) => {
      const onApply = vi.fn(() => undefined);
      renderPanel({ onApply });
      fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
      const textarea = screen.getByPlaceholderText('Enter condition');
      fireEvent.change(textarea, { target: { value } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ newValue: value, editingField: 'cond' }));
    }
  );

  it('replaces the token being typed with the selected suggestion (buildExpressionValue)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    const textarea = screen.getByPlaceholderText('Enter condition') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'MainLight_col' } });

    fireEvent.mouseDown(screen.getByText('MainLight_color'));

    expect(textarea).toHaveValue('MainLight_color');
  });

  it('appends the selected suggestion after a trailing space rather than replacing prior text (buildExpressionValue)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    const textarea = screen.getByPlaceholderText('Enter condition') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'MainLight_color ' } });

    fireEvent.mouseDown(screen.getByText('=='));

    expect(textarea).toHaveValue('MainLight_color ==');
  });
});

describe('TransitionPanel "after X" expression suggestions', () => {
  const EVENT_PLACEHOLDER = 'Enter event, or "after Xs"...';

  it('suggests channels and variables while typing an "after" delay expression', () => {
    renderPanel();
    const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'after conf' } });
    expect(screen.getByText('conf_red')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'after (color' } });
    expect(screen.getByText('MainLight_color')).toBeInTheDocument();
  });

  it('also suggests in Condition mode, since "after X" is parsed in either mode', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'after conf' } });
    expect(screen.getByText('conf_red')).toBeInTheDocument();
  });

  it('replaces only the token under the caret when a suggestion is accepted', () => {
    renderPanel();
    const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'after co s' } });
    // Earlier tests end on a bare mouseDown (accepting a suggestion), which leaves React's
    // onSelect plugin thinking the mouse is still held and swallowing select events. A real
    // click always finishes with a mouseup, so release it before moving the caret.
    fireEvent.mouseUp(input);
    input.setSelectionRange('after co'.length, 'after co'.length);
    fireEvent.select(input);

    fireEvent.mouseDown(screen.getByText('conf_red'));
    expect(input.value).toBe('after conf_red s');
  });

  it('shows no suggestions at the unit position, so Enter saves the time transition', () => {
    const onApply = vi.fn(() => undefined);
    renderPanel({ onApply });
    const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'after conf_red s' } });

    expect(screen.queryByText('MainLight_color')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      editingField: 'event',
      delay: { type: 'delayexpr', value: 'conf_red * 1000' },
    }));
  });

  // Regression: "after x * 5s" used to be saved as a literal event name with no send/cancel.
  it('saves "after <expr> * 5s" as a time transition, not a plain event', () => {
    const onApply = vi.fn(() => undefined);
    renderPanel({ onApply });
    const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'after MainLight_color * 5s' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      newValue: 'StateA_t_0_timeEvent_0',
      delay: { type: 'delayexpr', value: 'MainLight_color * 5 * 1000' },
      cancelSendId: 'StateA_t_0_timeEvent_0',
    }));
  });

  it.each([['after MainLight_color * 5 sec'], ['foo, after MainLight_color']])(
    'refuses to save %j as a plain event and shows the accepted formats',
    (value) => {
      const onApply = vi.fn(() => undefined);
      renderPanel({ onApply });
      const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER);
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onApply).not.toHaveBeenCalled();
      expect(screen.getByText(/is not a valid time transition/)).toBeInTheDocument();
    }
  );

  it('still saves an event whose name merely starts with "after"', () => {
    const onApply = vi.fn(() => undefined);
    renderPanel({ onApply });
    const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'afterSave' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ newValue: 'afterSave', editingField: 'event' }));
  });

  it('offers a new-channel row for an unknown this_ name in a delay', () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(EVENT_PLACEHOLDER), { target: { value: 'after this_brand_new' } });
    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });

  // The handler behind onApply declares the channel (syncThisChannels on the delay expression).
  it('saves "after this_x * 6 s" as a time transition with the channel in the delay', () => {
    const onApply = vi.fn(() => undefined);
    renderPanel({ onApply });
    const input = screen.getByPlaceholderText(EVENT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'after this_sasas * 6 s' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      editingField: 'event',
      delay: { type: 'delayexpr', value: 'this_sasas * 6 * 1000' },
    }));
  });

  it('suggests for the "after" segment of a merged event list', () => {
    useHostAPIStore.setState({ events: [{ name: 'foo', type: 'cf' }] as never });
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(EVENT_PLACEHOLDER), { target: { value: 'foo, after conf' } });
    expect(screen.getByText('conf_red')).toBeInTheDocument();
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
  });
});
