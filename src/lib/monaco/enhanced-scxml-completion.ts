import { Position } from 'reactflow';
import type * as monaco from 'monaco-editor';
import { extractStateIdsFromXML } from '@/lib/utils/state-id-extractor';

/**
 * SCXML Elements organized by category
 */
const SCXML_ELEMENTS = {
  core: [
    'scxml',
    'state',
    'parallel',
    'transition',
    'initial',
    'final',
    'history',
  ],
  executable: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'finalize',
    'assign',
    'script',
  ],
  dataModel: ['datamodel', 'data', 'donedata', 'content', 'param'],
  entryExit: ['onentry', 'onexit'],
};

/**
 * Valid attributes for each SCXML element
 */
const ELEMENT_ATTRIBUTES: Record<string, string[]> = {
  scxml: ['xmlns', 'version', 'initial', 'name', 'datamodel', 'binding'],
  state: ['id', 'initial'],
  parallel: ['id'],
  transition: ['event', 'cond', 'target', 'type', 'internal'],
  initial: ['id'],
  final: ['id'],
  onentry: [],
  onexit: [],
  history: ['id', 'type', 'default'],
  raise: ['event'],
  if: ['cond'],
  elseif: ['cond'],
  else: [],
  foreach: ['array', 'item', 'index'],
  log: ['label', 'expr'],
  send: [
    'event',
    'eventexpr',
    'target',
    'targetexpr',
    'type',
    'typeexpr',
    'id',
    'delay',
    'delayexpr',
    'namelist',
  ],
  cancel: ['sendid', 'sendidexpr'],
  invoke: [
    'type',
    'typeexpr',
    'src',
    'srcexpr',
    'id',
    'idlocation',
    'namelist',
    'autoforward',
  ],
  finalize: [],
  datamodel: [],
  data: ['id', 'src', 'expr'],
  assign: ['location', 'expr'],
  donedata: [],
  content: ['expr'],
  param: ['name', 'expr', 'location'],
  script: ['src'],
};

/**
 * Valid child elements for each parent element
 */
const VALID_CHILDREN: Record<string, string[]> = {
  scxml: ['state', 'parallel', 'final', 'datamodel'],
  state: [
    'state',
    'parallel',
    'transition',
    'initial',
    'final',
    'onentry',
    'onexit',
    'history',
    'datamodel',
  ],
  parallel: ['state', 'parallel', 'transition', 'onentry', 'onexit', 'history'],
  transition: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  onentry: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  onexit: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  if: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  elseif: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  else: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  foreach: [
    'raise',
    'if',
    'elseif',
    'else',
    'foreach',
    'log',
    'send',
    'cancel',
    'invoke',
    'assign',
    'script',
  ],
  datamodel: ['data'],
  data: ['content'],
  invoke: ['param', 'finalize', 'content'],
  send: ['param', 'content'],
  donedata: ['param', 'content'],
};

/**
 * Attribute value suggestions for specific attributes
 */
const ATTRIBUTE_VALUES: Record<string, string[]> = {
  type: ['internal', 'external'],
  datamodel: ['null', 'ecmascript', 'xpath'],
  binding: ['early', 'late'],
  xmlns: ['http://www.w3.org/2005/07/scxml'],
  version: ['1.0'],
  'history.type': ['shallow', 'deep'],
  'transition.type': ['internal', 'external'],
  autoforward: ['true', 'false'],
  internal: ['true', 'false'],
};

/**
 * Element templates with snippets
 */
const ELEMENT_TEMPLATES: Record<
  string,
  { insertText: string; documentation: string; detail: string }
