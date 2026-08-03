'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import Editor from '@monaco-editor/react';
import type { ValidationError } from '@/types/common';
import { ensureMonacoConfigured } from '@/lib/monaco/monaco-setup';
import { isWholeDocumentPasteRange } from '@/lib/utils/paste-detection';
import {
  mergeDuplicateTransitionsInDocument,
  mergeDuplicateTransitionsByEventInDocument,
} from '@/lib/utils/transition-merge-utils';

// Module-level guard: Monaco's language registry is a page-level singleton.
// Registering the completion provider more than once causes duplicate suggestions.
let scxmlCompletionRegistered = false;

interface XMLEditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: ValidationError[];
  readOnly?: boolean;
  height?: string | number;
  theme?: 'light' | 'dark';
  onNavigateToLine?: (line: number, column?: number) => void;
  onMount?: () => void;
}

export interface XMLEditorRef {
  navigateToLine: (line: number, column?: number) => void;
  focus: () => void;
}

export const XMLEditor = forwardRef<XMLEditorRef, XMLEditorProps>(
  (
    {
      value,
      onChange,
      errors = [],
      readOnly = false,
      height = '500px',
      theme = 'dark',
      onMount,
    },
    ref
  ) => {
    const editorRef = useRef<
      import('monaco-editor').editor.IStandaloneCodeEditor | null
    >(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [monacoReady, setMonacoReady] = useState(false);

    useEffect(() => {
      ensureMonacoConfigured().then(() => setMonacoReady(true));
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        navigateToLine: (line: number, column?: number) => {
          if (editorRef.current) {
            editorRef.current.revealLine(line);
            editorRef.current.setPosition({
              lineNumber: line,
              column: column || 1,
            });
            editorRef.current.focus();
          }
        },
        focus: () => {
          if (editorRef.current) {
            editorRef.current.focus();
          }
        },
      }),
      []
    );

    useEffect(() => {
      if (!editorRef.current || typeof window === 'undefined') return;

      import('monaco-editor').then((monaco) => {
        const model = editorRef.current?.getModel();
        if (!model) return;

        const markers = errors.map((error) => ({
          severity:
            error.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
          message: error.message,
          startLineNumber: error.line || 1,
          startColumn: error.column || 1,
          endLineNumber: error.line || 1,
          endColumn: error.column ? error.column + 10 : 10,
          code: error.code || undefined,
        }));

        monaco.editor.setModelMarkers(model, 'scxml-parser', markers);
      });
    }, [errors]);

    // Cleanup effect for disposables
    useEffect(() => {
      return () => {
        if (editorRef.current) {
          const disposables = (editorRef.current as any)._scxmlDisposables;
          if (disposables && Array.isArray(disposables)) {
            disposables.forEach((disposable: any) => {
              if (disposable && typeof disposable.dispose === 'function') {
                try {
                  disposable.dispose();
                } catch (error) {
                  console.warn('Error disposing SCXML service:', error);
                }
              }
            });
          }
        }
      };
    }, []);

    const handleEditorMount = (
      editor: import('monaco-editor').editor.IStandaloneCodeEditor
    ) => {
      editorRef.current = editor;

      // When a paste replaces the whole document (select-all + paste a new SCXML doc, or
      // pasting into an empty editor), apply the same duplicate-transition normalization
      // that file upload already gets, so pasting a whole file behaves identically to
      // loading it. Snippet pastes into existing content are left untouched.
      //
      // This intercepts the native 'paste' DOM event in the capture phase — BEFORE
      // Monaco's own paste handling — rather than reacting after the fact via
      // editor.onDidPaste. Reacting afterward would apply the normalization as a second,
      // separate edit on top of Monaco's own paste edit, which becomes its own entry in
      // Monaco's native undo stack (the stack that Ctrl+Z actually uses while the editor
      // has focus, ahead of this app's own history — see undo-redo-controls.tsx's
      // window-level keydown listener, which never even sees the keystroke in that case).
      // That would force the user to press Ctrl+Z twice to fully undo a normalized paste.
      // Preventing Monaco's default handling and applying the normalized text ourselves,
      // once, keeps it to a single undo step either way.
      const handleNativePaste = (event: ClipboardEvent) => {
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection) return;

        const lastLine = model.getLineCount();
        const isWholeDocument = isWholeDocumentPasteRange({
          rangeStartLineNumber: selection.startLineNumber,
          rangeStartColumn: selection.startColumn,
          rangeEndLineNumber: selection.endLineNumber,
          rangeEndColumn: selection.endColumn,
          modelLineCount: lastLine,
          modelLastLineMaxColumn: model.getLineMaxColumn(lastLine),
        });
        if (!isWholeDocument) return;

        const pastedText = event.clipboardData?.getData('text/plain');
        if (pastedText == null) return;

        event.preventDefault();
        event.stopPropagation();

        const normalized = mergeDuplicateTransitionsInDocument(
          mergeDuplicateTransitionsByEventInDocument(pastedText)
        );

        editor.executeEdits('scxml-paste-normalize', [
          { range: model.getFullModelRange(), text: normalized },
        ]);
        editor.pushUndoStop();
      };

      // Attached to our own wrapper div, not editor.getDomNode() — Monaco registers its
      // own capture-phase paste listener directly on its own container during setup
      // (before this onMount callback runs), and same-node listeners fire in registration
      // order, so attaching here would lose that race and never run. The wrapper div is a
      // genuine ancestor Monaco never touches, so parent-before-child capture ordering
      // guarantees this listener runs first regardless of registration order.
      const container = containerRef.current;
      container?.addEventListener('paste', handleNativePaste, true);
      editor.onDidDispose(() => {
        container?.removeEventListener('paste', handleNativePaste, true);
      });
      if (typeof window !== 'undefined') {
        import('monaco-editor').then(async (monaco) => {
          try {
            // Ensure the model is set to XML language
            const model = editor.getModel();
            if (model) {
              monaco.editor.setModelLanguage(model, 'xml');
            }

            // Set editor options optimized for SCXML editing
            editor.updateOptions({
              minimap: { enabled: false },
              scrollBeyondLastLine: false,

              wordWrap: 'on',
              automaticLayout: true,
              formatOnPaste: true,
              formatOnType: true,
              suggestOnTriggerCharacters: true,
              quickSuggestions: false, // Disable automatic suggestions
              quickSuggestionsDelay: 10,
              parameterHints: { enabled: true },
              hover: { enabled: true, delay: 300 },
              folding: true,
              foldingStrategy: 'indentation',
              inlineSuggest: { enabled: false }, // Disable inline suggestions
              suggest: {
                preview: true,
                showInlineDetails: true,
                showStatusBar: true,
                filterGraceful: true,
                snippetsPreventQuickSuggestions: false,
                localityBonus: true,
              },
              acceptSuggestionOnCommitCharacter: true,
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
              wordBasedSuggestions: 'off', // Rely on our custom provider
              bracketPairColorization: { enabled: true },
              // Disable auto-closing to rely on completion provider templates
              autoClosingBrackets: 'never',
              autoClosingQuotes: 'beforeWhitespace',
              autoSurround: 'never',
            });

            // Add helpful keyboard shortcuts
            editor.addAction({
              id: 'trigger-scxml-completion',
              label: 'Trigger SCXML Completion',
              keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space],
              run: () => {
                editor.trigger('', 'editor.action.triggerSuggest', {});
              },
            });
          } catch (error) {
            console.error('❌ Error setting up SCXML editor:', error);
          }
          onMount?.();
        });
      }
    };

    const handleEditorChange = (value: string | undefined) => {
      onChange(value || '');
    };

    const handleBeforeMount = async (
      monaco: typeof import('monaco-editor')
    ) => {
      try {
        // Setup SCXML language support with visual namespace features
        const { setupSCXMLLanguageSupport } = await import(
          '@/lib/monaco/scxml-language'
        );
        setupSCXMLLanguageSupport(monaco);

        // Register enhanced completion provider once per page load.
        // beforeMount is async so onMount fires before registration completes,
        // making the dispose-on-unmount approach unreliable. A module-level
        // flag ensures we register exactly once even across tab switches.
        if (!scxmlCompletionRegistered) {
          const { createEnhancedSCXMLCompletionProvider } = await import(
            '@/lib/monaco/enhanced-scxml-completion'
          );
          monaco.languages.registerCompletionItemProvider(
            'xml',
            createEnhancedSCXMLCompletionProvider(monaco)
          );
          scxmlCompletionRegistered = true;
        }
      } catch (error) {
        console.error('❌ Error in beforeMount:', error);
      }
    };

    if (!monacoReady) {
      return (
        <div
          className='border rounded-lg h-full'
        />
      );
    }

    return (
      <div ref={containerRef} className='border rounded-lg overflow-hidden h-full'>
        <Editor
          height={height}
          language='xml'
          theme={theme === 'dark' ? 'vs-dark' : 'vs-dark'}
          value={value}
          onChange={handleEditorChange}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          options={{
            readOnly,
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            formatOnPaste: true,
            formatOnType: true,
            tabSize: 2,
            insertSpaces: true,
            // Completion options - simplified to avoid conflicts
            suggestOnTriggerCharacters: true,
            quickSuggestions: false, // Disable automatic suggestions
            parameterHints: { enabled: true },
            suggest: {
              showKeywords: true,
              showSnippets: true,
              filterGraceful: true,
              snippetsPreventQuickSuggestions: false,
            },
            fixedOverflowWidgets: true,
          }}
        />
      </div>
    );
  }
);

XMLEditor.displayName = 'XMLEditor';
