import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import { toSafeNodeId, resolveFocusTarget } from './resolve-focus-target';

function node(id: string, parentId?: string): Node {
  return { id, parentId, position: { x: 0, y: 0 }, data: {} } as Node;
}

describe('toSafeNodeId', () => {
  it('replaces dots with double underscores, matching converter toSafeId', () => {
    expect(toSafeNodeId('a.b.c')).toBe('a__b__c');
  });

  it('leaves ids without dots unchanged', () => {
    expect(toSafeNodeId('pressure_up')).toBe('pressure_up');
  });
});

describe('resolveFocusTarget', () => {
  it('returns null when the source state id has no matching node', () => {
    const nodes = [node('A')];
    expect(resolveFocusTarget(nodes, 'Ghost')).toBeNull();
  });

  it('resolves a root-level state with no ancestors and no target', () => {
    const nodes = [node('A'), node('B')];
    const result = resolveFocusTarget(nodes, 'A');
    expect(result).toEqual({ ancestorIds: [], highlightIds: new Set(['A']) });
  });

  it('builds the root-to-parent ancestor chain for a nested state', () => {
    const nodes = [node('Root'), node('Mid', 'Root'), node('Leaf', 'Mid')];
    const result = resolveFocusTarget(nodes, 'Leaf');
    expect(result).toEqual({ ancestorIds: ['Root', 'Mid'], highlightIds: new Set(['Leaf']) });
  });

  it('highlights both source and target when they share the same parent', () => {
    const nodes = [node('Parent'), node('A', 'Parent'), node('B', 'Parent')];
    const result = resolveFocusTarget(nodes, 'A', 'B');
    expect(result).toEqual({ ancestorIds: ['Parent'], highlightIds: new Set(['A', 'B']) });
  });

  it('highlights only the source when source and target are at different levels', () => {
    const nodes = [node('P1'), node('P2'), node('A', 'P1'), node('B', 'P2')];
    const result = resolveFocusTarget(nodes, 'A', 'B');
    expect(result).toEqual({ ancestorIds: ['P1'], highlightIds: new Set(['A']) });
  });

  it('safe-converts dotted ids before matching nodes', () => {
    const nodes = [node('a__b')];
    const result = resolveFocusTarget(nodes, 'a.b');
    expect(result).toEqual({ ancestorIds: [], highlightIds: new Set(['a__b']) });
  });
});