> = {
  scxml: {
    insertText:
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="${1:start}">\n\t${0}\n</scxml>',
    documentation: 'SCXML root element - defines the state machine',
    detail: 'SCXML Document Root',
  },
  'scxml-complete': {
    insertText:
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="${1:start}">\n\t<state id="${1:start}">\n\t\t<transition event="${2:next}" target="${3:end}"/>\n\t</state>\n\t<final id="${3:end}"/>\n</scxml>',
    documentation: 'Complete SCXML document with example states and transition',
    detail: 'Complete SCXML Document',
  },
  state: {
    insertText: '<state id="${1:stateName}">\n\t${0}\n</state>',
    documentation:
      'SCXML state - atomic or compound state in the state machine',
    detail: 'State Element',
  },
  'state-initial': {
    insertText:
      '<state id="${1:stateName}" initial="${2:childState}">\n\t<state id="${2:childState}">\n\t\t${3}\n\t</state>\n\t${0}\n</state>',
    documentation: 'SCXML compound state with initial child state',
    detail: 'Compound State',
  },
  'state-actions': {
    insertText:
      '<state id="${1:stateName}">\n\t<onentry>\n\t\t${2:<log label="Entering ${1:stateName}"/>}\n\t</onentry>\n\t<onexit>\n\t\t${3:<log label="Exiting ${1:stateName}"/>}\n\t</onexit>\n\t${0}\n</state>',
    documentation: 'SCXML state with entry and exit actions',
    detail: 'State with Actions',
  },
  parallel: {
    insertText: '<parallel id="${1:parallelName}">\n\t${0}\n</parallel>',
    documentation:
      'SCXML parallel state - all child states are active simultaneously',
    detail: 'Parallel State',
  },
  transition: {
    insertText:
      '<transition event="${1:eventName}" target="${2:targetState}"/>',
    documentation: 'SCXML transition - defines state transitions',
    detail: 'Transition Element',
  },
  'transition-cond': {
    insertText:
      '<transition event="${1:eventName}" cond="${2:condition}" target="${3:targetState}"/>',
    documentation: 'SCXML conditional transition with guard condition',
    detail: 'Conditional Transition',
  },
  'transition-action': {
    insertText:
      '<transition event="${1:eventName}" target="${2:targetState}">\n\t${3:<raise event="actionEvent"/>}\n</transition>',
    documentation: 'SCXML transition with executable actions',
    detail: 'Transition with Actions',
  },
  'transition-internal': {
    insertText:
      '<transition event="${1:eventName}" type="internal">\n\t${0}\n</transition>',
    documentation:
      'SCXML internal transition - does not exit and re-enter the state',
    detail: 'Internal Transition',
  },
  final: {
    insertText: '<final id="${1:finalName}"/>',
    documentation: 'SCXML final state - indicates successful completion',
    detail: 'Final State',
  },
  initial: {
    insertText:
      '<initial>\n\t<transition target="${1:initialState}"/>\n</initial>',
    documentation: 'SCXML explicit initial transition for compound states',
    detail: 'Initial Element',
  },
  history: {
    insertText:
      '<history id="${1:historyName}" type="${2:shallow}">\n\t<transition target="${3:defaultState}"/>\n</history>',
    documentation: 'SCXML history pseudostate for state restoration',
    detail: 'History State',
  },
  onentry: {
    insertText: '<onentry>\n\t${0}\n</onentry>',
    documentation: 'SCXML onentry - actions executed when entering a state',
    detail: 'OnEntry Actions',
  },
  onexit: {
    insertText: '<onexit>\n\t${0}\n</onexit>',
    documentation: 'SCXML onexit - actions executed when exiting a state',
    detail: 'OnExit Actions',
  },
  datamodel: {
    insertText:
      '<datamodel>\n\t<data id="${1:variableName}" expr="${2:initialValue}"/>\n</datamodel>',
    documentation: 'SCXML datamodel - container for data declarations',
    detail: 'Data Model',
  },
  data: {
    insertText: '<data id="${1:variableName}" expr="${2:initialValue}"/>',
    documentation: 'SCXML data declaration with initial value',
    detail: 'Data Declaration',
  },
  assign: {
    insertText: '<assign location="${1:variable}" expr="${2:value}"/>',
    documentation: 'SCXML assign - assigns a value to a data location',
    detail: 'Assign Action',
  },
  raise: {
    insertText: '<raise event="${1:eventName}"/>',
    documentation: 'SCXML raise - raises an internal event',
    detail: 'Raise Event',
  },
  send: {
    insertText: '<send event="${1:eventName}" target="${2:target}"/>',
    documentation: 'SCXML send - sends an event to a target',
    detail: 'Send Event',
  },
  'send-delayed': {
    insertText:
      '<send event="${1:eventName}" target="${2:target}" delay="${3:1s}" id="${4:sendId}"/>',
    documentation:
      'SCXML send with delay - sends a delayed event with cancellable ID',
    detail: 'Delayed Send',
  },
  'send-params': {
    insertText:
      '<send event="${1:eventName}" target="${2:target}">\n\t<param name="${3:paramName}" expr="${4:value}"/>\n\t${0}\n</send>',
    documentation: 'SCXML send with parameters',
    detail: 'Send with Parameters',
  },
  cancel: {
    insertText: '<cancel sendid="${1:sendId}"/>',
    documentation: 'SCXML cancel - cancels a delayed send event',
    detail: 'Cancel Event',
  },
  log: {
    insertText: '<log label="${1:message}" expr="${2:expression}"/>',
    documentation: 'SCXML log - logs a message for debugging',
    detail: 'Log Action',
  },
  if: {
    insertText: '<if cond="${1:condition}">\n\t${0}\n</if>',
    documentation: 'SCXML if - conditional execution block',
    detail: 'Conditional Block',
  },
  'if-else': {
    insertText:
      '<if cond="${1:condition}">\n\t${2:<log label="Condition true"/>}\n<else/>\n\t${3:<log label="Condition false"/>}\n</if>',
    documentation: 'SCXML if-else - conditional execution with else branch',
    detail: 'If-Else Block',
  },
  'if-elseif-else': {
    insertText:
      '<if cond="${1:condition1}">\n\t${2}\n<elseif cond="${3:condition2}"/>\n\t${4}\n<else/>\n\t${0}\n</if>',
    documentation: 'SCXML if-elseif-else - multiple conditional branches',
    detail: 'If-ElseIf-Else Block',
  },
  elseif: {
    insertText: '<elseif cond="${1:condition}"/>',
    documentation: 'SCXML elseif - alternative condition in if block',
    detail: 'ElseIf Condition',
  },
  else: {
    insertText: '<else/>',
    documentation: 'SCXML else - default branch in if block',
    detail: 'Else Branch',
  },
  foreach: {
    insertText:
      '<foreach array="${1:arrayVariable}" item="${2:item}" index="${3:index}">\n\t${0}\n</foreach>',
    documentation: 'SCXML foreach - iterates over array elements with index',
    detail: 'ForEach Loop',
  },
  script: {
    insertText: '<script>\n\t${0}\n</script>',
    documentation: 'SCXML script - executable script content',
    detail: 'Script Block',
  },
  invoke: {
    insertText:
      '<invoke type="${1:service}" src="${2:source}" id="${3:invokeId}"/>',
    documentation: 'SCXML invoke - invokes an external service',
    detail: 'Invoke Service',
  },
  'invoke-params': {
    insertText:
      '<invoke type="${1:service}" src="${2:source}" id="${3:invokeId}">\n\t<param name="${4:paramName}" expr="${5:value}"/>\n\t<finalize>\n\t\t${0}\n\t</finalize>\n</invoke>',
    documentation: 'SCXML invoke with parameters and finalize block',
    detail: 'Invoke with Parameters',
  },
  param: {
    insertText: '<param name="${1:paramName}" expr="${2:value}"/>',
    documentation: 'SCXML param - parameter for invoke or send',
    detail: 'Parameter',
  },
  content: {
    insertText: '<content expr="${1:expression}"/>',
    documentation: 'SCXML content - content for send or invoke',
    detail: 'Content',
  },
  'content-body': {
    insertText: '<content>\n\t${1:content body}\n</content>',
    documentation: 'SCXML content with body text',
    detail: 'Content Body',
  },
  finalize: {
    insertText:
      '<finalize>\n\t${1:<log label="Service finalized"/>}\n</finalize>',
    documentation: 'SCXML finalize - cleanup actions when service terminates',
    detail: 'Finalize Block',
  },
  donedata: {
    insertText:
      '<donedata>\n\t<param name="${1:paramName}" expr="${2:value}"/>\n\t${0}\n</donedata>',
    documentation: 'SCXML donedata - data to send with done event',
    detail: 'Done Data',
  },
};

