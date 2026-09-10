import { describe, it, expect, beforeEach } from 'vitest';
import { useStateClipboardStore } from './state-clipboard-store';

describe('useStateClipboardStore', () => {
  beforeEach(() => {
    useStateClipboardStore.setState({ copied: null, copiedInitialIds: new Set() });
  });

  it('starts with an empty clipboard', () => {
    expect(useStateClipboardStore.getState().copied).toBeNull();
    expect(useStateClipboardStore.getState().copiedInitialIds.size).toBe(0);
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

  it('defaults copiedInitialIds to an empty set when omitted', () => {
    useStateClipboardStore.getState().copy([{ '@_id': 'A' }] as any);
    expect(useStateClipboardStore.getState().copiedInitialIds.size).toBe(0);
  });

  it('stores which copied ids were marked Initial by their source parent', () => {
    const states = [{ '@_id': 'A' }, { '@_id': 'B' }] as any;
    useStateClipboardStore.getState().copy(states, new Set(['A']));
    expect(useStateClipboardStore.getState().copiedInitialIds.has('A')).toBe(true);
    expect(useStateClipboardStore.getState().copiedInitialIds.has('B')).toBe(false);
  });
});
