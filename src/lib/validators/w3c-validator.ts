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
  InitialElement,
  TransitionElement,
  OnEntryElement,
  OnExitElement,
  DataModelElement,
  DataElement,
  InvokeElement,
  ScriptElement,
  AssignElement,
  SendElement,
  RaiseElement,
  LogElement,
  CancelElement,
  IfElement,
  ElseIfElement,
  ElseElement,
  ForEachElement,
} from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import {
  getValidScxmlAttributes,
  getValidStateAttributes,
  getValidParallelAttributes,
  getValidFinalAttributes,
  getValidHistoryAttributes,
  getValidTransitionAttributes,
  getValidOnentryAttributes,
  getValidOnexitAttributes,
  getValidInitialAttributes,
  getValidDatamodelAttributes,
  getValidDataAttributes,
  getValidInvokeAttributes,
  getValidScriptAttributes,
  getValidAssignAttributes,
  getValidSendAttributes,
  getValidRaiseAttributes,
  getValidLogAttributes,
  getValidCancelAttributes,
  getValidIfAttributes,
  getValidElseifAttributes,
  getValidElseAttributes,
  getValidForeachAttributes,
} from './attribute-schemas';
import {
  findSimilarAttribute,
  findElementPosition,
  getElementPosition,
  createFriendlyLogErrorMessage,
} from './validator-utils';

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
  errors: ValidationError[]
): void {
  validateRequiredAttributesRecursive(
    scxml,
    reportedErrors,
    elementPositions,
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
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  elementName: string = 'scxml',
  path: string = ''
): void {
  if (!element) return;

  const currentPath = path ? `${path}.${elementName}` : elementName;

  // Validate based on element type
  switch (elementName) {
    case 'state':
      validateStateRequiredAttributes(element, reportedErrors, elementPositions, errors, currentPath);
      break;
    case 'parallel':
      validateParallelRequiredAttributes(element, reportedErrors, elementPositions, errors, currentPath);
      break;
    case 'final':
      validateFinalRequiredAttributes(element, reportedErrors, elementPositions, errors, currentPath);
      break;
    case 'transition':
      validateTransitionRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'history':
      validateHistoryRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'initial':
      validateInitialRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'invoke':
      validateInvokeRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'data':
      validateDataRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'assign':
      validateAssignRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'send':
      validateSendRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'cancel':
      validateCancelRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'raise':
      validateRaiseRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'log':
      validateLogRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'if':
      validateIfRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'elseif':
      validateElseIfRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
    case 'foreach':
      validateForEachRequiredAttributes(element, elementPositions, errors, currentPath);
      break;
  }

  // Recursively validate child elements
  validateChildElements(element, reportedErrors, elementPositions, errors, currentPath);
}

function validateStateRequiredAttributes(
  state: StateElement,
  reportedErrors: Set<string>,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!state['@_id']) {
    const position = findElementPosition('state', path, elementPositions);
    const errorKey = `missing_state_id_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `State missing required 'id' attribute. All states should have unique identifiers for proper SCXML functionality.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
      });
    }
  }
}

function validateParallelRequiredAttributes(
  parallel: ParallelElement,
  reportedErrors: Set<string>,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!parallel['@_id']) {
    const position = findElementPosition('parallel', path, elementPositions);
    const errorKey = `missing_parallel_id_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `Parallel state missing required 'id' attribute. All parallel states should have unique identifiers for proper SCXML functionality.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
      });
    }
  }
}

function validateFinalRequiredAttributes(
  final: FinalElement,
  reportedErrors: Set<string>,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!final['@_id']) {
    const position = findElementPosition('final', path, elementPositions);
    const errorKey = `missing_final_id_${path}`;

    if (!reportedErrors.has(errorKey)) {
      reportedErrors.add(errorKey);
      errors.push({
        message: `Final state missing required 'id' attribute. All final states should have unique identifiers for proper SCXML functionality.`,
        severity: 'error',
        line: position?.line,
        column: position?.column,
      });
    }
  }
}