/**
 * Context analysis for completion
 */
interface CompletionContext {
  type: 'element' | 'attribute' | 'attributeValue' | 'text';
  parentElement?: string;
  currentElement?: string;
  currentAttribute?: string;
  existingAttributes?: string[];
  isInTag: boolean;
  textBeforeCursor: string;
  lineText: string;
}

/**
 * Extracts existing attributes from the current tag
 */
function extractExistingAttributes(tagContent: string): string[] {
  const attributes: string[] = [];
  // Match attribute patterns: name="value" or name='value' or name=value
  const attrRegex = /(\w+)\s*=\s*(?:["']([^"']*)["']|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(tagContent)) !== null) {
    attributes.push(match[1]);
  }

  return attributes;
}

/**
 * Analyzes the current cursor context for completion
 */
function analyzeContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): CompletionContext {
  const lineText = model.getLineContent(position.lineNumber);
  const textBeforeCursor = lineText.substring(0, position.column - 1);
  const charAtCursor = lineText.charAt(position.column - 1);
  const charBeforeCursor = lineText.charAt(position.column - 2);

  // Check if we're inside a tag
  const lastOpenBracket = textBeforeCursor.lastIndexOf('<');
  const lastCloseBracket = textBeforeCursor.lastIndexOf('>');
  const isInTag = lastOpenBracket > lastCloseBracket;

  const context: CompletionContext = {
    type: 'text',
    isInTag,
    textBeforeCursor,
    lineText,
  };

  if (isInTag) {
    // We're inside a tag, analyze what kind of completion we need
    const tagContent = textBeforeCursor.substring(lastOpenBracket + 1);

    // Check for closing tag
    if (tagContent.startsWith('/')) {
      context.type = 'element';
      return context;
    }

    const spaceIndex = tagContent.indexOf(' ');

    if (spaceIndex === -1) {
      // Still typing element name
      context.type = 'element';
      context.parentElement = findParentElement(model, position);
    } else {
      // In attributes area
      const elementName = tagContent.substring(0, spaceIndex);
      context.currentElement = elementName;

      const attrPart = tagContent.substring(spaceIndex + 1);

      // Extract existing attributes from the entire tag content
      context.existingAttributes = extractExistingAttributes(tagContent);

      // Improved attribute parsing
      const attrMatches = attrPart.match(/(\w+)=(["\'](.*?)["\'\s]*)/g) || [];
      const lastAttrMatch = attrPart.match(/(\w+)\s*=\s*(["\'])([^"\']*)$/);

      if (lastAttrMatch) {
        // Inside attribute value (incomplete quote)
        context.type = 'attributeValue';
        context.currentAttribute = lastAttrMatch[1];
      } else {
        // Check if we're after an equals sign
        const equalsMatch = attrPart.match(/(\w+)\s*=\s*$/);
        if (equalsMatch) {
          context.type = 'attributeValue';
          context.currentAttribute = equalsMatch[1];
        } else {
          // Typing attribute name
          context.type = 'attribute';
        }
      }
    }
  } else {
    // Outside tags - check parent element
    context.parentElement = findParentElement(model, position);

    // Check if we might be starting a new tag
    if (textBeforeCursor.endsWith('<')) {
      context.type = 'element';
      context.isInTag = true; // Override for new tag
      // When typing <, we still want to preserve the parent element context
      // The findParentElement should work correctly for determining valid children
    }
  }

  return context;
}

/**
 * Find the parent element by parsing backwards
 */
function findParentElement(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): string | undefined {
  // Get text until current position, but exclude the current character if it's '<'
  let endColumn = position.column;
  const currentLineText = model.getLineContent(position.lineNumber);
  const charAtPosition = currentLineText.charAt(position.column - 1);

  // If we're right after typing '<', don't include it in the analysis
  if (charAtPosition === '<') {
    endColumn = position.column - 1;
  }

  const textUntilPosition = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: endColumn,
  });

  const openTags: string[] = [];
  // Improved regex to handle self-closing tags and nested structures better
  const tagRegex = /<(\/?)(\w+)(?:[^>]*?\s)?([^>]*?)>/g;
  let match;

  while ((match = tagRegex.exec(textUntilPosition)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    const tagAttributes = match[3] || '';

    // Skip self-closing tags (ending with /)
    if (tagAttributes.endsWith('/')) {
      continue;
    }

    if (isClosing) {
      // Remove the most recent matching opening tag
      const lastIndex = openTags.lastIndexOf(tagName);
      if (lastIndex !== -1) {
        openTags.splice(lastIndex, 1);
      }
    } else {
      openTags.push(tagName);
    }
  }

  return openTags[openTags.length - 1];
}

/**
 * Creates element completion suggestions
 */
function createElementSuggestions(
  monaco: typeof import('monaco-editor'),
  context: CompletionContext
): monaco.languages.CompletionItem[] {
  const suggestions: monaco.languages.CompletionItem[] = [];

  // Determine valid elements based on context
  let validElements: string[] = [];

  if (context.parentElement && VALID_CHILDREN[context.parentElement]) {
    validElements = VALID_CHILDREN[context.parentElement];
  } else if (!context.parentElement) {
    // Root level - allow scxml and common document templates
    validElements = ['scxml'];
  } else {
    // Fallback - allow all elements
    validElements = [
      ...SCXML_ELEMENTS.core,
      ...SCXML_ELEMENTS.executable,
      ...SCXML_ELEMENTS.dataModel,
      ...SCXML_ELEMENTS.entryExit,
    ];
  }

  // Check if user just typed '<' - we need to remove the opening bracket from templates
  const userTypedOpenBracket = context.textBeforeCursor.endsWith('<');

  // Create suggestions for each valid element
  for (const element of validElements) {
    if (ELEMENT_TEMPLATES[element]) {
      const template = ELEMENT_TEMPLATES[element];
      let insertText = template.insertText;

      // If user already typed '<', remove it from our template to avoid duplication
      if (userTypedOpenBracket && insertText.startsWith('<')) {
        insertText = insertText.substring(1);
      }

      suggestions.push({
        label: element,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: insertText,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: template.documentation,
        detail: template.detail,
        range: undefined as any, // Let Monaco handle the range
      });
    }

    // Also add variant templates if they exist
    const variants = Object.keys(ELEMENT_TEMPLATES).filter((key) =>
      key.startsWith(element + '-')
    );
    for (const variant of variants) {
      const template = ELEMENT_TEMPLATES[variant];
      let insertText = template.insertText;

      // If user already typed '<', remove it from our template to avoid duplication
      if (userTypedOpenBracket && insertText.startsWith('<')) {
        insertText = insertText.substring(1);
      }

      suggestions.push({
        label: variant,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: insertText,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: template.documentation,
        detail: template.detail,
        range: undefined as any, // Let Monaco handle the range
      });
    }
  }

  return suggestions;
}

/**
 * Creates attribute completion suggestions
 */
function createAttributeSuggestions(
  monaco: typeof import('monaco-editor'),
  context: CompletionContext
): monaco.languages.CompletionItem[] {
  if (!context.currentElement) {
    return [];
  }

  const validAttributes = ELEMENT_ATTRIBUTES[context.currentElement] || [];
  const existingAttributes = context.existingAttributes || [];

  // Filter out attributes that already exist on the element
  const availableAttributes = validAttributes.filter(
    (attr) => !existingAttributes.includes(attr)
  );

  const suggestions: monaco.languages.CompletionItem[] = [];

  for (const attr of availableAttributes) {
    suggestions.push({
      label: attr,
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: `${attr}="\${1:value}"`,
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: `${attr} attribute for ${context.currentElement} element`,
      detail: `Attribute`,
      range: undefined as any, // Let Monaco handle the range
    });
  }

  return suggestions;
}

/**
 * Creates attribute value completion suggestions
 */
/**
 * Find the parent state ID at a given line number in the XML
 */
export function findParentStateAtPosition(
  xmlContent: string,
  lineNumber: number
): string | undefined {
  const lines = xmlContent.split('\n');
  const openTags: string[] = [];
  // Parse lines up to the cursor position
  for (let i = 0; i < Math.min(lineNumber, lines.length); i++) {
    const line = lines[i];
    // Match opening state tags
    const openStateMatch = line.match(
      /<(state|parallel)\s+id=["']([^"']+)["']/
    );
    if (openStateMatch) {
      openTags.push(openStateMatch[2]);
    }
    // Match closing state tags
    const closeStateMatch = line.match(/<\/(state|parallel)>/);
    if (closeStateMatch && openTags.length > 0) {
      openTags.pop();
    }

    // Match self-closing state tags (shouldn't happen but handle it)
    const selfClosingMatch = line.match(/<(state|parallel)\s+[^>]*\/>/);
    if (selfClosingMatch) {
      // Don't add to stack for self-closing tags
      continue;
    }
  }

  // Return the most recent unclosed state
  return openTags[openTags.length - 1];
}

function createAttributeValueSuggestions(
  monaco: typeof import('monaco-editor'),
  context: CompletionContext,
  model: monaco.editor.ITextModel,
  position: monaco.Position
): monaco.languages.CompletionItem[] {
  if (!context.currentAttribute) return [];

  const suggestions: monaco.languages.CompletionItem[] = [];

  // Handle state ID references for target, initial, and default attributes
  if (
    context.currentAttribute === 'target' ||
    context.currentAttribute === 'initial' ||
    context.currentAttribute === 'default'
  ) {
    // Get the current document content
    const xmlContent = model.getValue();

    // Extract all state IDs from the document
    let stateIdInfos = extractStateIdsFromXML(xmlContent);
    const transitionParentId = findParentStateAtPosition(
      xmlContent,
      position.lineNumber
    );

    // Find the parent state info
    const parentIdOfCurrentParent = stateIdInfos.find(
      (i) => i.id === transitionParentId
    );

    // Filter to show only sibling states (same level)
    stateIdInfos = stateIdInfos.filter(
      (i) => i.parent === parentIdOfCurrentParent?.parent
    );
    // Create suggestions for each state ID
    for (const stateInfo of stateIdInfos) {
      // Create a descriptive label showing the state hierarchy
      const pathLabel =
        stateInfo.path.length > 1
          ? stateInfo.path.slice(0, -1).join(' > ') + ' > '
          : '';

      suggestions.push({
        label: stateInfo.id,
        kind: monaco.languages.CompletionItemKind.Reference,
        insertText: stateInfo.id,
        documentation: `${
          stateInfo.type.charAt(0).toUpperCase() + stateInfo.type.slice(1)
        } state${stateInfo.parent ? ` in ${stateInfo.parent}` : ''}`,
        detail: `${pathLabel}${stateInfo.id} (${stateInfo.type})`,
        sortText: stateInfo.id, // Sort alphabetically by ID
        range: undefined as any, // Let Monaco handle the range
      });
    }

    // If no state IDs found, provide helpful message
    if (suggestions.length === 0) {
      suggestions.push({
        label: '(No states defined)',
        kind: monaco.languages.CompletionItemKind.Text,
        insertText: '',
        documentation: 'Define states in your SCXML document first',
        detail: 'No available state IDs',
        range: undefined as any,
      });
    }
  } else {
    // Use static values for other attributes
    const validValues = ATTRIBUTE_VALUES[context.currentAttribute] || [];

    for (const value of validValues) {
      suggestions.push({
        label: value,
        kind: monaco.languages.CompletionItemKind.Value,
        insertText: value,
        documentation: `Valid value for ${context.currentAttribute} attribute`,
        detail: 'Attribute Value',
        range: undefined as any, // Let Monaco handle the range
      });
    }
  }

  return suggestions;
}

/**
 * Enhanced SCXML completion provider
 */
export function createEnhancedSCXMLCompletionProvider(
  monaco: typeof import('monaco-editor')
): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['<', ' ', '=', '"', "'"],

    provideCompletionItems: (model, position, context, token) => {
      const completionContext = analyzeContext(model, position);
      let suggestions: monaco.languages.CompletionItem[] = [];

      switch (completionContext.type) {
        case 'element':
          suggestions = createElementSuggestions(monaco, completionContext);
          break;
        case 'attribute':
          suggestions = createAttributeSuggestions(monaco, completionContext);
          break;
        case 'attributeValue':
          suggestions = createAttributeValueSuggestions(
            monaco,
            completionContext,
            model,
            position
          );
          break;
        case 'text':
          // If we're outside tags and have a parent, suggest valid children
          if (completionContext.parentElement) {
            suggestions = createElementSuggestions(monaco, completionContext);
          } else {
            // Root level or unknown context - suggest basic elements
            suggestions = createElementSuggestions(monaco, completionContext);
          }
          break;
      }

      return { suggestions };
    },
  };
}
