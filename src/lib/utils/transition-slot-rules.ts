import type { TransitionElement, SCXMLDocument, ParallelElement } from '@/types/scxml';
import { findTimeEventToken } from './time-transition';

export type TransitionSlot = 'event' | 'timer' | 'cond' | 'always' | 'invalid-both';

/**
 * Like findStateById (in scxml-manipulation-utils.ts), but also searches into <parallel>
 * regions. findStateById only recurses through state.state, never state.parallel/
 * scxmlDoc.scxml.parallel — states nested inside a <parallel> region would otherwise be
 * invisible to the slot-conflict checks below, silently letting them bypass live blocking.
 * Kept local to this file (not exported) rather than widening the shared findStateById,
 * since that function has other call sites (visual-diagram.tsx) outside this scope.
 */
function findTransitionSourceElement(
  scxmlDoc: SCXMLDocument,
  id: string
): { transition?: TransitionElement | TransitionElement[] } | null {
  // ParallelElement is used as the structural container type for both <state> and
  // <parallel> entries — StateElement's fields are a superset of ParallelElement's,
  // so it's structurally assignable, and all we need here is '@_id'/transition/state/parallel.
  function searchStates(states: ParallelElement | ParallelElement[] | undefined): ParallelElement | null {
    if (!states) return null;
    const arr = Array.isArray(states) ? states : [states];
    for (const state of arr) {
      if (state['@_id'] === id) return state;
      const foundInStates = searchStates(state.state);
      if (foundInStates) return foundInStates;
      const foundInParallels = searchParallels(state.parallel);
      if (foundInParallels) return foundInParallels;
    }
    return null;
  }

  function searchParallels(parallels: ParallelElement | ParallelElement[] | undefined): ParallelElement | null {
    if (!parallels) return null;
    const arr = Array.isArray(parallels) ? parallels : [parallels];
    for (const p of arr) {
      if (p['@_id'] === id) return p;
      const foundInStates = searchStates(p.state);
      if (foundInStates) return foundInStates;
      const foundInParallels = searchParallels(p.parallel);
      if (foundInParallels) return foundInParallels;
    }
    return null;
  }

  return searchStates(scxmlDoc.scxml.state) || searchParallels(scxmlDoc.scxml.parallel);
}

export function isPresent(v: string | undefined): boolean {
  return !!v && v.trim().length > 0;
}

/**
 * both present -> 'invalid-both'.
 * cond present, event absent -> 'cond'.
 * event present, cond absent, and the event (or one token of a comma-merged list)
 *   follows the auto-generated {stateId}_t_{N}_timeEvent_{N} pattern -> 'timer'
 *   (a distinct slot from 'event' — see time-transition.ts's isTimeEventName).
 * event present, cond absent, not a timer event -> 'event'.
 * neither present -> 'always' (bare/eventless transition, fires immediately on entry).
 */
export function classifyTransitionSlot(t: TransitionElement): TransitionSlot {
  const hasEvent = isPresent(t['@_event']);
  const hasCond = isPresent(t['@_cond']);
  if (hasEvent && hasCond) return 'invalid-both';
  if (hasCond) return 'cond';
  if (hasEvent) return findTimeEventToken(t['@_event']) ? 'timer' : 'event';
  return 'always';
}

/**
 * existingTransitionsToSameTarget: the OTHER transitions already on this source state
 * that target the same state + type as `candidate` — the caller is responsible for
 * filtering to same target/type and excluding the transition being edited, if any.
 */
export function findTransitionSlotConflict(
  existingTransitionsToSameTarget: TransitionElement[],
  candidate: TransitionElement
): { blocked: boolean; reason?: string } {
  const candidateSlot = classifyTransitionSlot(candidate);

  if (candidateSlot === 'invalid-both') {
    return { blocked: true, reason: "A transition can't have both an event and a condition." };
  }

  const conflict = existingTransitionsToSameTarget.some(
    (t) => classifyTransitionSlot(t) === candidateSlot
  );
  if (conflict) {
    return {
      blocked: true,
      reason:
        candidateSlot === 'event'
          ? 'Only one event-based transition is allowed between these two states.'
          : candidateSlot === 'timer'
            ? 'Only one timer-based transition is allowed between these two states.'
            : candidateSlot === 'cond'
              ? 'Only one condition-based transition is allowed between these two states.'
              : 'Only one eventless transition is allowed between these two states.',
    };
  }

  return { blocked: false };
}

/**
 * A freshly-drawn diagram connection is always constructed as a bare/eventless candidate
 * (no event, no cond — see onConnect in visual-diagram.tsx), so this only ever needs to
 * check the 'always' slot.
 */
export function checkNewConnectionSlotConflict(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  targetId: string
): { blocked: boolean; reason?: string } {
  const sourceState = findTransitionSourceElement(scxmlDoc, sourceId);
  if (!sourceState || !sourceState.transition) return { blocked: false };

  const existing = Array.isArray(sourceState.transition)
    ? sourceState.transition
    : [sourceState.transition];
  const sameTarget = existing.filter(
    (t) => t['@_target'] === targetId && (t['@_type'] || 'external') === 'external'
  );

  const candidate: TransitionElement = { '@_target': targetId };
  return findTransitionSlotConflict(sameTarget, candidate);
}

/**
 * transitionIndex identifies the transition currently being edited (its index within the
 * source state's transition array, as parsed from the edge id by
 * parseTransitionIndexFromEdgeId) so it's excluded from the conflict check against itself.
 */
export function checkTransitionEditSlotConflict(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  transitionIndex: number | undefined,
  candidate: TransitionElement
): { blocked: boolean; reason?: string } {
  const sourceState = findTransitionSourceElement(scxmlDoc, sourceId);
  if (!sourceState || !sourceState.transition) return findTransitionSlotConflict([], candidate);

  const all = Array.isArray(sourceState.transition) ? sourceState.transition : [sourceState.transition];
  const candidateType = candidate['@_type'] || 'external';
  const sameTarget = all.filter(
    (t, i) =>
      i !== transitionIndex &&
      t['@_target'] === candidate['@_target'] &&
      (t['@_type'] || 'external') === candidateType
  );

  return findTransitionSlotConflict(sameTarget, candidate);
}
