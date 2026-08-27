import { describe, it, expect, afterEach } from 'vitest';
import { useActionClipboardStore } from './action-clipboard-store';

afterEach(() => {
  useActionClipboardStore.setState({ copied: null });
});

describe('useActionClipboardStore', () => {
  it('starts with nothing copied', () => {
    expect(useActionClipboardStore.getState().copied).toBeNull();
  });

  it('stores a copied action', () => {
    useActionClipboardStore.getState().copy({
      kind: 'action',
      row: { type: 'assign', location: 'foo', expr: '1' },
    });

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'foo', expr: '1' },
    });
  });

  it('stores a copied reaction', () => {
    useActionClipboardStore.getState().copy({
      kind: 'reaction',
      row: { event: 'evt', location: 'foo', expr: '1', type: 'internal' },
    });

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'reaction',
      row: { event: 'evt', location: 'foo', expr: '1', type: 'internal' },
    });
  });

  it('replaces a previously copied item when copying again', () => {
    useActionClipboardStore.getState().copy({ kind: 'action', row: { type: 'assign', location: 'a', expr: '1' } });
    useActionClipboardStore.getState().copy({ kind: 'action', row: { type: 'assign', location: 'b', expr: '2' } });

    expect(useActionClipboardStore.getState().copied).toEqual({
      kind: 'action',
      row: { type: 'assign', location: 'b', expr: '2' },
    });
  });
});
