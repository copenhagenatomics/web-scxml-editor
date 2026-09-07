import { describe, it, expect } from 'vitest';
import { resolveEnhancedNodePosition } from './resolve-enhanced-node-position';

describe('resolveEnhancedNodePosition', () => {
  it('returns the node\'s own position unchanged when there is no saved viz layout', () => {
    const node = { position: { x: 10, y: 20 }, data: {} };
    expect(resolveEnhancedNodePosition(node, undefined)).toEqual({ x: 10, y: 20 });
  });

  it('prefers the saved viz layout position when the node is not a parallel-group member (existing behavior)', () => {
    const node = { position: { x: 10, y: 20 }, data: {} };
    expect(resolveEnhancedNodePosition(node, { x: 100, y: 200 })).toEqual({ x: 100, y: 200 });
  });

  it('falls back per-axis to the node position when only one viz axis is saved', () => {
    const node = { position: { x: 10, y: 20 }, data: {} };
    expect(resolveEnhancedNodePosition(node, { x: 100 })).toEqual({ x: 100, y: 20 });
    expect(resolveEnhancedNodePosition(node, { y: 200 })).toEqual({ x: 10, y: 200 });
  });

  it('ignores the saved viz layout for a parallel-group member, keeping the converter-computed position', () => {
    // The converter already resolves viz:xywh priority (via applyDefaultELKLayout)
    // AND separates auto-wrapped Initial-state regions into non-overlapping
    // bands on top of that (separateParallelRegions) — re-applying a second,
    // independently-read viz position here would silently undo that
    // separation for any member whose old flat-sibling position was already
    // saved, which is exactly what caused states to stop moving with the
    // divider (see markParallelGroupMembers).
    const node = { position: { x: 500, y: 20 }, data: { isParallelGroupMember: true } };
    expect(resolveEnhancedNodePosition(node, { x: 100, y: 200 })).toEqual({ x: 500, y: 20 });
  });
});
