/**
 * A node's saved viz:xywh layout position normally takes priority over
 * whatever the converter computed, so a manually-placed/persisted node never
 * "jumps" on re-render. But the converter itself already gives viz:xywh
 * absolute priority (see applyDefaultELKLayout) AND, for a member of an
 * auto-wrapped Initial-state Parallel group, additionally separates that
 * group's regions into non-overlapping horizontal bands on top of that
 * (separateParallelRegions) — re-applying a second, independently-read viz
 * position here would silently undo that separation for any member whose
 * old flat-sibling position happens to already be saved, which is exactly
 * what caused Parallel State regions to stop moving together with their
 * divider line. For those nodes (flagged via data.isParallelGroupMember —
 * see markParallelGroupMembers), the converter's own position is always
 * authoritative.
 */
export function resolveEnhancedNodePosition(
  node: { position: { x: number; y: number }; data?: { isParallelGroupMember?: boolean } },
  vizLayout: { x?: number; y?: number } | undefined
): { x: number; y: number } {
  if (!vizLayout || node.data?.isParallelGroupMember) {
    return node.position;
  }
  return {
    x: vizLayout.x ?? node.position.x,
    y: vizLayout.y ?? node.position.y,
  };
}
