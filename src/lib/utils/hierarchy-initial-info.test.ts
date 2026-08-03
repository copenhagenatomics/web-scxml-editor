import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import type { SCXMLStateNodeData } from '@/components/diagram/nodes/scxml-state-node';
import {
  buildInitialChildByParent,
  formatInitialTooltip,
  HIERARCHY_ROOT_KEY,
} from './hierarchy-initial-info';

function makeNode(
  id: string,
  parentId: string | undefined,
  data: Partial<SCXMLStateNodeData>
): Node<SCXMLStateNodeData> {
  return {
    id,
    parentId,
    position: { x: 0, y: 0 },
    data: { label: id, stateType: 'simple', ...data },
  };
}

describe('buildInitialChildByParent', () => {
  it('groups a single initial child under its parent id', () => {
    const nodes = [
      makeNode('operation', undefined, { isInitial: true }),
      makeNode('idle', 'operation', { isInitial: true, entryActions: ['log("idle")'] }),
      makeNode('spinning_up', 'operation', {}),
    ];
    const map = buildInitialChildByParent(nodes);
    expect(map.get('operation')).toEqual([{ label: 'idle', entryActions: ['log("idle")'] }]);
  });

  it('uses the root sentinel for top-level initial nodes', () => {
    const nodes = [makeNode('operation', undefined, { isInitial: true })];
    const map = buildInitialChildByParent(nodes);
    expect(map.get(HIERARCHY_ROOT_KEY)).toEqual([{ label: 'operation', entryActions: [] }]);
  });

  it('collects multiple initial children for the same parent (multi-initial-group states)', () => {
    const nodes = [
      makeNode('a', 'root_container', { isInitial: true }),
      makeNode('b', 'root_container', { isInitial: true }),
      makeNode('c', 'root_container', { isInitial: false }),
    ];
    const map = buildInitialChildByParent(nodes);
    expect(map.get('root_container')).toEqual([
      { label: 'a', entryActions: [] },
      { label: 'b', entryActions: [] },
    ]);
  });

  it('omits parents with no initial children', () => {
    const nodes = [makeNode('leaf', 'parent', {})];
    const map = buildInitialChildByParent(nodes);
    expect(map.has('parent')).toBe(false);
  });
});

describe('formatInitialTooltip', () => {
  it('returns undefined when there is nothing to show', () => {
    expect(formatInitialTooltip(undefined)).toBeUndefined();
    expect(formatInitialTooltip([])).toBeUndefined();
  });

  it('formats a single initial child with entry actions', () => {
    const text = formatInitialTooltip([{ label: 'idle', entryActions: ['log("idle")'] }]);
    expect(text).toBe('Initial state:\n  idle — on entry: log("idle")');
  });

  it('formats a single initial child with no entry actions', () => {
    const text = formatInitialTooltip([{ label: 'idle', entryActions: [] }]);
    expect(text).toBe('Initial state:\n  idle');
  });

  it('formats multiple initial children (multi-initial-group states)', () => {
    const text = formatInitialTooltip([
      { label: 'a', entryActions: [] },
      { label: 'b', entryActions: ['x()'] },
    ]);
    expect(text).toBe('Initial states:\n  a\n  b — on entry: x()');
  });
});
