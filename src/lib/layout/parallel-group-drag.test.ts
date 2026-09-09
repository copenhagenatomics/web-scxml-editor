import { describe, it, expect } from 'vitest';
import { expandWrapperPositionChanges, type SimpleNode, type PositionChange } from './parallel-group-drag';

describe('expandWrapperPositionChanges', () => {
  it('leaves an ordinary node position change untouched', () => {
    const nodes: SimpleNode[] = [{ id: 'A', position: { x: 0, y: 0 } }];
    const changes: PositionChange[] = [{ type: 'position', id: 'A', position: { x: 10, y: 20 }, dragging: true }];
    expect(expandWrapperPositionChanges(changes, nodes)).toEqual(changes);
  });

  it('translates every member by the same delta when the wrapper node moves', () => {
    const nodes: SimpleNode[] = [
      { id: 'P', position: { x: 0, y: 0 }, data: { isParallelGroupWrapper: true, memberIds: ['A', 'B'] } },
      { id: 'A', position: { x: 10, y: 10 } },
      { id: 'B', position: { x: 200, y: 10 } },
    ];
    const changes: PositionChange[] = [{ type: 'position', id: 'P', position: { x: 30, y: 5 }, dragging: true }];
    const result = expandWrapperPositionChanges(changes, nodes);

    // Original wrapper change is preserved...
    expect(result).toContainEqual(changes[0]);
    // ...plus one translated change per member, using the wrapper's own delta (dx=30, dy=5).
    expect(result).toContainEqual({ type: 'position', id: 'A', position: { x: 40, y: 15 }, dragging: true });
    expect(result).toContainEqual({ type: 'position', id: 'B', position: { x: 230, y: 15 }, dragging: true });
    expect(result).toHaveLength(3);
  });

  it('preserves the dragging:false flag on expanded member changes (drag-stop persistence depends on it)', () => {
    const nodes: SimpleNode[] = [
      { id: 'P', position: { x: 0, y: 0 }, data: { isParallelGroupWrapper: true, memberIds: ['A'] } },
      { id: 'A', position: { x: 10, y: 10 } },
    ];
    const changes: PositionChange[] = [{ type: 'position', id: 'P', position: { x: 5, y: 5 }, dragging: false }];
    const result = expandWrapperPositionChanges(changes, nodes);
    const memberChange = result.find((c) => c.id === 'A');
    expect(memberChange?.dragging).toBe(false);
  });

  it('skips a member id that no longer has a matching node, without throwing', () => {
    const nodes: SimpleNode[] = [
      { id: 'P', position: { x: 0, y: 0 }, data: { isParallelGroupWrapper: true, memberIds: ['A', 'Missing'] } },
      { id: 'A', position: { x: 10, y: 10 } },
    ];
    const changes: PositionChange[] = [{ type: 'position', id: 'P', position: { x: 5, y: 5 }, dragging: true }];
    const result = expandWrapperPositionChanges(changes, nodes);
    expect(result.map((c) => c.id).sort()).toEqual(['A', 'P']);
  });

  it('re-emits each member at its current (already up to date) position when the wrapper change has no position payload, instead of dropping them', () => {
    // React Flow's own final drag-stop event sometimes carries no position
    // payload at all (NodePositionChange.position is optional) — dropping
    // the member expansion entirely for that event would mean the member's
    // final dragging:false signal never fires, so drag-stop persistence
    // (gated on that signal, see visual-diagram.tsx's handleNodesChange)
    // would silently never save the drag for the whole group. Re-emitting
    // each member's own already-current position (delta 0) instead keeps
    // that signal intact without inventing a position.
    const nodes: SimpleNode[] = [
      { id: 'P', position: { x: 0, y: 0 }, data: { isParallelGroupWrapper: true, memberIds: ['A'] } },
      { id: 'A', position: { x: 55, y: 66 } },
    ];
    const changes = [{ type: 'position', id: 'P', dragging: false }] as unknown as PositionChange[];
    expect(() => expandWrapperPositionChanges(changes, nodes)).not.toThrow();
    const result = expandWrapperPositionChanges(changes, nodes);
    expect(result).toContainEqual(changes[0]);
    expect(result).toContainEqual({ type: 'position', id: 'A', position: { x: 55, y: 66 }, dragging: false });
  });

  it('is a no-op when the changed node is not a Parallel State wrapper', () => {
    const nodes: SimpleNode[] = [
      { id: 'X', position: { x: 0, y: 0 }, data: { isParallelGroupWrapper: false } },
    ];
    const changes: PositionChange[] = [{ type: 'position', id: 'X', position: { x: 5, y: 5 }, dragging: true }];
    expect(expandWrapperPositionChanges(changes, nodes)).toEqual(changes);
  });
});
