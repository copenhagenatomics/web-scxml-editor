import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHostAPIBridge } from './use-host-api-bridge';
import { useHostAPIStore } from '@/stores/host-api-store';

const initialHostAPIState = useHostAPIStore.getState();

describe('useHostAPIBridge showFeedback sanitization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ScxmlEditorAPI;
  });

  afterEach(() => {
    act(() => {
      cleanup();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    useHostAPIStore.setState(initialHostAPIState, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ScxmlEditorAPI;
  });

  it('shortens a long error-level showFeedback call from the host and preserves the full text in the Error Panel', () => {
    renderHook(() => useHostAPIBridge());

    // Simulates the LoopControl host calling window.ScxmlEditorAPI.showFeedback
    // directly with the full compiler/validation output from program generation
    // (the host's run() catches its own error internally rather than throwing,
    // so this never passes through executeCommand's catch block).
    const fullError =
      "Unexpected error applying program changes: An error occurred trying to start process '/bin/bash' " +
      "with working directory 'D:\\CopenhagenAtomics\\CS_Jobs\\CA_LoopCode\\LoopControl\\bin\\Debug\\net8.0'. " +
      'The system cannot find the file specified.';

    act(() => {
      window.ScxmlEditorAPI.showFeedback(fullError, 'error');
    });

    const { feedbackQueue, hostErrors } = useHostAPIStore.getState();

    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].message).toBe('Failed generating program. See Error Panel for details.');
    expect(feedbackQueue[0].message).not.toContain(fullError);
    expect(feedbackQueue[0].level).toBe('error');

    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe(fullError);
    expect(hostErrors[0].level).toBe('error');
  });

  it('redirects a short host error message too (no length gate — every host-reported error goes to the Error Panel)', () => {
    renderHook(() => useHostAPIBridge());

    act(() => {
      window.ScxmlEditorAPI.showFeedback('Invalid channel mapping.', 'error');
    });

    const { feedbackQueue, hostErrors } = useHostAPIStore.getState();
    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].message).toBe('Failed generating program. See Error Panel for details.');
    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe('Invalid channel mapping.');
  });

  it('leaves non-error host feedback untouched regardless of length', () => {
    renderHook(() => useHostAPIBridge());

    const longInfo = 'i'.repeat(400);
    act(() => {
      window.ScxmlEditorAPI.showFeedback(longInfo, 'info');
    });

    const { feedbackQueue, hostErrors } = useHostAPIStore.getState();
    expect(feedbackQueue[0].message).toBe(longInfo);
    expect(hostErrors).toHaveLength(0);
  });

  it('sanitizes feedback the host queued before React mounted (the pre-ready _q flush)', () => {
    const fullError = 'CS8510: something went wrong\n' + 'x'.repeat(2000) + '\n// generated code snippet...';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ScxmlEditorAPI = {
      _q: {
        ready: [],
        commands: [],
        ops: [{ type: 'feedback', message: fullError, level: 'error' }],
      },
    };

    renderHook(() => useHostAPIBridge());

    const { feedbackQueue, hostErrors } = useHostAPIStore.getState();
    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].message).toBe('Failed generating program. See Error Panel for details.');
    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe(fullError);
  });

  it('preserves clearErrors() -> error feedback ordering queued before React mounted', () => {
    const fullError = 'boom while applying program';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ScxmlEditorAPI = {
      _q: {
        ready: [],
        commands: [],
        ops: [
          { type: 'clearErrors' },
          { type: 'feedback', message: fullError, level: 'error' },
        ],
      },
    };

    renderHook(() => useHostAPIBridge());

    const { hostErrors } = useHostAPIStore.getState();
    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe(fullError);
  });

  it('preserves error feedback -> clearErrors() ordering queued before React mounted', () => {
    const fullError = 'boom while applying program';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ScxmlEditorAPI = {
      _q: {
        ready: [],
        commands: [],
        ops: [
          { type: 'feedback', message: fullError, level: 'error' },
          { type: 'clearErrors' },
        ],
      },
    };

    renderHook(() => useHostAPIBridge());

    const { hostErrors, requestedValidationTab } = useHostAPIStore.getState();
    expect(hostErrors).toHaveLength(0);
    expect(requestedValidationTab).toBeNull();
  });

  it('preserves showErrors() -> clearErrors() ordering queued before React mounted', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ScxmlEditorAPI = {
      _q: {
        ready: [],
        commands: [],
        ops: [
          { type: 'showErrors', errors: [{ message: 'boom via showErrors', level: 'error' }] },
          { type: 'clearErrors' },
        ],
      },
    };

    renderHook(() => useHostAPIBridge());

    const { hostErrors, requestedValidationTab } = useHostAPIStore.getState();
    expect(hostErrors).toHaveLength(0);
    expect(requestedValidationTab).toBeNull();
  });

  it('preserves clearErrors() -> showErrors() ordering queued before React mounted', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ScxmlEditorAPI = {
      _q: {
        ready: [],
        commands: [],
        ops: [
          { type: 'clearErrors' },
          { type: 'showErrors', errors: [{ message: 'boom via showErrors', level: 'error' }] },
        ],
      },
    };

    renderHook(() => useHostAPIBridge());

    const { hostErrors, requestedValidationTab } = useHostAPIStore.getState();
    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe('boom via showErrors');
    expect(requestedValidationTab).toBe('host-alerts');
  });
});
