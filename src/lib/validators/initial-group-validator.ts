import type { SCXMLElement, StateElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import {
  getDirectChildStates,
  getInitialIds,
  getSiblingEdges,
  analyzeGroups,
  type ContainerElement,
} from '@/lib/utils/initial-group-utils';

/**
 * Detects documents where a transition already connects two different
 * Initial State groups under the same parent — a state the real-time
 * onConnect blocking in the diagram can't prevent (hand-edited XML,
 * pasted/loaded files).
 */
export function validateInitialStateGroups(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  validateContainer(scxml, errors);
}

function validateContainer(
  container: ContainerElement,
  errors: ValidationError[]
): void {
  const children = getDirectChildStates(container);

  if (children.length > 0) {
    const childIds = children.map((c) => c['@_id']);
    const initialIds = getInitialIds(container);
    const edges = getSiblingEdges(container);
    const { conflictedGroups } = analyzeGroups(childIds, initialIds, edges);

    conflictedGroups.forEach((members) => {
      errors.push({
        message: `States ${members
          .map((m) => `'${m}'`)
          .join(' and ')} are both marked as Initial States but are connected by a transition (directly or indirectly), which merges two Initial State groups. Remove one of the Initial markers, or remove the transition(s) connecting them.`,
        severity: 'error',
        stateId: members[0],
        targetStateId: members[1],
      });
    });
  }

  children.forEach((child: StateElement) => validateContainer(child, errors));
}
