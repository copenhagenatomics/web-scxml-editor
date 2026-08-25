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

  it('suggests variables again right after an operator followed by a space', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'MainLight_color == ' } });

    expect(screen.getByText('MainLight_color')).toBeInTheDocument();
    expect(screen.getByText('conf_red')).toBeInTheDocument();
  });

  it('offers a new-channel suggestion for an unmatched this_-prefixed token', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'this_brand_new' } });

    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });

  it('replaces the token being typed with the selected suggestion (buildCondValue)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    const textarea = screen.getByPlaceholderText('Enter condition') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'MainLight_col' } });

    fireEvent.mouseDown(screen.getByText('MainLight_color'));

    expect(textarea).toHaveValue('MainLight_color');
  });

  it('appends the selected suggestion after a trailing space rather than replacing prior text (buildCondValue)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    const textarea = screen.getByPlaceholderText('Enter condition') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'MainLight_color ' } });

    fireEvent.mouseDown(screen.getByText('=='));

    expect(textarea).toHaveValue('MainLight_color ==');
  });
});
