import type * as monaco from 'monaco-editor';

export interface SCXMLCompletionItem {
  label: string;
  kind: monaco.languages.CompletionItemKind;
  insertText: string;
  documentation: string;
  detail?: string;
  insertTextRules?: monaco.languages.CompletionItemInsertTextRule;
}

// SCXML element definitions with comprehensive auto-completion
export const scxmlElements: SCXMLCompletionItem[] = [
  {
    label: 'scxml',
    kind: 15, // Keyword
    insertText:
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="$1">\n\t$0\n</scxml>',
    documentation: 'Root element of an SCXML document',
    detail: 'SCXML Root Element',
    insertTextRules: 4, // InsertAsSnippet
  },
  {
    label: 'state',
    kind: 15,
    insertText: '<state id="$1">\n\t$0\n</state>',
    documentation: 'Defines a state in the state machine',
    detail: 'State Element',
    insertTextRules: 4,
  },
  {
    label: 'state-initial',
    kind: 15,
    insertText: '<state id="$1" initial="$2">\n\t$0\n</state>',
    documentation: 'Compound state with initial child state',
    detail: 'Compound State with Initial',
    insertTextRules: 4,
  },
  {
    label: 'parallel',
    kind: 15,
    insertText: '<parallel id="$1">\n\t$0\n</parallel>',
    documentation:
      'Parallel state where all child states are active simultaneously',
    detail: 'Parallel State Element',
    insertTextRules: 4,
  },
  {
    label: 'final',
    kind: 15,
    insertText: '<final id="$1">\n\t$0\n</final>',
    documentation: 'Final state indicating completion',
    detail: 'Final State Element',
    insertTextRules: 4,
  },
  {
    label: 'initial',
    kind: 15,
    insertText: '<initial>\n\t<transition target="$1" />\n</initial>',
    documentation: 'Explicit initial transition for compound states',
    detail: 'Initial Element',
    insertTextRules: 4,
  },
  {
    label: 'history',
    kind: 15,
    insertText:
      '<history id="$1" type="$2">\n\t<transition target="$3" />\n</history>',
    documentation: 'History pseudo-state (shallow or deep)',
    detail: 'History Element',
    insertTextRules: 4,
  },
  {
    label: 'transition',
    kind: 15,
    insertText: '<transition event="$1" target="$2" />',
    documentation: 'Transition between states',
    detail: 'Transition Element',
    insertTextRules: 4,
  },
  {
    label: 'transition-cond',
    kind: 15,
    insertText: '<transition event="$1" cond="$2" target="$3" />',
    documentation: 'Conditional transition with guard condition',
    detail: 'Conditional Transition',
    insertTextRules: 4,
  },
  {
    label: 'transition-internal',
    kind: 15,
    insertText: '<transition event="$1" type="internal">\n\t$0\n</transition>',
    documentation: 'Internal transition (does not exit/re-enter state)',
    detail: 'Internal Transition',
    insertTextRules: 4,
  },
  {
    label: 'onentry',
    kind: 15,
    insertText: '<onentry>\n\t$0\n</onentry>',
    documentation: 'Actions executed when entering a state',
    detail: 'OnEntry Element',
    insertTextRules: 4,
  },
  {
    label: 'onexit',
    kind: 15,
    insertText: '<onexit>\n\t$0\n</onexit>',
    documentation: 'Actions executed when exiting a state',
    detail: 'OnExit Element',
    insertTextRules: 4,
  },
  {
    label: 'datamodel',
    kind: 15,
    insertText: '<datamodel>\n\t<data id="$1" expr="$2" />\n</datamodel>',
    documentation: 'Data model containing data declarations',
    detail: 'DataModel Element',
    insertTextRules: 4,
  },
  {
    label: 'data',
    kind: 15,
    insertText: '<data id="$1" expr="$2" />',
    documentation: 'Data declaration with initial value',
    detail: 'Data Element',
    insertTextRules: 4,
  },
  {
    label: 'assign',
    kind: 15,
    insertText: '<assign location="$1" expr="$2" />',
    documentation: 'Assigns a value to a data location',
    detail: 'Assign Element',
    insertTextRules: 4,
  },
  {
    label: 'raise',
    kind: 15,
    insertText: '<raise event="$1" />',
    documentation: 'Raises an internal event',
    detail: 'Raise Element',
    insertTextRules: 4,
  },
  {
    label: 'send',
    kind: 15,
    insertText: '<send event="$1" target="$2" />',
    documentation: 'Sends an event to a target',
    detail: 'Send Element',
    insertTextRules: 4,
  },
  {
    label: 'send-delayed',
    kind: 15,
    insertText: '<send event="$1" target="$2" delay="$3" />',
    documentation: 'Sends a delayed event',
    detail: 'Delayed Send Element',
    insertTextRules: 4,
  },
  {
    label: 'cancel',
    kind: 15,
    insertText: '<cancel sendid="$1" />',
    documentation: 'Cancels a delayed send event',
    detail: 'Cancel Element',
    insertTextRules: 4,
  },
  {
    label: 'if',
    kind: 15,
    insertText: '<if cond="$1">\n\t$0\n</if>',
    documentation: 'Conditional execution block',
    detail: 'If Element',
    insertTextRules: 4,
  },
  {
    label: 'if-else',
    kind: 15,
    insertText: '<if cond="$1">\n\t$2\n<else />\n\t$0\n</if>',
    documentation: 'Conditional execution with else branch',
    detail: 'If-Else Element',
    insertTextRules: 4,
  },
  {
    label: 'elseif',
    kind: 15,
    insertText: '<elseif cond="$1" />',
    documentation: 'Alternative condition in if block',
    detail: 'ElseIf Element',
    insertTextRules: 4,
  },
  {
    label: 'else',
    kind: 15,
    insertText: '<else />',
    documentation: 'Else branch in if block',
    detail: 'Else Element',
    insertTextRules: 4,
  },
  {
    label: 'foreach',
    kind: 15,
    insertText: '<foreach array="$1" item="$2">\n\t$0\n</foreach>',
    documentation: 'Iterates over array elements',
    detail: 'ForEach Element',
    insertTextRules: 4,
  },
  {
    label: 'log',
    kind: 15,
    insertText: '<log label="$1" expr="$2" />',
    documentation: 'Logs a message for debugging',
    detail: 'Log Element',
    insertTextRules: 4,
  },
  {
    label: 'script',
    kind: 15,
    insertText: '<script>\n\t$0\n</script>',
    documentation: 'Executable script content',
    detail: 'Script Element',
    insertTextRules: 4,
  },
  {
    label: 'script-src',
    kind: 15,
    insertText: '<script src="$1" />',
    documentation: 'Script from external source',
    detail: 'External Script Element',
    insertTextRules: 4,
  },
  {
    label: 'invoke',
    kind: 15,
    insertText: '<invoke type="$1" src="$2" />',
    documentation: 'Invokes an external service',
    detail: 'Invoke Element',
    insertTextRules: 4,
  },
  {
    label: 'invoke-id',
    kind: 15,
    insertText: '<invoke id="$1" type="$2" src="$3">\n\t$0\n</invoke>',
    documentation: 'Invoke with ID and content',
    detail: 'Invoke Element with ID',
    insertTextRules: 4,
  },
  {
    label: 'finalize',
    kind: 15,
    insertText: '<finalize>\n\t$0\n</finalize>',
    documentation: 'Finalization code for invoke',
    detail: 'Finalize Element',
    insertTextRules: 4,
  },
  {
    label: 'param',
    kind: 15,
    insertText: '<param name="$1" expr="$2" />',
    documentation: 'Parameter for send or invoke',
    detail: 'Parameter Element',
    insertTextRules: 4,
  },
  {
    label: 'content',
    kind: 15,
    insertText: '<content expr="$1" />',
    documentation: 'Content for send or invoke',
    detail: 'Content Element',
    insertTextRules: 4,
  },
  {
    label: 'donedata',
    kind: 15,
    insertText: '<donedata>\n\t$0\n</donedata>',
    documentation: 'Data sent with done event from final state',
    detail: 'DoneData Element',
    insertTextRules: 4,
  },
];

