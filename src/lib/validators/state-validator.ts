/**
 * SCXML State Validation Module
 *
 * This module contains functions for:
 * - Collecting state IDs from SCXML documents
 * - Building state hierarchy maps
 * - Validating state references and structure
 * - Validating compound states
 */

import type {
  SCXMLElement,
  StateElement,
  ParallelElement,
  FinalElement,
  HistoryElement,
  DataModelElement,
} from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { parseStateIdList } from './validator-utils';

/**
 * Collect all state IDs from the SCXML document
 */
export function collectStateIds(scxml: SCXMLElement, stateIds: Set<string>): void {
  // Collect state IDs
  if (scxml.state) {
    const states = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    states.forEach((state) => {
      if (state['@_id']) {
        stateIds.add(state['@_id']);
      }
      collectStateIdsFromState(state, stateIds);
    });
  }

  // Collect parallel state IDs
  if (scxml.parallel) {
    const parallels = Array.isArray(scxml.parallel) ? scxml.parallel : [scxml.parallel];
    parallels.forEach((parallel) => {
      if (parallel['@_id']) {
        stateIds.add(parallel['@_id']);
      }
      collectStateIdsFromParallel(parallel, stateIds);
    });
  }

  // Collect final state IDs
  if (scxml.final) {
    const finals = Array.isArray(scxml.final) ? scxml.final : [scxml.final];
    finals.forEach((final) => {
      if (final['@_id']) {
        stateIds.add(final['@_id']);
      }
    });
  }
}

/**
 * Recursively collect state IDs from a state element
 */
export function collectStateIdsFromState(
  state: StateElement,
  stateIds: Set<string>
): void {
  if (state.state) {
    const states = Array.isArray(state.state) ? state.state : [state.state];
    states.forEach((s) => {
      if (s['@_id']) {
        stateIds.add(s['@_id']);
      }
      collectStateIdsFromState(s, stateIds);
    });
  }

  if (state.parallel) {
    const parallels = Array.isArray(state.parallel) ? state.parallel : [state.parallel];
    parallels.forEach((p) => {
      if (p['@_id']) {
        stateIds.add(p['@_id']);
      }
      collectStateIdsFromParallel(p, stateIds);
    });
  }

  if (state.final) {
    const finals = Array.isArray(state.final) ? state.final : [state.final];
    finals.forEach((f) => {
      if (f['@_id']) {
        stateIds.add(f['@_id']);
      }
    });
  }

  if (state.history) {
    const histories = Array.isArray(state.history) ? state.history : [state.history];
    histories.forEach((h) => {
      if (h['@_id']) {
        stateIds.add(h['@_id']);
      }
    });
  }
}

/**
 * Recursively collect state IDs from a parallel element
 */
export function collectStateIdsFromParallel(
  parallel: ParallelElement,
  stateIds: Set<string>
): void {
  if (parallel.state) {
    const states = Array.isArray(parallel.state) ? parallel.state : [parallel.state];
    states.forEach((s: StateElement) => {
      if (s['@_id']) {
        stateIds.add(s['@_id']);
      }
      collectStateIdsFromState(s, stateIds);
    });
  }

  if (parallel.parallel) {
    const parallels = Array.isArray(parallel.parallel)
      ? parallel.parallel
      : [parallel.parallel];
    parallels.forEach((p: ParallelElement) => {
      if (p['@_id']) {
        stateIds.add(p['@_id']);
      }
      collectStateIdsFromParallel(p, stateIds);
    });
  }

  if (parallel.history) {
    const histories = Array.isArray(parallel.history)
      ? parallel.history
      : [parallel.history];
    histories.forEach((h: HistoryElement) => {
      if (h['@_id']) {
        stateIds.add(h['@_id']);
      }
    });
  }
}

/**
 * Build parent-child hierarchy map for cross-hierarchy validation
 */
export function buildStateHierarchy(
  scxml: SCXMLElement,
  stateParentMap: Map<string, string | null>
): void {
  // Process root-level states (parent = null)
  if (scxml.state) {
    const states = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    states.forEach((state) => {
      if (state['@_id']) {
        stateParentMap.set(state['@_id'], null);
      }
      buildStateHierarchyFromState(state, state['@_id'] || null, stateParentMap);
    });
  }

  if (scxml.parallel) {
    const parallels = Array.isArray(scxml.parallel) ? scxml.parallel : [scxml.parallel];
    parallels.forEach((parallel) => {
      if (parallel['@_id']) {
        stateParentMap.set(parallel['@_id'], null);
      }
      buildStateHierarchyFromParallel(
        parallel,
        parallel['@_id'] || null,
        stateParentMap
      );
    });
  }

  if (scxml.final) {
    const finals = Array.isArray(scxml.final) ? scxml.final : [scxml.final];
    finals.forEach((final) => {
      if (final['@_id']) {
        stateParentMap.set(final['@_id'], null);
      }
    });
  }
}

