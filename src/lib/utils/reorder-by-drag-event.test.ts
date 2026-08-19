import { describe, it, expect } from 'vitest';
import { reorderByDragEvent } from './reorder-by-drag-event';

const identity = (s: string) => s;

describe('reorderByDragEvent', () => {
  it('moves an item from an earlier position to a later position', () => {
    expect(reorderByDragEvent(['a', 'b', 'c'], identity, 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('moves an item from a later position to an earlier position', () => {
    expect(reorderByDragEvent(['a', 'b', 'c'], identity, 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('returns the same list reference when dropped outside a valid target', () => {
    const list = ['a', 'b', 'c'];
    expect(reorderByDragEvent(list, identity, 'a', undefined)).toBe(list);
    expect(reorderByDragEvent(list, identity, 'a', null)).toBe(list);
  });

  it('returns the same list reference when dropped back in the same spot', () => {
    const list = ['a', 'b', 'c'];
    expect(reorderByDragEvent(list, identity, 'b', 'b')).toBe(list);
  });

  it('returns the same list reference for a single-item list', () => {
    const list = ['only'];
    expect(reorderByDragEvent(list, identity, 'only', 'only')).toBe(list);
  });

  it('ignores ids that are not present in the list instead of throwing', () => {
    const list = ['a', 'b'];
    expect(reorderByDragEvent(list, identity, 'a', 'ghost')).toBe(list);
    expect(reorderByDragEvent(list, identity, 'ghost', 'a')).toBe(list);
  });

  it('finds items by id even when duplicate-looking values exist, using object identity via a keyed getter', () => {
    const list = [{ id: 'x1', label: 'a' }, { id: 'x2', label: 'a' }, { id: 'x3', label: 'b' }];
    const result = reorderByDragEvent(list, (item) => item.id, 'x1', 'x3');
    expect(result.map((r) => r.id)).toEqual(['x2', 'x3', 'x1']);
  });
});
