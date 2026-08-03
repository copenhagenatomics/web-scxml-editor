import { describe, it, expect, afterEach } from 'vitest';
import { useEditorStore } from './editor-store';

describe('editor-store focusTarget', () => {
  afterEach(() => {
    useEditorStore.getState().setFocusTarget(null);
  });

  it('defaults to null', () => {
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });

  it('sets and clears the focus target', () => {
    useEditorStore.getState().setFocusTarget({ stateId: 'A', targetStateId: 'B' });
    expect(useEditorStore.getState().focusTarget).toEqual({ stateId: 'A', targetStateId: 'B' });

    useEditorStore.getState().setFocusTarget(null);
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });
});
