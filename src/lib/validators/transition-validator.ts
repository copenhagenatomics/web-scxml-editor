/**
 * SCXML Transition Validation Module
 *
 * This module contains functions for:
 * - Validating transition targets
 * - Validating transition semantics (types, events)
 * - Validating cross-hierarchy transitions
 */

import type {
  SCXMLElement,
  StateElement,
  ParallelElement,
  TransitionElement,
} from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { findTransitionPosition } from './validator-utils';

/**
 * Validate all transition targets reference existing states
 */
export function validateStateReferences(
  scxml: SCXMLElement,
  stateIds: Set<string>,
  errors: ValidationError[]
): void {
  // Validate initial attribute references
  if (scxml['@_initial']) {
    const initialStates = scxml['@_initial'].split(/\s+/);
    initialStates.forEach((stateId) => {
      if (!stateIds.has(stateId)) {
        errors.push({
          message: `Initial state '${stateId}' not found. Make sure a state with id="${stateId}" exists in your SCXML document.`,
          severity: 'error',
        });
      }
    });
  }

  validateTransitionTargets(scxml, stateIds, errors);
}

/**
 * Validate transition targets recursively
 */
export function validateTransitionTargets(
  element: SCXMLElement | StateElement | ParallelElement,
  stateIds: Set<string>,
  errors: ValidationError[]
): void {
  // Check transitions in states
  if (element.state) {
    const states = Array.isArray(element.state) ? element.state : [element.state];
    states.forEach((state: StateElement) => {
      validateTransitionsInElement(state, stateIds, errors);
      validateTransitionTargets(state, stateIds, errors);
    });
  }

  // Check transitions in parallel states
  if (element.parallel) {
    const parallels = Array.isArray(element.parallel)
      ? element.parallel
      : [element.parallel];
    parallels.forEach((parallel: ParallelElement) => {
      validateTransitionsInElement(parallel, stateIds, errors);
      validateTransitionTargets(parallel, stateIds, errors);
    });
  }
}

/**
 * Validate transitions in a single element
 */
export function validateTransitionsInElement(
  element: StateElement | ParallelElement,
  stateIds: Set<string>,
  errors: ValidationError[]
): void {
  if (element.transition) {
    const transitions = Array.isArray(element.transition)
      ? element.transition
      : [element.transition];
    transitions.forEach((transition: TransitionElement) => {
      if (transition['@_target']) {
        const targets = transition['@_target'].split(/\s+/);
        targets.forEach((target) => {
          if (!stateIds.has(target)) {
            errors.push({
              message: `Transition target '${target}' not found. Make sure a state with id="${target}" exists in your SCXML document.`,
              severity: 'error',
            });
          }
        });
      }
    });
  }
}

/**
 * Validate initial states in compound states
 */
export function validateInitialStates(
  scxml: SCXMLElement,
  stateIds: Set<string>,
  errors: ValidationError[]
): void {
  if (scxml.state) {
    const states = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    states.forEach((state) => {
      if (state['@_initial']) {
        const initialStates = state['@_initial'].split(/\s+/);
        initialStates.forEach((stateId) => {
          if (!stateIds.has(stateId)) {
            errors.push({
              message: `Initial state '${stateId}' in state '${state['@_id'] || 'unnamed'}' not found. Make sure a state with id="${stateId}" exists in your SCXML document.`,
              severity: 'error',
            });
          }
        });
      }
    });
  }
}

/**
 * Validate transition semantics (types, events, etc.)
 */