// SCXML attribute suggestions (now includes visual namespace)
export const scxmlAttributes: Record<string, string[]> = {
  scxml: ['xmlns', 'xmlns:visual', 'version', 'initial', 'name', 'datamodel', 'binding'],
  state: ['id', 'initial'],
  parallel: ['id'],
  final: ['id'],
  initial: [],
  history: ['id', 'type'],
  transition: ['event', 'cond', 'target', 'type'],
  onentry: [],
  onexit: [],
  datamodel: [],
  data: ['id', 'src', 'expr'],
  assign: ['location', 'expr'],
  raise: ['event'],
  send: ['event', 'target', 'type', 'id', 'delay', 'namelist'],
  cancel: ['sendid'],
  if: ['cond'],
  elseif: ['cond'],
  else: [],
  foreach: ['array', 'item', 'index'],
  log: ['label', 'expr'],
  script: ['src'],
  invoke: ['type', 'src', 'id', 'autoforward'],
  finalize: [],
  param: ['name', 'expr', 'location'],
  content: ['expr'],
  donedata: [],
};

// Hover information for SCXML elements
export const scxmlHoverInfo: Record<
  string,
  { description: string; syntax?: string; example?: string }
> = {
  scxml: {
    description:
      'The root element of an SCXML document. Must contain the SCXML namespace. Can include visual metadata namespace for layout information.',
    syntax:
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" initial="initialState">',
    example:
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" initial="idle">\n  <state id="idle" viz:xywh="100 50 120 60">\n    <transition event="start" target="active" />\n  </state>\n  <state id="active" viz:xywh="300 50 120 60" />\n</scxml>',
  },
  state: {
    description:
      'Represents a state in the state machine. Can be atomic or compound (containing child states).',
    syntax: '<state id="stateId" initial="childState">',
    example:
      '<state id="idle">\n  <onentry>\n    <log label="Entered idle state" />\n  </onentry>\n  <transition event="start" target="active" />\n</state>',
  },
  transition: {
    description:
      'Defines a transition between states, triggered by events and/or conditions.',
    syntax:
      '<transition event="eventName" cond="condition" target="targetState" type="external|internal">',
    example:
      '<transition event="button.press" cond="count > 0" target="processing" />',
  },
  parallel: {
    description:
      'A parallel state where all child states are active simultaneously.',
    syntax: '<parallel id="parallelId">',
    example:
      '<parallel id="multitask">\n  <state id="task1" />\n  <state id="task2" />\n</parallel>',
  },
  final: {
    description:
      'A final state indicating successful completion of the state machine or composite state.',
    syntax: '<final id="finalId">',
    example:
      '<final id="done">\n  <donedata>\n    <param name="result" expr="finalValue" />\n  </donedata>\n</final>',
  },
  onentry: {
    description:
      'Contains executable content that is executed when the state is entered.',
    example:
      '<onentry>\n  <log label="Entering state" />\n  <assign location="counter" expr="0" />\n</onentry>',
  },
  onexit: {
    description:
      'Contains executable content that is executed when the state is exited.',
    example:
      '<onexit>\n  <log label="Exiting state" />\n  <send event="cleanup" />\n</onexit>',
  },
  datamodel: {
    description: 'Contains data declarations for the state machine.',
    example:
      '<datamodel>\n  <data id="counter" expr="0" />\n  <data id="user" src="user.json" />\n</datamodel>',
  },
  assign: {
    description: 'Assigns a value to a data location.',
    syntax: '<assign location="dataId" expr="value" />',
    example: '<assign location="counter" expr="counter + 1" />',
  },
  send: {
    description: 'Sends an event, either internally or to an external target.',
    syntax: '<send event="eventName" target="targetId" delay="1s" />',
    example: '<send event="timer.expired" delay="5s" />',
  },
  raise: {
    description:
      'Raises an internal event to be processed in the current event loop.',
    syntax: '<raise event="eventName" />',
    example: '<raise event="internal.update" />',
  },
};

