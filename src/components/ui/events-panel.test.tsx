import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EventsPanel } from './events-panel';
import { useHostAPIStore } from '@/stores/host-api-store';

function noop() {}

afterEach(() => {
  cleanup();
  useHostAPIStore.setState({ events: [], feedbackQueue: [] });
});

function getFeedback() {
  return useHostAPIStore.getState().feedbackQueue;
}

describe('EventsPanel', () => {
  it('shows feedback once a renamed user action is committed (blur)', () => {
    useHostAPIStore.setState({ events: [{ name: 'userAc', type: 'string', hasArgument: false }] });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    const input = screen.getByDisplayValue('userAc') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'userAction' } });
    expect(getFeedback()).toHaveLength(0); // no spam while still typing

    fireEvent.blur(input);
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toMatch(/renamed/i);
  });

  it('does not show feedback on blur when the name was not changed', () => {
    useHostAPIStore.setState({ events: [{ name: 'userAc', type: 'string', hasArgument: false }] });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    const input = screen.getByDisplayValue('userAc') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(getFeedback()).toHaveLength(0);
  });

  it('shows feedback when an argument field (Default/Min/Max) is committed', () => {
    useHostAPIStore.setState({
      events: [{ name: 'newUaWithArg', type: 'string', hasArgument: true, defaultValue: '2', min: 0, max: 12, unit: 'l/min' }],
    });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    const defaultInput = screen.getByDisplayValue('2') as HTMLInputElement;
    fireEvent.focus(defaultInput);
    fireEvent.change(defaultInput, { target: { value: '5' } });
    fireEvent.blur(defaultInput);

    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toMatch(/default/i);
  });

  it('commits and shows feedback on Enter, without waiting for blur', () => {
    useHostAPIStore.setState({ events: [{ name: 'userAc', type: 'string', hasArgument: false }] });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    const input = screen.getByDisplayValue('userAc') as HTMLInputElement;
    input.focus(); // real focus, so the Enter handler's blur() actually fires
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'userAction' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toMatch(/renamed/i);
  });

  it('shows feedback when the Unit is changed via the searchable select', () => {
    useHostAPIStore.setState({
      events: [{ name: 'newUaWithArg', type: 'string', hasArgument: true, defaultValue: '2', min: 0, max: 12, unit: 'l/min' }],
    });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    fireEvent.click(screen.getByText('l/min'));
    fireEvent.click(screen.getByRole('button', { name: 'bar' }));

    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toMatch(/unit/i);
  });

  it('shows feedback when a new user action is added', () => {
    useHostAPIStore.setState({ events: [] });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    fireEvent.click(screen.getByText('Add user action'));
    fireEvent.change(screen.getByPlaceholderText('user action name'), { target: { value: 'newAction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(useHostAPIStore.getState().events).toHaveLength(1);
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toMatch(/added/i);
  });

  it('shows feedback when a user action is deleted', () => {
    useHostAPIStore.setState({ events: [{ name: 'userAc', type: 'string', hasArgument: false }] });
    render(<EventsPanel isVisible={true} onClose={noop} />);

    fireEvent.click(screen.getByTitle('Delete'));

    expect(useHostAPIStore.getState().events).toHaveLength(0);
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toMatch(/deleted/i);
  });
});