export function validateTransitionSemantics(
  scxml: SCXMLElement,
  stateIds: Set<string>,
  errors: ValidationError[]
): void {
  const validateTransitions = (
    element: SCXMLElement | StateElement | ParallelElement
  ) => {
    if ((element as any).transition) {
      const transitions = Array.isArray((element as any).transition)
        ? (element as any).transition
        : [(element as any).transition];

      transitions.forEach((transition: TransitionElement) => {
        // Validate transition types
        if (
          transition['@_type'] &&
          !['internal', 'external'].includes(transition['@_type'])
        ) {
          errors.push({
            message: `Invalid transition type '${transition['@_type']}'. Must be 'internal' or 'external'`,
            severity: 'error',
          });
        }

        // Internal transitions must not have targets unless they are self-targeting
        if (transition['@_type'] === 'internal' && transition['@_target']) {
          const targets = transition['@_target'].split(/\s+/);
          const sourceId = (element as any)['@_id']
            ? (element as any)['@_id']
            : undefined;

          if (targets.some((target: string) => target !== sourceId)) {
            errors.push({
              message: 'Internal transitions cannot target other states',
              severity: 'error',
            });
          }
        }

        // Validate event names (basic check for valid event syntax)
        if (transition['@_event']) {
          const events = transition['@_event'].split(/\s+/);
          events.forEach((event: string) => {
            if (
              event !== '*' &&
              !/^[a-zA-Z_][a-zA-Z0-9_\-\.]*(\.\*)?$/.test(event)
            ) {
              errors.push({
                message: `Invalid event name '${event}'. Event names must be valid identifiers`,
                severity: 'warning',
              });
            }
          });
        }
      });
    }

    // Recursively validate nested elements
    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((state) => validateTransitions(state));
    }

    if (element.parallel) {
      const parallels = Array.isArray(element.parallel)
        ? element.parallel
        : [element.parallel];
      parallels.forEach((parallel) => validateTransitions(parallel));
    }
  };

  validateTransitions(scxml);
}

/**
 * Validate cross-hierarchy transitions (Milestone 5 - 1C)
 * Detects transitions from state in one hierarchy level to state in another level
 */
export function validateCrossHierarchyTransitions(
  scxml: SCXMLElement,
  stateParentMap: Map<string, string | null>,
  xmlContent: string | undefined,
  errors: ValidationError[]
): void {
  validateCrossHierarchyInElement(scxml, stateParentMap, xmlContent, errors);
}

/**
 * Recursively validate cross-hierarchy transitions in elements
 */
function validateCrossHierarchyInElement(
  element: SCXMLElement | StateElement | ParallelElement,
  stateParentMap: Map<string, string | null>,
  xmlContent: string | undefined,
  errors: ValidationError[]
): void {
  const elementId = (element as any)['@_id'];

  // Check transitions in this element
  if ((element as any).transition) {
    const transitions = Array.isArray((element as any).transition)
      ? (element as any).transition
      : [(element as any).transition];

    transitions.forEach((transition: TransitionElement) => {
      if (transition['@_target'] && elementId) {
        const targets = transition['@_target'].split(/\s+/);

        targets.forEach((targetId) => {
          // Check if source and target have the same parent
          const sourceParent = stateParentMap.get(elementId);
          const targetParent = stateParentMap.get(targetId);

          // Only validate if both states exist in our hierarchy map
          if (sourceParent !== undefined && targetParent !== undefined) {
            // Cross-hierarchy transition detected
            if (sourceParent !== targetParent) {
              const event = transition['@_event'] || '';
              const cond = transition['@_cond'] || '';
              const transitionInfo =
                [event, cond].filter(Boolean).join(' [') + (cond ? ']' : '');

              // Find line/column for this transition in XML
              const position = findTransitionPosition(
                elementId,
                targetId,
                xmlContent,
                event,
                cond
              );

              errors.push({
                message: `Cross-hierarchy transition not allowed: State '${elementId}' ${transitionInfo ? `(${transitionInfo}) ` : ''}cannot transition to '${targetId}' - they are at different hierarchy levels. Transitions must only occur between states with the same parent.`,
                severity: 'error',
                line: position?.line,
                column: position?.column,
              });
            }
          }
        });
      }
    });
  }

  // Recursively check child states
  if (element.state) {
    const states = Array.isArray(element.state) ? element.state : [element.state];
    states.forEach((state) =>
      validateCrossHierarchyInElement(state, stateParentMap, xmlContent, errors)
    );
  }

  // Recursively check child parallel states
  if (element.parallel) {
    const parallels = Array.isArray(element.parallel)
      ? element.parallel
      : [element.parallel];
    parallels.forEach((parallel) =>
      validateCrossHierarchyInElement(parallel, stateParentMap, xmlContent, errors)
    );
  }
}
