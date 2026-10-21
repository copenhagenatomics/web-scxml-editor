/**
 * SCXML W3C Compliance Validation Module
 *
 * This module contains functions for:
 * - Validating W3C namespace and version requirements
 * - Validating required attributes for all SCXML elements
 * - Validating element attributes against schemas
 * - Validating executable content
 */

import type {
  SCXMLElement,
  StateElement,
  ParallelElement,
  FinalElement,
  HistoryElement,
  TransitionElement,
  DataElement,
  InvokeElement,
  AssignElement,
  SendElement,
  RaiseElement,
  LogElement,
  CancelElement,
  IfElement,
  ElseIfElement,
  ForEachElement,
} from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { getElementAttributeSchemas } from './attribute-schemas';
import {
  findSimilarAttribute,
  findElementPosition,
  createFriendlyLogErrorMessage,
  type SourceElement,
} from './validator-utils';

type SourcePosition = { line: number; column: number; endLine?: number; endColumn?: number };

/** Resolves an element (by type and tree path) to its source position. */
type Locate = (elementType: string, path: string) => SourcePosition | undefined;

/**
 * Validate W3C compliance requirements
 */
export function validateW3CCompliance(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  // Validate namespace
  if (!scxml['@_xmlns'] || scxml['@_xmlns'] !== 'http://www.w3.org/2005/07/scxml') {
    errors.push({
      message: 'SCXML root element must have xmlns="http://www.w3.org/2005/07/scxml"',
      severity: 'error',
    });
  }

  // Validate version
  if (!scxml['@_version']) {
    errors.push({
      message: 'SCXML root element must have a version attribute',
      severity: 'error',
    });
  }

  // Check for at least one state or initial attribute
  if (!scxml['@_initial'] && !scxml.state && !scxml.parallel && !scxml.final) {
    errors.push({
      message: 'SCXML must have either an initial attribute or at least one state',
      severity: 'error',
    });
  }

  // Validate datamodel attribute values
  if (
    scxml['@_datamodel'] &&
    !['null', 'ecmascript', 'xpath'].includes(scxml['@_datamodel'])
  ) {
    errors.push({
      message: `Invalid datamodel '${scxml['@_datamodel']}'. Must be 'null', 'ecmascript', or 'xpath'`,
      severity: 'warning',
    });
  }

  // Validate binding attribute values
  if (scxml['@_binding'] && !['early', 'late'].includes(scxml['@_binding'])) {
    errors.push({
      message: `Invalid binding '${scxml['@_binding']}'. Must be 'early' or 'late'`,
      severity: 'error',
    });
  }
}

/**
 * Validate required attributes for all elements
 */
export function validateRequiredAttributes(
  scxml: SCXMLElement,
  reportedErrors: Set<string>,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  sourceIndex?: Map<string, SourceElement>
): void {
  // Prefer the exact path-based position; fall back to the legacy
  // type-and-line lookup when no source index entry exists.
  const locate: Locate = (elementType, path) =>
    sourceIndex?.get(path)?.range ?? findElementPosition(elementType, path, elementPositions);

  validateRequiredAttributesRecursive(
    scxml,
    reportedErrors,
    locate,
    errors,
    'scxml',
    ''
  );
}

/**
 * Recursively validate required attributes
 */
function validateRequiredAttributesRecursive(
  element: any,
  reportedErrors: Set<string>,
  locate: Locate,
  errors: ValidationError[],
  elementName: string = 'scxml',
  path: string = ''
): void {
  if (!element) return;

  // Same path shape as buildSourceElementIndex: scxml.state[0].datamodel[0].data[1]
  const currentPath = path || elementName;

  // Validate based on element type
  switch (elementName) {
    case 'state':
      validateStateRequiredAttributes(element, reportedErrors, locate, errors, currentPath);
      break;
    case 'parallel':
      validateParallelRequiredAttributes(element, reportedErrors, locate, errors, currentPath);
      break;
    case 'final':
      validateFinalRequiredAttributes(element, reportedErrors, locate, errors, currentPath);
      break;
    case 'transition':
      validateTransitionRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'history':
      validateHistoryRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'initial':
      validateInitialRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'invoke':
      validateInvokeRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'data':
      validateDataRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'assign':
      validateAssignRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'send':
      validateSendRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'cancel':
      validateCancelRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'raise':
      validateRaiseRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'log':
      validateLogRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'if':
      validateIfRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'elseif':
      validateElseIfRequiredAttributes(element, locate, errors, currentPath);
      break;
    case 'foreach':
      validateForEachRequiredAttributes(element, locate, errors, currentPath);
      break;
  }

  // Recursively validate child elements
  validateChildElements(element, reportedErrors, locate, errors, currentPath);
}

