import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import {
  getDirectChildStates,
  getInitialIds,
  getSiblingEdges,
  analyzeGroups,
  groupAnalysisKind,
  type ContainerElement,
} from '@/lib/utils/initial-group-utils';
import { getChildEntries, type ContainerKind } from '@/lib/utils/parallel-structure';

/**
 * Detects documents where a transition already connects two different
 * Initial State groups under the same parent — a state the real-time
 * onConnect blocking in the diagram can't prevent (hand-edited XML,
 * pasted/loaded files) — and compound states with 2+ Initial State groups
 * that can't become a <parallel> because they also hold <final> children
 * (see parallel-group-normalization.ts).
 */
export function validateInitialStateGroups(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  validateContainer(scxml, 'root', errors);
}

function validateContainer(
  container: ContainerElement,
  kind: ContainerKind,
  errors: ValidationError[]
): void {
  // At the root, __root_parallel counts as one child — its regions aren't
  // Initial State groups (see groupAnalysisKind).
  const analysisKind = groupAnalysisKind(kind);
  const children = getDirectChildStates(container, analysisKind);

  // A <parallel>'s children are regions, not Initial State groups.
  if (children.length > 0 && kind !== 'parallel') {
    const childIds = children.map((c) => c['@_id']);
    const initialIds = getInitialIds(container, analysisKind);
    const edges = getSiblingEdges(container, analysisKind);
    const { groupsByState, conflictedGroups } = analyzeGroups(childIds, initialIds, edges);

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

    const groupCount = new Set([...groupsByState.values()].filter(Boolean)).size;
    const finals = (container as any).final;
    if (kind === 'state' && groupCount >= 2 && finals && (!Array.isArray(finals) || finals.length > 0)) {
      const id = (container as any)['@_id'];
      errors.push({
        message: `State '${id}' has ${groupCount} Initial States, so it should become a parallel state, but it also contains <final> states, which a parallel state can't hold. Move or remove the <final> states, or keep a single Initial State.`,
        severity: 'error',
        stateId: id,
      });
    }
  }

  getChildEntries(container, kind).forEach((child) => validateContainer(child.el, child.tag, errors));
}