/**
 * Build state hierarchy from a state element
 */
export function buildStateHierarchyFromState(
  state: StateElement,
  parentId: string | null,
  stateParentMap: Map<string, string | null>
): void {
  // Process child states
  if (state.state) {
    const states = Array.isArray(state.state) ? state.state : [state.state];
    states.forEach((childState) => {
      if (childState['@_id']) {
        stateParentMap.set(childState['@_id'], parentId);
      }
      buildStateHierarchyFromState(
        childState,
        childState['@_id'] || parentId,
        stateParentMap
      );
    });
  }

  // Process child parallel states
  if (state.parallel) {
    const parallels = Array.isArray(state.parallel) ? state.parallel : [state.parallel];
    parallels.forEach((parallel) => {
      if (parallel['@_id']) {
        stateParentMap.set(parallel['@_id'], parentId);
      }
      buildStateHierarchyFromParallel(
        parallel,
        parallel['@_id'] || parentId,
        stateParentMap
      );
    });
  }

  // Process child final states
  if (state.final) {
    const finals = Array.isArray(state.final) ? state.final : [state.final];
    finals.forEach((final) => {
      if (final['@_id']) {
        stateParentMap.set(final['@_id'], parentId);
      }
    });
  }

  // Process child history states
  if (state.history) {
    const histories = Array.isArray(state.history) ? state.history : [state.history];
    histories.forEach((history) => {
      if (history['@_id']) {
        stateParentMap.set(history['@_id'], parentId);
      }
    });
  }
}

/**
 * Build state hierarchy from a parallel element
 */
export function buildStateHierarchyFromParallel(
  parallel: ParallelElement,
  parentId: string | null,
  stateParentMap: Map<string, string | null>
): void {
  // Process child states
  if (parallel.state) {
    const states = Array.isArray(parallel.state) ? parallel.state : [parallel.state];
    states.forEach((childState: StateElement) => {
      if (childState['@_id']) {
        stateParentMap.set(childState['@_id'], parentId);
      }
      buildStateHierarchyFromState(
        childState,
        childState['@_id'] || parentId,
        stateParentMap
      );
    });
  }

  // Process child parallel states
  if (parallel.parallel) {
    const parallels = Array.isArray(parallel.parallel)
      ? parallel.parallel
      : [parallel.parallel];
    parallels.forEach((childParallel: ParallelElement) => {
      if (childParallel['@_id']) {
        stateParentMap.set(childParallel['@_id'], parentId);
      }
      buildStateHierarchyFromParallel(
        childParallel,
        childParallel['@_id'] || parentId,
        stateParentMap
      );
    });
  }

  // Process child history states
  if (parallel.history) {
    const histories = Array.isArray(parallel.history)
      ? parallel.history
      : [parallel.history];
    histories.forEach((history: HistoryElement) => {
      if (history['@_id']) {
        stateParentMap.set(history['@_id'], parentId);
      }
    });
  }
}

/**
 * Find duplicate state IDs in the SCXML document
 */
export function findDuplicateIds(scxml: SCXMLElement): string[] {
  const idCounts = new Map<string, number>();
  const duplicates: string[] = [];

  const countIds = (element: SCXMLElement | StateElement | ParallelElement) => {
    // Count state IDs
    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((state) => {
        if (state['@_id']) {
          const count = idCounts.get(state['@_id']) || 0;
          idCounts.set(state['@_id'], count + 1);
        }
        countIds(state);
      });
    }

    // Count parallel IDs
    if (element.parallel) {
      const parallels = Array.isArray(element.parallel)
        ? element.parallel
        : [element.parallel];
      parallels.forEach((parallel) => {
        if (parallel['@_id']) {
          const count = idCounts.get(parallel['@_id']) || 0;
          idCounts.set(parallel['@_id'], count + 1);
        }
        countIds(parallel);
      });
    }

    // Count final state IDs - check if element has final property
    if ((element as any).final) {
      const finals = Array.isArray((element as any).final)
        ? (element as any).final
        : [(element as any).final];
      finals.forEach((final: FinalElement) => {
        if (final['@_id']) {
          const count = idCounts.get(final['@_id']) || 0;
          idCounts.set(final['@_id'], count + 1);
        }
      });
    }
  };

  countIds(scxml);

  // Find duplicates
  idCounts.forEach((count, id) => {
    if (count > 1) {
      duplicates.push(id);
    }
  });

  return duplicates;
}

/**
 * Find duplicate data element IDs across all datamodels in the SCXML document
 */