function validateTransitionRequiredAttributes(
  transition: TransitionElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!transition['@_target'] && transition['@_type'] !== 'internal') {
    const position = findElementPosition('transition', path, elementPositions);
    const event = transition['@_event'];
    const eventInfo = event ? ` (triggered by "${event}")` : '';

    errors.push({
      message: `Missing required 'target' attribute in <transition> element${eventInfo}. Specify which state this transition should go to, or add type="internal" for transitions that stay in the same state.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateHistoryRequiredAttributes(
  history: HistoryElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!history['@_id']) {
    const position = findElementPosition('history', path, elementPositions);

    errors.push({
      message: `History element missing required 'id' attribute. History elements need unique identifiers to be referenced by transitions.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateInitialRequiredAttributes(
  initial: any,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!initial.transition) {
    const position = findElementPosition('initial', path, elementPositions);

    errors.push({
      message: `Initial element must contain a <transition> element. The initial element defines the default transition to take when entering a compound state.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateInvokeRequiredAttributes(
  invoke: InvokeElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!invoke['@_type'] && !invoke['@_src']) {
    const position = findElementPosition('invoke', path, elementPositions);

    errors.push({
      message: `Missing required invocation specification in <invoke> element. Must have either 'type' (invocation type) or 'src' (external service URL) attribute.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateDataRequiredAttributes(
  data: DataElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!data['@_id']) {
    const position = findElementPosition('data', path, elementPositions);

    errors.push({
      message: `Missing required 'id' attribute in <data> element. The 'id' attribute provides a unique name for the data variable.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateAssignRequiredAttributes(
  assign: AssignElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!assign['@_location']) {
    const position = findElementPosition('assign', path, elementPositions);

    errors.push({
      message: `Missing required 'location' attribute in <assign> element. The 'location' attribute specifies which data variable to modify.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateSendRequiredAttributes(
  send: SendElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!send['@_event'] && !send['@_eventexpr']) {
    const position = findElementPosition('send', path, elementPositions);

    errors.push({
      message: `Missing required event specification in <send> element. Must have either 'event' (static event name) or 'eventexpr' (dynamic event expression) attribute.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateCancelRequiredAttributes(
  cancel: CancelElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!cancel['@_sendid'] && !cancel['@_sendidexpr']) {
    const position = findElementPosition('cancel', path, elementPositions);

    errors.push({
      message: `Missing required send identifier in <cancel> element. Must have either 'sendid' (static ID) or 'sendidexpr' (dynamic expression) attribute to identify which sent event to cancel.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateRaiseRequiredAttributes(
  raise: RaiseElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!raise['@_event']) {
    const position = findElementPosition('raise', path, elementPositions);

    errors.push({
      message: `Missing required 'event' attribute in <raise> element. The 'event' attribute specifies which event to trigger within the state machine.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateLogRequiredAttributes(
  log: LogElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!log['@_expr']) {
    const position = getElementPosition(log, elementPositions);
    const friendlyMessage = createFriendlyLogErrorMessage(log, path, elementPositions);

    errors.push({
      message: friendlyMessage,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateIfRequiredAttributes(
  ifElement: IfElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!ifElement['@_cond']) {
    const position = findElementPosition('if', path, elementPositions);

    errors.push({
      message: `Missing required 'cond' attribute in <if> element. The 'cond' attribute must contain a boolean expression that determines when to execute the if block.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateElseIfRequiredAttributes(
  elseif: ElseIfElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  if (!elseif['@_cond']) {
    const position = findElementPosition('elseif', path, elementPositions);

    errors.push({
      message: `Missing required 'cond' attribute in <elseif> element. The 'cond' attribute must contain a boolean expression that determines when to execute the elseif block.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateForEachRequiredAttributes(
  foreach: ForEachElement,
  elementPositions: Map<any, { line: number; column: number }>,
  errors: ValidationError[],
  path: string
): void {
  const position = findElementPosition('foreach', path, elementPositions);

  if (!foreach['@_item']) {
    errors.push({
      message: `Missing required 'item' attribute in <foreach> element. The 'item' attribute specifies the variable name for each iteration.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
  if (!foreach['@_array']) {
    errors.push({
      message: `Missing required 'array' attribute in <foreach> element. The 'array' attribute specifies which array to iterate over.`,
      severity: 'error',
      line: position?.line,
      column: position?.column,
    });
  }
}

function validateChildElements(
  element: any,
  reportedErrors: Set<string>,
  elementPositions: Map<any, { line: number; column: number }>,
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
          elementPositions,
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
 */
export function validateAllElementAttributes(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  validateElementAttributes(
    'scxml',
    scxml as unknown as Record<string, unknown>,
    getValidScxmlAttributes(),
    errors
  );
  validateChildElementAttributes(scxml, errors);
}

function validateChildElementAttributes(
  element: SCXMLElement | StateElement | ParallelElement,
  errors: ValidationError[]
): void {
  // Validate states
  if (element.state) {
    const states = Array.isArray(element.state) ? element.state : [element.state];
    states.forEach((state: StateElement) => {
      validateElementAttributes(
        'state',
        state as unknown as Record<string, unknown>,
        getValidStateAttributes(),
        errors
      );
      validateStateChildren(state, errors);
      validateChildElementAttributes(state, errors);
    });
  }

  // Validate parallel states
  if (element.parallel) {
    const parallels = Array.isArray(element.parallel)
      ? element.parallel
      : [element.parallel];
    parallels.forEach((parallel: ParallelElement) => {
      validateElementAttributes(
        'parallel',
        parallel as unknown as Record<string, unknown>,
        getValidParallelAttributes(),
        errors
      );
      validateChildElementAttributes(parallel, errors);
    });
  }

  // Validate final states
  if ((element as any).final) {
    const finals = Array.isArray((element as any).final)
      ? (element as any).final
      : [(element as any).final];
    finals.forEach((final: FinalElement) => {
      validateElementAttributes(
        'final',
        final as unknown as Record<string, unknown>,
        getValidFinalAttributes(),
        errors
      );
    });
  }

  // Validate history states
  if ((element as any).history) {
    const histories = Array.isArray((element as any).history)
      ? (element as any).history
      : [(element as any).history];
    histories.forEach((history: HistoryElement) => {
      validateElementAttributes(
        'history',
        history as unknown as Record<string, unknown>,
        getValidHistoryAttributes(),
        errors
      );
    });
  }

  // Validate transitions
  if ((element as any).transition) {
    const transitions = Array.isArray((element as any).transition)
      ? (element as any).transition
      : [(element as any).transition];
    transitions.forEach((transition: TransitionElement) => {
      validateElementAttributes(
        'transition',
        transition as unknown as Record<string, unknown>,
        getValidTransitionAttributes(),
        errors
      );
    });
  }
}

function validateStateChildren(state: StateElement, errors: ValidationError[]): void {
  // Validate onentry
  if (state.onentry) {
    const onentries = Array.isArray(state.onentry) ? state.onentry : [state.onentry];
    onentries.forEach((onentry: OnEntryElement) => {
      validateElementAttributes(
        'onentry',
        onentry as unknown as Record<string, unknown>,
        getValidOnentryAttributes(),
        errors
      );
    });
  }

  // Validate onexit
  if (state.onexit) {
    const onexits = Array.isArray(state.onexit) ? state.onexit : [state.onexit];
    onexits.forEach((onexit: OnExitElement) => {
      validateElementAttributes(
        'onexit',
        onexit as unknown as Record<string, unknown>,
        getValidOnexitAttributes(),
        errors
      );
    });
  }

  // Validate datamodel
  if (state.datamodel) {
    const datamodels = Array.isArray(state.datamodel)
      ? state.datamodel
      : [state.datamodel];
    datamodels.forEach((datamodel: DataModelElement) => {
      validateElementAttributes(
        'datamodel',
        datamodel as unknown as Record<string, unknown>,
        getValidDatamodelAttributes(),
        errors
      );

      // Validate data elements
      if (datamodel.data) {
        const dataElements = Array.isArray(datamodel.data)
          ? datamodel.data
          : [datamodel.data];
        dataElements.forEach((data: DataElement) => {
          validateElementAttributes(
            'data',
            data as unknown as Record<string, unknown>,
            getValidDataAttributes(),
            errors
          );
        });
      }
    });
  }

  // Validate invoke
  if (state.invoke) {
    const invokes = Array.isArray(state.invoke) ? state.invoke : [state.invoke];
    invokes.forEach((invoke: InvokeElement) => {
      validateElementAttributes(
        'invoke',
        invoke as unknown as Record<string, unknown>,
        getValidInvokeAttributes(),
        errors
      );
    });
  }

  // Validate executable content
  validateExecutableContent(state.onentry, errors);
  validateExecutableContent(state.onexit, errors);
}

function validateExecutableContent(
  element:
    | OnEntryElement
    | OnExitElement
    | OnEntryElement[]
    | OnExitElement[]
    | undefined,
  errors: ValidationError[]
): void {
  if (!element) return;
  const elements = Array.isArray(element) ? element : [element];
  elements.forEach((el: OnEntryElement | OnExitElement) => {
    if (el.executable) {
      el.executable.forEach((executable) => {
        validateExecutableElement(executable, errors);
      });
    }
  });
}

function validateExecutableElement(
  executable: import('@/types/scxml').ExecutableElement,
  errors: ValidationError[]
): void {
  const elementType = Object.keys(executable).find(
    (key) => !key.startsWith('@_') && key !== '#text' && key !== '#cdata'
  );

  if (!elementType) return;

  switch (elementType) {
    case 'raise':
      validateElementAttributes(
        'raise',
        executable as Record<string, unknown>,
        getValidRaiseAttributes(),
        errors
      );
      break;
    case 'if':
      validateElementAttributes(
        'if',
        executable as Record<string, unknown>,
        getValidIfAttributes(),
        errors
      );
      const ifEl = executable as IfElement;
      if (ifEl.executable) {
        ifEl.executable.forEach((nested) => validateExecutableElement(nested, errors));
      }
      break;
    case 'elseif':
      validateElementAttributes(
        'elseif',
        executable as Record<string, unknown>,
        getValidElseifAttributes(),
        errors
      );
      break;
    case 'else':
      validateElementAttributes(
        'else',
        executable as Record<string, unknown>,
        getValidElseAttributes(),
        errors
      );
      const elseEl = executable as ElseElement;
      if (elseEl.executable) {
        elseEl.executable.forEach((nested) =>
          validateExecutableElement(nested, errors)
        );
      }
      break;
    case 'foreach':
      validateElementAttributes(
        'foreach',
        executable as Record<string, unknown>,
        getValidForeachAttributes(),
        errors
      );
      const foreachEl = executable as ForEachElement;
      if (foreachEl.executable) {
        foreachEl.executable.forEach((nested) =>
          validateExecutableElement(nested, errors)
        );
      }
      break;
    case 'log':
      validateElementAttributes(
        'log',
        executable as Record<string, unknown>,
        getValidLogAttributes(),
        errors
      );
      break;
    case 'assign':
      validateElementAttributes(
        'assign',
        executable as Record<string, unknown>,
        getValidAssignAttributes(),
        errors
      );
      break;
    case 'script':
      validateElementAttributes(
        'script',
        executable as Record<string, unknown>,
        getValidScriptAttributes(),
        errors
      );
      break;
    case 'send':
      validateElementAttributes(
        'send',
        executable as Record<string, unknown>,
        getValidSendAttributes(),
        errors
      );
      break;
    case 'cancel':
      validateElementAttributes(
        'cancel',
        executable as Record<string, unknown>,
        getValidCancelAttributes(),
        errors
      );
      break;
  }
}

function validateElementAttributes(
  elementName: string,
  element: Record<string, unknown>,
  validAttributes: Set<string>,
  errors: ValidationError[]
): void {
  if (!element || typeof element !== 'object') return;

  Object.keys(element).forEach((key) => {
    // Skip non-attribute properties
    if (!key.startsWith('@_') && key !== '#text' && key !== '#cdata') return;

    const attributeName = key.startsWith('@_') ? key.substring(2) : key;

    // Skip visual namespace attributes
    if (attributeName.includes(':') && attributeName.match(/^[\w-]+:[\w-]+$/)) {
      return;
    }

    // Skip xmlns declarations
    if (attributeName.startsWith('xmlns:')) {
      return;
    }

    if (!validAttributes.has(attributeName)) {
      const suggestion = findSimilarAttribute(attributeName, validAttributes);
      const elementId = element['@_id'] ? ` (id: ${element['@_id']})` : '';

      errors.push({
        message: `Unknown attribute '${attributeName}' in <${elementName}>${elementId}${
          suggestion ? `. Did you mean '${suggestion}'?` : ''
        }`,
        severity: 'error',
      });
    }
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
