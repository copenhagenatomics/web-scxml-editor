// Shared colors for SCXML transition edges. Change here to re-theme every
// conditional/event/eventless transition (edges, waypoints, markers, labels) at once.
export const CONDITION_TRANSITION_COLOR = '#f59f0b'; // purple — transitions with a `cond` guard
export const EVENT_TRANSITION_COLOR = '#3b82f6'; // blue — plain event transitions (no `cond`)
export const ALWAYS_TRANSITION_COLOR = '#6b7280'; // gray — eventless/unconditional transitions (fire immediately on entry)

export function getTransitionColor(
  hasCondition: boolean | string | undefined,
  hasEvent: boolean | string | undefined
): string {
  if (hasCondition) return CONDITION_TRANSITION_COLOR;
  if (hasEvent) return EVENT_TRANSITION_COLOR;
  return ALWAYS_TRANSITION_COLOR;
}