export function findDuplicateDataIds(scxml: SCXMLElement): string[] {
  const idCounts = new Map<string, number>();

  const collectDataIds = (datamodel: DataModelElement) => {
    if (!datamodel.data) return;
    const dataElements = Array.isArray(datamodel.data) ? datamodel.data : [datamodel.data];
    dataElements.forEach((data) => {
      if (data['@_id']) {
        idCounts.set(data['@_id'], (idCounts.get(data['@_id']) || 0) + 1);
      }
    });
  };

  const traverse = (element: SCXMLElement | StateElement | ParallelElement) => {
    if ((element as StateElement | ParallelElement).datamodel) {
      collectDataIds((element as StateElement | ParallelElement).datamodel as DataModelElement);
    }

    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((state) => traverse(state));
    }

    if (element.parallel) {
      const parallels = Array.isArray(element.parallel) ? element.parallel : [element.parallel];
      parallels.forEach((parallel) => traverse(parallel));
    }
  };

  traverse(scxml);

  return Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
}

/**
 * Find data element IDs that use the non-portable "main_" prefix.
 * A "main_"-prefixed variable is tied to this specific state machine by name; if the
 * state/subtree that declares or references it is copied into a different machine, the
 * reference won't resolve there. The "this_" prefix is the portable equivalent.
 */
export function findMainPrefixedDataIds(scxml: SCXMLElement): string[] {
  const ids: string[] = [];

  const collectDataIds = (datamodel: DataModelElement) => {
    if (!datamodel.data) return;
    const dataElements = Array.isArray(datamodel.data) ? datamodel.data : [datamodel.data];
    dataElements.forEach((data) => {
      if (data['@_id']?.startsWith('main_')) {
        ids.push(data['@_id']);
      }
    });
  };

  const traverse = (element: SCXMLElement | StateElement | ParallelElement) => {
    if ((element as StateElement | ParallelElement).datamodel) {
      collectDataIds((element as StateElement | ParallelElement).datamodel as DataModelElement);
    }

    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((state) => traverse(state));
    }

    if (element.parallel) {
      const parallels = Array.isArray(element.parallel) ? element.parallel : [element.parallel];
      parallels.forEach((parallel) => traverse(parallel));
    }
  };

  traverse(scxml);

  return ids;
}

/**
 * Validate compound states have initial attributes or elements
 */
export function validateCompoundStates(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  const validateCompoundState = (state: StateElement) => {
    const hasChildren =
      state.state || state.parallel || state.final || state.history;

    if (hasChildren) {
      // Compound state must have initial attribute or initial element
      if (!state['@_initial'] && !state.initial) {
        errors.push({
          message: `Compound state '${state['@_id']}' must have either an 'initial' attribute or an <initial> child element`,
          severity: 'error',
          stateId: state['@_id'],
        });
      }
    }

    // Recursively validate nested states
    if (state.state) {
      const states = Array.isArray(state.state) ? state.state : [state.state];
      states.forEach((nestedState) => validateCompoundState(nestedState));
    }
  };

  if (scxml.state) {
    const states = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    states.forEach((state) => validateCompoundState(state));
  }
}

/**
 * Find reachable states from the initial state(s)
 */
export function findReachableStates(
  element: SCXMLElement | StateElement | ParallelElement,
  reachableStates: Set<string>,
  visitedStates: Set<string>,
  stateIds: Set<string>
): void {
  // Process states
  if (element.state) {
    const states = Array.isArray(element.state) ? element.state : [element.state];
    states.forEach((state) => {
      const stateId = state['@_id'];
      if (stateId && !visitedStates.has(stateId)) {
        visitedStates.add(stateId);

        // Add states reachable through transitions
        if (state.transition) {
          const transitions = Array.isArray(state.transition)
            ? state.transition
            : [state.transition];
          transitions.forEach((transition) => {
            if (transition['@_target']) {
              const targets = parseStateIdList(transition['@_target'], stateIds);
              targets.forEach((target) => reachableStates.add(target));
            }
          });
        }

        // Check initial states in compound states
        if (state['@_initial']) {
          const initialStates = parseStateIdList(state['@_initial'], stateIds);
          initialStates.forEach((id) => reachableStates.add(id));
        }

        // Check for <initial> child element with transition
        if (state.initial) {
          const initial = Array.isArray(state.initial)
            ? state.initial[0]
            : state.initial;
          if (initial.transition) {
            const transition = Array.isArray(initial.transition)
              ? initial.transition[0]
              : initial.transition;
            if (transition['@_target']) {
              const targets = parseStateIdList(transition['@_target'], stateIds);
              targets.forEach((target: string) => reachableStates.add(target));
            }
          }
        }

        // Recursively check nested states
        findReachableStates(state, reachableStates, visitedStates, stateIds);
      }
    });
  }

  // Process parallel states
  if (element.parallel) {
    const parallels = Array.isArray(element.parallel)
      ? element.parallel
      : [element.parallel];
    parallels.forEach((parallel) => {
      const parallelId = parallel['@_id'];
      if (parallelId && !visitedStates.has(parallelId)) {
        visitedStates.add(parallelId);
        findReachableStates(parallel, reachableStates, visitedStates, stateIds);
      }
    });
  }
}
