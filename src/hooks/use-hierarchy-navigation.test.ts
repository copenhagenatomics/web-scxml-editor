import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Node, Edge } from 'reactflow';
import { useHierarchyNavigation } from './use-hierarchy-navigation';
import { useEditorStore } from '@/stores/editor-store';

function stateNode(id: string, parentId: string | undefined, stateType = 'simple', position = { x: 0, y: 0 }): Node {
  return {
    id,
    type: 'scxmlState',
    parentId,
    position,
    width: 190,
    height: 80,
    data: { label: id, stateType },
  } as Node;
}

// Airplane -> Engines (parallel) -> Left/Right (regions) -> LeftOff/LeftOn, RightOff/RightOn
const AIRPLANE_NODES: Node[] = [
  stateNode('Airplane', undefined, 'compound'),
  stateNode('Engines', 'Airplane', 'parallel'),
  stateNode('Left', 'Engines', 'compound'),
  stateNode('Right', 'Engines', 'compound'),
  stateNode('LeftOff', 'Left', 'simple', { x: 20, y: 10 }),
  stateNode('LeftOn', 'Left', 'simple', { x: 20, y: 200 }),
  stateNode('RightOff', 'Right', 'simple', { x: 20, y: 10 }),
  stateNode('RightOn', 'Right', 'simple', { x: 20, y: 200 }),
];
const AIRPLANE_EDGES: Edge[] = [];

beforeEach(() => {
  act(() => {
    useEditorStore.getState().reset();
  });
});

describe('useHierarchyNavigation — parallel region mode', () => {
  it('is not in region mode outside a parallel', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    expect(result.current.isParallelRegionMode).toBe(false);
    expect(result.current.regions).toEqual([]);
  });

  it('shows the parallel\'s regions\' children (not the regions themselves) once drilled into the parallel', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    expect(result.current.isParallelRegionMode).toBe(true);
    const ids = result.current.filteredNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['LeftOff', 'LeftOn', 'RightOff', 'RightOn']);
  });

  it('exposes the regions in document order with labels', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));
    expect(result.current.regions).toEqual([
      { id: 'Left', label: 'Left' },
      { id: 'Right', label: 'Right' },
    ]);
  });

  it('tags each visible node with its region id, label and index', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    const leftOff = result.current.filteredNodes.find((n) => n.id === 'LeftOff')!;
    expect(leftOff.data.regionId).toBe('Left');
    expect(leftOff.data.regionLabel).toBe('Left');
    expect(leftOff.data.regionIndex).toBe(0);

    const rightOn = result.current.filteredNodes.find((n) => n.id === 'RightOn')!;
    expect(rightOn.data.regionId).toBe('Right');
    expect(rightOn.data.regionIndex).toBe(1);
  });

  it('positions the second region\'s nodes to the right of the first region\'s column', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    const leftOff = result.current.filteredNodes.find((n) => n.id === 'LeftOff')!;
    const rightOff = result.current.filteredNodes.find((n) => n.id === 'RightOff')!;
    expect(rightOff.position.x).toBeGreaterThan(leftOff.position.x + 190);
  });

  it('exposes regionColumns matching the region count, in order', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    expect(result.current.regionColumns).toHaveLength(2);
    expect(result.current.regionColumns[0].regionId).toBe('Left');
    expect(result.current.regionColumns[1].regionId).toBe('Right');
    expect(result.current.regionColumns[1].x).toBeGreaterThan(result.current.regionColumns[0].x);
  });

  it('falls back to ordinary flat sibling rendering one level further down (inside a region\'s child)', () => {
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: AIRPLANE_NODES, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Left'));

    expect(result.current.isParallelRegionMode).toBe(false);
    const ids = result.current.filteredNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['LeftOff', 'LeftOn']);
  });

  it('still shows a note parented directly to the parallel itself (region mode must not hide it)', () => {
    const noteNode = stateNode('note:1', 'Engines', 'simple', { x: 5, y: 5 });
    const nodesWithNote = [...AIRPLANE_NODES, noteNode];
    const { result } = renderHook(() => useHierarchyNavigation({ allNodes: nodesWithNote, allEdges: AIRPLANE_EDGES }));
    act(() => useEditorStore.getState().navigateIntoState('Engines'));

    expect(result.current.isParallelRegionMode).toBe(true);
    const ids = result.current.filteredNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['LeftOff', 'LeftOn', 'RightOff', 'RightOn', 'note:1']);

    const note = result.current.filteredNodes.find((n) => n.id === 'note:1')!;
    expect(note.data.regionId).toBeUndefined();
  });
});