function validateStateRequiredAttributes(
  state: StateElement,
  reportedErrors: Set<string>,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!state['@_id']) {
    const position = locate('state', path);
    const errorKey = `missing_state_id_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `State missing required 'id' attribute. All states should have unique identifiers for proper SCXML functionality.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
        endLine: position?.endLine,
        endColumn: position?.endColumn,
      });
    }
  }
}

function validateParallelRequiredAttributes(
  parallel: ParallelElement,
  reportedErrors: Set<string>,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!parallel['@_id']) {
    const position = locate('parallel', path);
    const errorKey = `missing_parallel_id_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `Parallel state missing required 'id' attribute. All parallel states should have unique identifiers for proper SCXML functionality.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
        endLine: position?.endLine,
        endColumn: position?.endColumn,
      });
    }
  }
}

function validateFinalRequiredAttributes(
  final: FinalElement,
  reportedErrors: Set<string>,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!final['@_id']) {
    const position = locate('final', path);
    const errorKey = `missing_final_id_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `Final state missing required 'id' attribute. All final states should have unique identifiers for proper SCXML functionality.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
        endLine: position?.endLine,
        endColumn: position?.endColumn,
      });
    }
  }

  // A <final> is a terminal state: SCXML doesn't allow <transition> children.
  // The diagram never creates one (see isFinalState / ReconnectTransitionCommand),
  // so this catches hand-edited XML.
  if ((final as any).transition) {
    const count = Array.isArray((final as any).transition) ? (final as any).transition.length : 1;
    const position = locate('final', path);
    const errorKey = `final_has_transition_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `Final state '${final['@_id'] ?? '(no id)'}' has ${count === 1 ? 'an outgoing transition' : `${count} outgoing transitions`}. A final state cannot have outgoing transitions — remove the <transition> element${count === 1 ? '' : 's'}.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
        endLine: position?.endLine,
        endColumn: position?.endColumn,
      });
    }
  }
}

