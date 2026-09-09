import { describe, it, expect, afterEach } from 'vitest';
import { useHostAPIStore } from './host-api-store';

const initialState = useHostAPIStore.getState();

describe('host-api-store executeCommand error handling', () => {
  afterEach(() => {
    useHostAPIStore.setState(initialState, true);
  });

  it('shows a short, generic toast and pushes the full error to the Error Panel on command failure', async () => {
    const fullError = 'CS8510: something went wrong\n' + 'x'.repeat(2000) + '\n// generated code snippet...';

    useHostAPIStore.getState().registerCommand({
      id: 'generate-program',
      label: 'Generate Program',
      order: 0,
      run: () => {
        throw new Error(fullError);
      },
    });

    await useHostAPIStore.getState().executeCommand('generate-program');

    const { feedbackQueue, hostErrors } = useHostAPIStore.getState();

    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].message).toBe('Generate Program failed. See Error Panel for details.');
    expect(feedbackQueue[0].message).not.toContain(fullError);
    expect(feedbackQueue[0].level).toBe('error');

    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe(fullError);
    expect(hostErrors[0].level).toBe('error');
  });

  it('switches the validation panel to the Host Alerts tab so the full error is reachable', async () => {
    useHostAPIStore.getState().registerCommand({
      id: 'apply-to-system',
      label: 'Apply to System',
      order: 0,
      run: () => {
        throw new Error('boom');
      },
    });

    await useHostAPIStore.getState().executeCommand('apply-to-system');

    expect(useHostAPIStore.getState().requestedValidationTab).toBe('host-alerts');
  });

  it('does not touch the Error Panel or emit a failure toast when the command succeeds', async () => {
    useHostAPIStore.getState().registerCommand({
      id: 'ok-command',
      label: 'OK Command',
      order: 0,
      run: () => {},
    });

    await useHostAPIStore.getState().executeCommand('ok-command');

    expect(useHostAPIStore.getState().feedbackQueue).toHaveLength(0);
    expect(useHostAPIStore.getState().hostErrors).toHaveLength(0);
  });

  it('leaves short showFeedback calls (success/info toasts) unaffected', () => {
    useHostAPIStore.getState().showFeedback('Saved successfully', 'info');

    const { feedbackQueue } = useHostAPIStore.getState();
    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].message).toBe('Saved successfully');
  });

  it('leaves showFeedback as a plain passthrough regardless of message length or level (sanitization lives at the host-API boundary, see use-host-api-bridge.test.ts)', () => {
    const longMessage = 'x'.repeat(2000);
    useHostAPIStore.getState().showFeedback(longMessage, 'error');

    const { feedbackQueue, hostErrors } = useHostAPIStore.getState();
    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].message).toBe(longMessage);
    expect(hostErrors).toHaveLength(0);
  });

  it('clearHostErrors also cancels a pending Host Alerts tab request, not just the error list', () => {
    useHostAPIStore.getState().showErrors([{ message: 'boom', level: 'error' }]);
    expect(useHostAPIStore.getState().requestedValidationTab).toBe('host-alerts');

    useHostAPIStore.getState().clearHostErrors();

    const { hostErrors, requestedValidationTab } = useHostAPIStore.getState();
    expect(hostErrors).toHaveLength(0);
    expect(requestedValidationTab).toBeNull();
  });
});