// Helper function to check if cursor is inside an XML element (for attribute suggestions)
function isInsideElement(text: string): boolean {
  const lastOpenBracket = text.lastIndexOf('<');
  const lastCloseBracket = text.lastIndexOf('>');
  return lastOpenBracket > lastCloseBracket;
}

// Helper function to get the current element name
function getCurrentElement(text: string): string | null {
  const lastOpenBracket = text.lastIndexOf('<');
  if (lastOpenBracket === -1) return null;

  const elementText = text.substring(lastOpenBracket + 1);
  const spaceIndex = elementText.indexOf(' ');
  const elementName =
    spaceIndex > -1 ? elementText.substring(0, spaceIndex) : elementText;

  return elementName.replace(/[^a-zA-Z0-9-]/g, '');
}

// Helper function to provide attribute suggestions
function getAttributeSuggestions(
  beforeCursor: string,
  monaco: typeof import('monaco-editor'),
  range: monaco.IRange
): monaco.languages.CompletionItem[] {
  const elementName = getCurrentElement(beforeCursor);
  if (!elementName || !scxmlAttributes[elementName]) {
    return [];
  }

  const attributes = scxmlAttributes[elementName];
  return attributes.map((attr) => ({
    label: attr,
    kind: monaco.languages.CompletionItemKind.Property,
    insertText: `${attr}="\${1}"`,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: `Attribute for ${elementName} element`,
    range,
  }));
}

export function setupSCXMLLanguageSupport(
  monaco: typeof import('monaco-editor')
) {
  // Legacy completion provider disabled to prevent duplicates
  // The enhanced completion provider in enhanced-scxml-completion.ts
  // provides more comprehensive suggestions with better context awareness

  // monaco.languages.registerCompletionItemProvider('xml', {
  //   triggerCharacters: ['<', ' ', '"', "'", '='],
  //   provideCompletionItems: (model, position) => {
  //     // Legacy implementation disabled - see enhanced-scxml-completion.ts
  //     return { suggestions: [] };
  //   },
  // });

  // Register hover provider
  monaco.languages.registerHoverProvider('xml', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const hoverInfo = scxmlHoverInfo[word.word];
      if (!hoverInfo) return null;

      const contents = [`**${word.word}** - ${hoverInfo.description}`];

      if (hoverInfo.syntax) {
        contents.push(`**Syntax:** \`${hoverInfo.syntax}\``);
      }

      if (hoverInfo.example) {
        contents.push(`**Example:**\n\`\`\`xml\n${hoverInfo.example}\n\`\`\``);
      }

      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents: contents.map((content) => ({ value: content })),
      };
    },
  });

  // Configure XML language for better SCXML support
  monaco.languages.setLanguageConfiguration('xml', {
    brackets: [
      ['<', '>'],
      ['"', '"'],
      ["'", "'"],
    ],
    autoClosingPairs: [
      { open: '<', close: '>', notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '<!--', close: '-->', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    folding: {
      markers: {
        start: new RegExp('^\\s*<([^/>\\s]+)[^>]*>'),
        end: new RegExp('^\\s*</([^>]+)>'),
      },
    },
  });
}