function validateTransitionRequiredAttributes(
  transition: TransitionElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!transition['@_target'] && transition['@_type'] !== 'internal') {
    const position = locate('transition', path);
    const event = transition['@_event'];
    const eventInfo = event ? ` (triggered by "${event}")` : '';

    errors.push({
      message: `Missing required 'target' attribute in <transition> element${eventInfo}. Specify which state this transition should go to, or add type="internal" for transitions that stay in the same state.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateHistoryRequiredAttributes(
  history: HistoryElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!history['@_id']) {
    const position = locate('history', path);

    errors.push({
      message: `History element missing required 'id' attribute. History elements need unique identifiers to be referenced by transitions.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateInitialRequiredAttributes(
  initial: any,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!initial.transition) {
    const position = locate('initial', path);

    errors.push({
      message: `Initial element must contain a <transition> element. The initial element defines the default transition to take when entering a compound state.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateInvokeRequiredAttributes(
  invoke: InvokeElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!invoke['@_type'] && !invoke['@_src']) {
    const position = locate('invoke', path);

    errors.push({
      message: `Missing required invocation specification in <invoke> element. Must have either 'type' (invocation type) or 'src' (external service URL) attribute.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateDataRequiredAttributes(
  data: DataElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!data['@_id']) {
    const position = locate('data', path);

    errors.push({
      message: `Missing required 'id' attribute in <data> element. The 'id' attribute provides a unique name for the data variable.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateAssignRequiredAttributes(
  assign: AssignElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!assign['@_location']) {
    const position = locate('assign', path);

    errors.push({
      message: `Missing required 'location' attribute in <assign> element. The 'location' attribute specifies which data variable to modify.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateSendRequiredAttributes(
  send: SendElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!send['@_event'] && !send['@_eventexpr']) {
    const position = locate('send', path);

    errors.push({
      message: `Missing required event specification in <send> element. Must have either 'event' (static event name) or 'eventexpr' (dynamic event expression) attribute.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateCancelRequiredAttributes(
  cancel: CancelElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!cancel['@_sendid'] && !cancel['@_sendidexpr']) {
    const position = locate('cancel', path);

    errors.push({
      message: `Missing required send identifier in <cancel> element. Must have either 'sendid' (static ID) or 'sendidexpr' (dynamic expression) attribute to identify which sent event to cancel.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateRaiseRequiredAttributes(
  raise: RaiseElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!raise['@_event']) {
    const position = locate('raise', path);

    errors.push({
      message: `Missing required 'event' attribute in <raise> element. The 'event' attribute specifies which event to trigger within the state machine.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateLogRequiredAttributes(
  log: LogElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!log['@_expr']) {
    const position = locate('log', path);
    const friendlyMessage = createFriendlyLogErrorMessage(log, path, position);

    errors.push({
      message: friendlyMessage,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateIfRequiredAttributes(
  ifElement: IfElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!ifElement['@_cond']) {
    const position = locate('if', path);

    errors.push({
      message: `Missing required 'cond' attribute in <if> element. The 'cond' attribute must contain a boolean expression that determines when to execute the if block.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateElseIfRequiredAttributes(
  elseif: ElseIfElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!elseif['@_cond']) {
    const position = locate('elseif', path);

    errors.push({
      message: `Missing required 'cond' attribute in <elseif> element. The 'cond' attribute must contain a boolean expression that determines when to execute the elseif block.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateForEachRequiredAttributes(
  foreach: ForEachElement,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  const position = locate('foreach', path);

  if (!foreach['@_item']) {
    errors.push({
      message: `Missing required 'item' attribute in <foreach> element. The 'item' attribute specifies the variable name for each iteration.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
  if (!foreach['@_array']) {
    errors.push({
      message: `Missing required 'array' attribute in <foreach> element. The 'array' attribute specifies which array to iterate over.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
      endLine: position?.endLine,
      endColumn: position?.endColumn,
    });
  }
}

function validateChildElements(
  element: any,
  reportedErrors: Set<string>,
  locate: Locate,
  errors: ValidationError[],
  path: string
): void {
  if (!element) return;

  const elementMappings = [
    { prop: 'state', type: 'state' },
    { prop: 'parallel', type: 'parallel' },
    { prop: 'final', type: 'final' },
    { prop: 'history', type: 'history' },
    { prop: 'initial', type: 'initial' },
    { prop: 'transition', type: 'transition' },
    { prop: 'onentry', type: 'onentry' },
    { prop: 'onexit', type: 'onexit' },
    { prop: 'invoke', type: 'invoke' },
    { prop: 'datamodel', type: 'datamodel' },
    { prop: 'data', type: 'data' },
    { prop: 'script', type: 'script' },
    { prop: 'assign', type: 'assign' },
    { prop: 'send', type: 'send' },
    { prop: 'raise', type: 'raise' },
    { prop: 'log', type: 'log' },
    { prop: 'cancel', type: 'cancel' },
    { prop: 'if', type: 'if' },
    { prop: 'elseif', type: 'elseif' },
    { prop: 'else', type: 'else' },
    { prop: 'foreach', type: 'foreach' },
  ];

  elementMappings.forEach(({ prop, type }) => {
    if (element[prop]) {
      const children = Array.isArray(element[prop]) ? element[prop] : [element[prop]];
      children.forEach((child: any, index: number) => {
        const childPath = `${path}.${prop}[${index}]`;
        validateRequiredAttributesRecursive(
          child,
          reportedErrors,
          locate,
          errors,
          type,
          childPath
        );
      });
    }
  });
}

/**
 * Validate executable content in elements
 */
export function validateExecutableElements(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  const validateExecutable = (
    element: SCXMLElement | StateElement | ParallelElement
  ) => {
    // Validate script elements
    if ((element as any).script) {
      const scripts = Array.isArray((element as any).script)
        ? (element as any).script
        : [(element as any).script];
      scripts.forEach((script: any) => {
        if (!script['@_src'] && !script['#text']) {
          errors.push({
            message: 'Script element must have either src attribute or text content',
            severity: 'error',
          });
        }
      });
    }

    // Recursively validate nested elements
    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((state) => validateExecutable(state));
    }

    if (element.parallel) {
      const parallels = Array.isArray(element.parallel)
        ? element.parallel
        : [element.parallel];
      parallels.forEach((parallel) => validateExecutable(parallel));
    }
  };

  validateExecutable(scxml);
}

/**
 * Validate all element attributes against schemas
 *
 * Walks every element the parser produced (root <datamodel>, <parallel>
 * children, executable content nested at any depth) and reports attributes
 * missing from the element's schema. When xmlContent is given, each error
 * carries the exact source range of the offending attribute.
 */
export function validateAllElementAttributes(
  scxml: SCXMLElement,
  errors: ValidationError[],
  sourceIndex?: Map<string, SourceElement>
): void {
  validateElementAttributesRecursive(
    'scxml',
    scxml as unknown as Record<string, unknown>,
    'scxml',
    getElementAttributeSchemas(),
    sourceIndex,
    errors
  );
}

// Elements whose children are an arbitrary payload, not SCXML.
const OPAQUE_ELEMENTS = new Set(['content']);

function validateElementAttributesRecursive(
  elementName: string,
  element: Record<string, unknown>,
  path: string,
  schemas: Map<string, Set<string>>,
  sourceIndex: Map<string, SourceElement> | undefined,
  errors: ValidationError[]
): void {
  const validAttributes = schemas.get(elementName);
  if (!validAttributes) return;

  validateElementAttributes(
    elementName,
    element,
    validAttributes,
    sourceIndex?.get(path),
    errors
  );

  if (OPAQUE_ELEMENTS.has(elementName)) return;

  Object.keys(element).forEach((key) => {
    if (key.startsWith('@_') || key === '#text' || key === '#cdata') return;
    if (!schemas.has(key)) return;

    const value = element[key];
    const children = Array.isArray(value) ? value : [value];
    children.forEach((child, index) => {
      // Text-only elements without attributes parse to primitives.
      if (!child || typeof child !== 'object') return;
      validateElementAttributesRecursive(
        key,
        child as Record<string, unknown>,
        `${path}.${key}[${index}]`,
        schemas,
        sourceIndex,
        errors
      );
    });
  });
}

function validateElementAttributes(
  elementName: string,
  element: Record<string, unknown>,
  validAttributes: Set<string>,
  source: SourceElement | undefined,
  errors: ValidationError[]
): void {
  Object.keys(element).forEach((key) => {
    // Only attributes; '#text' is element content, not an attribute.
    if (!key.startsWith('@_')) return;

    const attributeName = key.substring(2);

    // Namespaced attributes (viz:xywh, xmlns:viz, ...) are allowed extensions,
    // and a default-namespace declaration is legal on any element.
    if (attributeName.includes(':') || attributeName === 'xmlns') return;

    if (validAttributes.has(attributeName)) return;

    const suggestion = findSimilarAttribute(attributeName, validAttributes);
    const elementId = element['@_id'] ? ` id="${element['@_id']}"` : '';
    const allowed =
      validAttributes.size > 0
        ? ` Valid attributes for <${elementName}>: ${[...validAttributes].join(', ')}.`
        : ` <${elementName}> does not take any attributes.`;
    const fix = suggestion
      ? ` Did you mean '${suggestion}'?`
      : ' Custom attributes need a namespace prefix (e.g. viz:name) declared on <scxml>.';
    const range = source?.attributes.get(attributeName) ?? source?.range;

    errors.push({
      message: `Unknown attribute '${attributeName}' on <${elementName}${elementId}>.${fix}${allowed}`,
      severity: 'error',
      line: range?.line,
      column: range?.column,
      endLine: range?.endLine,
      endColumn: range?.endColumn,
    });
  });
}

/**
 * Validate state machine semantics
 */
export function validateStateMachineSemantics(
  scxml: SCXMLElement,
  stateIds: Set<string>,
  reachableStates: Set<string>,
  errors: ValidationError[]
): void {
  // Report unreachable states
  stateIds.forEach((stateId) => {
    if (!reachableStates.has(stateId)) {
      errors.push({
        message: `State '${stateId}' is unreachable`,
        severity: 'warning',
      });
    }
  });
}
