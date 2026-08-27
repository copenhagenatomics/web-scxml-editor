import { describe, it, expect, beforeEach } from 'vitest';
import { useStateClipboardStore } from './state-clipboard-store';

describe('useStateClipboardStore', () => {
  beforeEach(() => {
    useStateClipboardStore.setState({ copied: null });
  });

  it('starts with an empty clipboard', () => {
    expect(useStateClipboardStore.getState().copied).toBeNull();
  });

  it('stores copied states via copy()', () => {
    const states = [{ '@_id': 'A' }] as any;
    useStateClipboardStore.getState().copy(states);
    expect(useStateClipboardStore.getState().copied).toBe(states);
  });

  it('replaces previously copied states on a new copy', () => {
    useStateClipboardStore.getState().copy([{ '@_id': 'A' }] as any);
    const second = [{ '@_id': 'B' }] as any;
    useStateClipboardStore.getState().copy(second);
    expect(useStateClipboardStore.getState().copied).toBe(second);
  });
});
