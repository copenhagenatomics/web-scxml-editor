// Shared colors for SCXML transition edges. Change here to re-theme every
// conditional/event transition (edges, waypoints, markers, labels) at once.
export const CONDITION_TRANSITION_COLOR = '#f59f0b'; // purple — transitions with a `cond` guard
export const EVENT_TRANSITION_COLOR = '#3b82f6'; // blue — plain event transitions (no `cond`)

export function getTransitionColor(hasCondition: boolean | string | undefined): string {
  return hasCondition ? CONDITION_TRANSITION_COLOR : EVENT_TRANSITION_COLOR;
}
