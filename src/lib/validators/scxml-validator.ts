import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import {
  parseElementPositions,
  deduplicateErrors,
} from './validator-utils';
import {
  collectStateIds,
  buildStateHierarchy,
  findDuplicateIds,
  validateCompoundStates,
  findReachableStates,
} from './state-validator';
import {
  validateStateReferences,
  validateInitialStates,
  validateTransitionSemantics,
  validateCrossHierarchyTransitions,
} from './transition-validator';
import {
  validateW3CCompliance,
  validateRequiredAttributes,
  validateExecutableElements,
  validateAllElementAttributes,
  validateStateMachineSemantics,
} from './w3c-validator';

/**
 * Main SCXML Validator Class
 *
 * Orchestrates validation by delegating to specialized modules:
 * - attribute-schemas: Valid attribute definitions
 * - validator-utils: Utility functions
 * - state-validator: State collection and hierarchy
 * - transition-validator: Transition validation
 * - w3c-validator: W3C compliance and attribute validation
 */
export class SCXMLValidator {
  private xmlContent?: string;
  private elementPositions: Map<any, { line: number; column: number }> = new Map();
  private reportedErrors: Set<string> = new Set();
  private stateParentMap: Map<string, string | null> = new Map();

  /**
   * Main validation entry point
   */
  validate(scxml: SCXMLElement, xmlContent?: string): ValidationError[] {
    this.xmlContent = xmlContent;
    this.elementPositions.clear();
    this.reportedErrors.clear();
    this.stateParentMap.clear();

    // Parse positions if XML content is provided
    if (xmlContent) {
      parseElementPositions(xmlContent, this.elementPositions);
    }

    const errors: ValidationError[] = [];
    const stateIds = new Set<string>();

    // Collect all state IDs first
    collectStateIds(scxml, stateIds);

    // Build parent-child hierarchy map
    buildStateHierarchy(scxml, this.stateParentMap);

    // Perform all validation checks
    validateStateReferences(scxml, stateIds, errors);
    validateInitialStates(scxml, stateIds, errors);
    validateRequiredAttributes(scxml, this.reportedErrors, this.elementPositions, errors);
    this.validateStateStructure(scxml, errors);

    // Enhanced W3C compliance checks
    validateW3CCompliance(scxml, errors);
    this.validateStateMachineSemanticsInternal(scxml, stateIds, errors);
    validateTransitionSemantics(scxml, stateIds, errors);
    validateExecutableElements(scxml, errors);

    // Comprehensive attribute validation
    validateAllElementAttributes(scxml, errors);

    // Cross-hierarchy transition validation (1C requirement)
    validateCrossHierarchyTransitions(
      scxml,
      this.stateParentMap,
      this.xmlContent,
      errors
    );

    return deduplicateErrors(errors);
  }

  /**
   * Validate state structure
   */
  private validateStateStructure(
    scxml: SCXMLElement,
    errors: ValidationError[]
  ): void {
    // Note: ID validation is now handled by validateRequiredAttributes
    // to avoid duplicate error messages

    // Validate nested state structures for other structural issues
    if (scxml.state) {
      const states = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
      states.forEach((state) => {
        this.validateNestedStateStructureNonIds(state, errors);
      });
    }

    if (scxml.parallel) {
      const parallels = Array.isArray(scxml.parallel)
        ? scxml.parallel
        : [scxml.parallel];
      parallels.forEach((parallel) => {
        this.validateNestedParallelStructureNonIds(parallel, errors);
      });
    }
  }

  /**
   * Validate nested state structure (non-ID validation)
   */
  private validateNestedStateStructureNonIds(
    state: any,
    errors: ValidationError[]
  ): void {
    // Note: ID validation is handled by validateRequiredAttributes
    // This method focuses on other structural validation

    // Recursively validate nested states
    if (state.state) {
      const states = Array.isArray(state.state) ? state.state : [state.state];
      states.forEach((nestedState: any) => {
        this.validateNestedStateStructureNonIds(nestedState, errors);
      });
    }

    if (state.parallel) {
      const parallels = Array.isArray(state.parallel)
        ? state.parallel
        : [state.parallel];
      parallels.forEach((parallel: any) => {
        this.validateNestedParallelStructureNonIds(parallel, errors);
      });
    }
  }

  /**
   * Validate nested parallel structure (non-ID validation)
   */
  private validateNestedParallelStructureNonIds(
    parallel: any,
    errors: ValidationError[]
  ): void {
    // Note: ID validation is handled by validateRequiredAttributes
    // This method focuses on other structural validation

    // Recursively validate nested structures
    if (parallel.state) {
      const states = Array.isArray(parallel.state)
        ? parallel.state
        : [parallel.state];
      states.forEach((state: any) => {
        this.validateNestedStateStructureNonIds(state, errors);
      });
    }

    if (parallel.parallel) {
      const parallels = Array.isArray(parallel.parallel)
        ? parallel.parallel
        : [parallel.parallel];
      parallels.forEach((nestedParallel: any) => {
        this.validateNestedParallelStructureNonIds(nestedParallel, errors);
      });
    }
  }

  /**
   * Validate state machine semantics (internal wrapper)
   */
  private validateStateMachineSemanticsInternal(
    scxml: SCXMLElement,
    stateIds: Set<string>,
    errors: ValidationError[]
  ): void {
    // Check for unreachable states
    const reachableStates = new Set<string>();
    const visitedStates = new Set<string>();

    // Add initial states to reachable set
    if (scxml['@_initial']) {
      const initialStates = scxml['@_initial'].split(/\s+/);
      initialStates.forEach((id) => reachableStates.add(id));
    }

    // Check for root-level <initial> child element with transition
    if (scxml.initial) {
      const initial = Array.isArray(scxml.initial)
        ? scxml.initial[0]
        : scxml.initial;
      if (initial.transition) {
        const transition = Array.isArray(initial.transition)
          ? initial.transition[0]
          : initial.transition;
        if (transition['@_target']) {
          const targets = transition['@_target'].split(/\s+/);
          targets.forEach((target: string) => reachableStates.add(target));
        }
      }
    }

    // Find states reachable through transitions
    findReachableStates(scxml, reachableStates, visitedStates);

    // Report unreachable states and other semantic issues
    validateStateMachineSemantics(scxml, stateIds, reachableStates, errors);

    // Check for duplicate state IDs
    const duplicateIds = findDuplicateIds(scxml);
    duplicateIds.forEach((id) => {
      errors.push({
        message: `Duplicate state ID '${id}'`,
        severity: 'error',
      });
    });

    // Validate compound state requirements
    validateCompoundStates(scxml, errors);
  }
}
