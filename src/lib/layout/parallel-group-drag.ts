/**
 * Group-drag math for the "Parallel State" wrapper node
 * (src/components/diagram/nodes/parallel-group-wrapper-node.tsx). There is
 * no real React Flow parent-child relationship between the wrapper and its
 * member nodes (this app never uses native nesting — see
 * collectEffectiveStateChildren in state-registry.ts), so dragging the
 * wrapper does not natively move its members the way a true parent would.
 * This module expands a single React-Flow position-change event on the
 * wrapper into one additional position-change per member, translated by the
 * same delta, so visual-diagram.tsx's existing onNodesChange pipeline moves
 * (and, on drag-stop, persists) every member node together with the box.
 */

export interface SimpleNode {
  id: string;
  position: { x: number; y: number };
  data?: { isParallelGroupWrapper?: boolean; memberIds?: string[] };
}

export interface PositionChange {
  type: 'position';
  id: string;
  // React Flow's own NodePositionChange marks this optional — some
  // position-type change events during a drag carry no position payload.
  position?: { x: number; y: number };
  dragging?: boolean;
}

export function expandWrapperPositionChanges(
  changes: PositionChange[],
  nodes: SimpleNode[]
): PositionChange[] {
  const result: PositionChange[] = [];

  changes.forEach((change) => {
    result.push(change);

    const wrapperNode = nodes.find((n) => n.id === change.id);
    if (!wrapperNode?.data?.isParallelGroupWrapper) return;

    // React Flow's own NodePositionChange marks `position` optional — its
    // final drag-stop event sometimes carries none at all. Falling back to
    // a zero delta re-emits each member at its own current (already
    // up-to-date from earlier drag events) position rather than dropping
    // the expansion: the member still needs its own dragging:false signal
    // to reach drag-stop persistence, even though there's no fresh delta to
    // compute here.
    const dx = change.position ? change.position.x - wrapperNode.position.x : 0;
    const dy = change.position ? change.position.y - wrapperNode.position.y : 0;
    const memberIds = wrapperNode.data.memberIds ?? [];

    memberIds.forEach((memberId) => {
      const member = nodes.find((n) => n.id === memberId);
      if (!member) return;
      result.push({
        type: 'position',
        id: memberId,
        position: { x: member.position.x + dx, y: member.position.y + dy },
        dragging: change.dragging,
      });
    });
  });

  return result;
}
