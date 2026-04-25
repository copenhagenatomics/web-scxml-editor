'use client';

import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import Editor from '@monaco-editor/react';
import type { ValidationError } from '@/types/common';

interface XMLEditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: ValidationError[];
  readOnly?: boolean;
  height?: string | number;
  theme?: 'light' | 'dark';
  onNavigateToLine?: (line: number, column?: number) => void;
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
    },
    ref
  ) => {
    const editorRef = useRef<
      import('monaco-editor').editor.IStandaloneCodeEditor | null
    >(null);

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
      if (
        editorRef.current &&
        errors.length > 0 &&
        typeof window !== 'undefined'
      ) {
        import('monaco-editor').then((monaco) => {
          const model = editorRef.current?.getModel();
          if (model) {
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
          }
        });
      }
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
      const lineNumber = 6; // change this to your target line

      // Move cursor
      editor.setPosition({ lineNumber, column: 1 });
      if (typeof window !== 'undefined') {
        import('monaco-editor').then(async (monaco) => {
          try {
            // Enhanced completion provider already registered in beforeMount
            // No need to register again to avoid duplicates

            // Store reference to beforeMount disposable for cleanup
            const beforeMountDisposable = (window as any)
              .__scxmlBeforeMountDisposable;
            const disposables = beforeMountDisposable
              ? [beforeMountDisposable]
              : [];

            // Store disposables on editor for cleanup
            (editor as any)._scxmlDisposables = disposables;

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

        // Register enhanced completion provider once in beforeMount
        const { createEnhancedSCXMLCompletionProvider } = await import(
          '@/lib/monaco/enhanced-scxml-completion'
        );

        const beforeMountProvider =
          createEnhancedSCXMLCompletionProvider(monaco);

        // Register only for XML language to avoid duplicates
        const beforeXmlDisposable =
          monaco.languages.registerCompletionItemProvider(
            'xml',
            beforeMountProvider
          );

        // Store for cleanup
        (window as any).__scxmlBeforeMountDisposable = beforeXmlDisposable;
      } catch (error) {
        console.error('❌ Error in beforeMount:', error);
      }
    };

    return (
      <div className='border rounded-lg overflow-hidden'>
        <Editor
          height={height}
          language='xml'
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
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
