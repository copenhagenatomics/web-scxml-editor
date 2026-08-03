import type { Node } from 'reactflow';

/**
 * Convert a raw SCXML state id to its ReactFlow node id. Mirrors the
 * converter's toSafeId (id-mapping.ts), which only replaces dots — ReactFlow
 * treats dots in node ids as path separators.
 */
export function toSafeNodeId(id: string): string {
  return id.replace(/\./g, '__');
}

export interface FocusResolution {
  /** Ancestor node ids from root to the source state's direct parent, in
   * navigation order (pass to navigateIntoState in this order after
   * navigateToRoot). */
  ancestorIds: string[];
  /** Node ids to highlight once that hierarchy level is showing. */
  highlightIds: Set<string>;
}

/**
 * Resolve a validation error's stateId/targetStateId into the diagram
 * hierarchy path that reveals the source state, plus the node ids to
 * highlight there. Returns null if the source state isn't in the graph
 * (e.g. a stale error referencing a since-deleted state).
 */
export function resolveFocusTarget(
  allNodes: Node[],
  stateId: string,
  targetStateId?: string
): FocusResolution | null {
  const safeSourceId = toSafeNodeId(stateId);
  const sourceNode = allNodes.find((n) => n.id === safeSourceId);
  if (!sourceNode) return null;

  const ancestorIds: string[] = [];
  const visitedAncestors = new Set<string>();
  let parentId = sourceNode.parentId;
  while (parentId && !visitedAncestors.has(parentId)) {
    visitedAncestors.add(parentId);
    ancestorIds.unshift(parentId);
    const parentNode = allNodes.find((n) => n.id === parentId);
    parentId = parentNode?.parentId;
  }

  const highlightIds = new Set<string>([safeSourceId]);
  if (targetStateId) {
    const safeTargetId = toSafeNodeId(targetStateId);
    const targetNode = allNodes.find((n) => n.id === safeTargetId);
    if (targetNode && targetNode.parentId === sourceNode.parentId) {
      highlightIds.add(safeTargetId);
    }
  }

  return { ancestorIds, highlightIds };
}
