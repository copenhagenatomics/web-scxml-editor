import { describe, it, expect, afterEach, vi } from 'vitest';
import { useHostAPIStore } from './host-api-store';
import { useEditorStore } from './editor-store';
import { validateScxmlContent } from '@/lib/validators/validate-content';

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

  it('normalizes a non-Error throw (e.g. a raw string) into the Error Panel message instead of losing the detail', async () => {
    useHostAPIStore.getState().registerCommand({
      id: 'throws-string',
      label: 'Throws String',
      order: 0,
      run: () => {
        throw 'raw string failure';
      },
    });

    await useHostAPIStore.getState().executeCommand('throws-string');

    const { hostErrors } = useHostAPIStore.getState();
    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe('raw string failure');
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

const SCXML_HEAD = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">';
const CLEAN_SCXML = `${SCXML_HEAD}<state id="A"><transition event="go" target="B"/></state><state id="B"/></scxml>`;
// Unreachable state -> a warning, no errors.
const WARNING_ONLY_SCXML = `${SCXML_HEAD}<state id="A"><transition event="go" target="B"/></state><state id="B"/><state id="Orphan"/></scxml>`;
// Unresolved transition target -> an error.
const ERROR_SCXML = `${SCXML_HEAD}<state id="A"><transition event="go" target="Missing"/></state></scxml>`;

describe('host-api-store executeCommand requiresValidScxml gate', () => {
  afterEach(() => {
    useHostAPIStore.setState(initialState, true);
    useEditorStore.getState().reset();
  });

  const registerApply = (requiresValidScxml?: 'errors' | 'errors-and-warnings') => {
    const run = vi.fn();
    useHostAPIStore.getState().registerCommand({ id: 'apply', label: 'Apply', order: 0, requiresValidScxml, run });
    return run;
  };

  it('fixtures produce the issue mix the tests rely on', () => {
    const severities = (xml: string) => validateScxmlContent(xml).map(i => i.severity);
    expect(severities(CLEAN_SCXML)).toEqual([]);
    expect(severities(WARNING_ONLY_SCXML).length).toBeGreaterThan(0);
    expect(severities(WARNING_ONLY_SCXML)).not.toContain('error');
    expect(severities(ERROR_SCXML)).toContain('error');
  });

  it('does not run the command when the document has errors, and points the user at the Validation tab', async () => {
    useEditorStore.getState().setContent(ERROR_SCXML);
    const run = registerApply('errors');

    await useHostAPIStore.getState().executeCommand('apply');

    expect(run).not.toHaveBeenCalled();
    const { feedbackQueue, requestedValidationTab, hostErrors, commands } = useHostAPIStore.getState();
    expect(requestedValidationTab).toBe('validation');
    expect(feedbackQueue).toHaveLength(1);
    expect(feedbackQueue[0].level).toBe('warning');
    expect(feedbackQueue[0].message).toMatch(/^Fix \d+ errors? before Apply\.$/);
    expect(hostErrors).toHaveLength(0);
    expect(commands[0].isExecuting).toBe(false);
  });

  it('re-validates at click time instead of trusting stale debounced errors', async () => {
    // Store says clean (debounce has not fired yet) but the content is broken.
    useEditorStore.getState().setContent(ERROR_SCXML);
    useEditorStore.getState().setErrors([]);
    const blockedRun = registerApply('errors');
    await useHostAPIStore.getState().executeCommand('apply');
    expect(blockedRun).not.toHaveBeenCalled();
    // The fresh result is published so the Validation panel shows what blocked Apply.
    expect(useEditorStore.getState().errors.some(e => e.severity === 'error')).toBe(true);

    // And the reverse: stale errors left over from before a fix must not block.
    useEditorStore.getState().setContent(CLEAN_SCXML);
    useEditorStore.getState().setErrors([{ message: 'stale', severity: 'error' }]);
    const run = registerApply('errors');
    await useHostAPIStore.getState().executeCommand('apply');
    expect(run).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().errors).toEqual([]);
  });

  it("'errors' mode lets a warnings-only document through", async () => {
    useEditorStore.getState().setContent(WARNING_ONLY_SCXML);
    const run = registerApply('errors');

    await useHostAPIStore.getState().executeCommand('apply');

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("'errors-and-warnings' mode blocks on warnings too", async () => {
    useEditorStore.getState().setContent(WARNING_ONLY_SCXML);
    const run = registerApply('errors-and-warnings');

    await useHostAPIStore.getState().executeCommand('apply');

    expect(run).not.toHaveBeenCalled();
    expect(useHostAPIStore.getState().feedbackQueue[0].message).toMatch(/^Fix \d+ warnings? before Apply\.$/);
  });

  it('runs when the document is clean, even with Host Alerts present (those are the host report, not ours)', async () => {
    useEditorStore.getState().setContent(CLEAN_SCXML);
    useHostAPIStore.getState().showErrors([{ message: 'server rejected last apply', level: 'error' }]);
    const run = registerApply('errors-and-warnings');

    await useHostAPIStore.getState().executeCommand('apply');

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('leaves commands without the flag ungated', async () => {
    useEditorStore.getState().setContent(ERROR_SCXML);
    const run = registerApply();

    await useHostAPIStore.getState().executeCommand('apply');

    expect(run).toHaveBeenCalledTimes(1);
    expect(useHostAPIStore.getState().feedbackQueue).toHaveLength(0);
  });
});
