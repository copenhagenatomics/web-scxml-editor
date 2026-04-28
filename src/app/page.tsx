'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { XMLEditor, type XMLEditorRef } from '@/components/editor';
import {
  FileUpload,
  VisualMetadataExport,
} from '@/components/file-operations';
import { TwoTabLayout, type TabType } from '@/components/layout';
import { VisualDiagram } from '@/components/diagram';
import { Upload, FileText } from 'lucide-react';
import { ErrorBoundary, ValidationPanel, UndoRedoControls } from '@/components/ui';
import { SCXMLParser, SCXMLValidator } from '@/lib';
import { hasVisualMetadata } from '@/lib/utils';
import { useEditorStore } from '@/stores/editor-store';
import { useHistoryStore } from '@/stores/history-store';
import { HistoryManager } from '@/lib/history/history-manager';
import type { FileInfo, ValidationError } from '@/types/common';
import type { ActionType } from '@/types/history';
import { DEFAULT_SCXML_TEMPLATE } from '@/lib/consts/default_scxml_template';

const systemIntegrationEnabled = process.env.NEXT_PUBLIC_IS_STANDALONE_APP === 'true';

export default function Home() {
  const {
    content,
    errors,
    fileInfo,
    isDirty,
    isValidationPanelVisible,
    setContent,
    setErrors,
    setFileInfo,
    setValidationPanelVisible,
    navigateToRoot,
  } = useEditorStore();

  const parser = useMemo(() => new SCXMLParser(), []);
  const validator = useMemo(() => new SCXMLValidator(), []);
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);
  const editorRef = useRef<XMLEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingFromHistory, setIsUpdatingFromHistory] = React.useState(false);
  const [currentHistoryActionType, setCurrentHistoryActionType] = React.useState<ActionType | undefined>(undefined);

  const validateContent = useCallback(
    (xmlContent: string) => {
      if (!xmlContent.trim()) {
        setErrors([]);
        return;
      }

      const parseResult = parser.parse(xmlContent);

      let allErrors = [...parseResult.errors];

      if (parseResult.success && parseResult.data) {
        const validationErrors = validator.validate(
          parseResult.data.scxml,
          xmlContent
        );
        allErrors = [...allErrors, ...validationErrors];
      }

      setErrors(allErrors);
    },
    [parser, validator, setErrors]
  );

  // Initialize history on mount if there's existing content
  useEffect(() => {
    if (content && !historyManager.canUndo() && !historyManager.canRedo()) {
      historyManager.initialize(content, 'Initial state');
    }
  }, []); // Run only once on mount

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      validateContent(content);
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [content, validateContent]);

  const handleFileLoad = useCallback(
    (loadedFileInfo: FileInfo) => {
      setFileInfo(loadedFileInfo);
      // Initialize history with the loaded file
      historyManager.initialize(loadedFileInfo.content, `Loaded ${loadedFileInfo.name}`);
      // Reset breadcrumb navigation to root
      navigateToRoot();
    },
    [setFileInfo, historyManager, navigateToRoot]
  );

  const handleFileError = useCallback(
    (errorMessages: string[]) => {
      const errors: ValidationError[] = errorMessages.map((message) => ({
        message,
        severity: 'error' as const,
      }));
      setErrors(errors);
      setValidationPanelVisible(true);
    },
    [setErrors, setValidationPanelVisible]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);

      // Track history for text edits (with debouncing)
      if (!isUpdatingFromHistory) {
        historyManager.trackTextEdit(newContent);
      }
    },
    [setContent, historyManager, isUpdatingFromHistory]
  );

  const handleSCXMLChangeFromDiagram = useCallback(
    (newContent: string, changeType?: 'position' | 'structure' | 'property' | 'resize') => {
      // Update content from visual diagram changes
      setContent(newContent);

      // Track history for diagram changes with appropriate handling
      if (!isUpdatingFromHistory) {
        historyManager.trackDiagramChange(newContent, undefined, changeType);
      }
    },
    [setContent, historyManager, isUpdatingFromHistory]
  );

  const handleErrorClick = useCallback((error: ValidationError) => {
    if (error.line && error.column && editorRef.current) {
      editorRef.current.navigateToLine(error.line, error.column);
    }
  }, []);

  const handleCreateNewDocument = useCallback(() => {
    const fileInfo: FileInfo = {
      name: 'new-document.scxml',
      size: DEFAULT_SCXML_TEMPLATE.length,
      lastModified: new Date(),
      content: DEFAULT_SCXML_TEMPLATE,
    };

    setContent(DEFAULT_SCXML_TEMPLATE);
    setFileInfo(fileInfo);
    setErrors([]);
    // Initialize history with new document
    historyManager.initialize(DEFAULT_SCXML_TEMPLATE, 'New document created');
    // Reset breadcrumb navigation to root
    navigateToRoot();
  }, [setContent, setFileInfo, setErrors, historyManager, navigateToRoot]);

  // Undo/Redo handlers
  const handleUndo = useCallback(
    (restoredContent: string, actionType: ActionType) => {
      setIsUpdatingFromHistory(true);
      setCurrentHistoryActionType(actionType);
      setContent(restoredContent);

      setTimeout(() => {
        setIsUpdatingFromHistory(false);
        setCurrentHistoryActionType(undefined);
      }, 100);
    },
    [setContent]
  );

  const handleRedo = useCallback(
    (restoredContent: string, actionType: ActionType) => {
      setIsUpdatingFromHistory(true);
      setCurrentHistoryActionType(actionType);
      setContent(restoredContent);

      setTimeout(() => {
        setIsUpdatingFromHistory(false);
        setCurrentHistoryActionType(undefined);
      }, 100);
    },
    [setContent]
  );

  const handleNewFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        // Basic file validation
        if (file.size > 10 * 1024 * 1024) {
          // 10MB limit
          const errors: ValidationError[] = [
            {
              message: 'File size too large. Maximum size is 10MB.',
              severity: 'error',
            },
          ];
          setErrors(errors);
          setValidationPanelVisible(true);
          return;
        }

        if (!file.name.match(/\.(scxml|xml)$/i)) {
          const errors: ValidationError[] = [
            {
              message: 'Invalid file type. Please select an SCXML or XML file.',
              severity: 'error',
            },
          ];
          setErrors(errors);
          setValidationPanelVisible(true);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            const fileInfo: FileInfo = {
              name: file.name,
              size: file.size,
              lastModified: new Date(file.lastModified),
              content,
            };
            setContent(content);
            setFileInfo(fileInfo);
            setErrors([]);
            // Initialize history with the uploaded file
            historyManager.initialize(content, `Uploaded ${file.name}`);
          }
        };

        reader.onerror = () => {
          const errors: ValidationError[] = [
            {
              message: 'Failed to read file. Please try again.',
              severity: 'error',
            },
          ];
          setErrors(errors);
          setValidationPanelVisible(true);
        };

        reader.readAsText(file);

        // Reset the input so the same file can be selected again
        event.target.value = '';
      }
    },
    [setContent, setFileInfo, setErrors, setValidationPanelVisible, historyManager]
  );

  const [isProgramLoading, setIsProgramLoading] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleLoadProgram = useCallback(async () => {
    setIsProgramLoading(true);
    try {
      const res = await fetch('/scxml-editor/program');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const scxml = await res.text();
      setContent(scxml);
      setFileInfo({ name: 'program.scxml', size: scxml.length, lastModified: new Date(), content: scxml });
      setErrors([]);
      historyManager.initialize(scxml, 'Loaded from system');
      navigateToRoot();
      setToast({ message: 'Program loaded successfully', type: 'success' });
    } catch (e) {
      setToast({ message: `Failed to load program: ${(e as Error).message}`, type: 'error' });
    } finally {
      setIsProgramLoading(false);
    }
  }, [setContent, setFileInfo, setErrors, setValidationPanelVisible, historyManager, navigateToRoot]);

  const handleApplyToSystem = useCallback(async () => {
    setIsApplying(true);
    setToast(null);
    try {
      const res = await fetch('/program/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { message: string; restarting: boolean };
      setToast({ message: data.message, type: 'success' });
    } catch (e) {
      setToast({ message: `Error: ${(e as Error).message}`, type: 'error' });
    } finally {
      setIsApplying(false);
    }
  }, [content]);

  const getDownloadFilename = () => {
    if (fileInfo?.name) {
      return fileInfo.name;
    }
    return 'document.scxml';
  };

  const hasErrors = errors.filter((e) => e.severity === 'error').length > 0;
  const hasWarnings = errors.filter((e) => e.severity === 'warning').length > 0;

  const renderCodeEditor = () => (
    <div className='flex gap-4 h-[calc(100vh-200px)]'>
      <div className='flex-1'>
        <XMLEditor
          ref={editorRef}
          value={content}
          onChange={handleContentChange}
          errors={errors}
          height='80vh'
        />
      </div>

      <div className='w-80'>
        <ValidationPanel
          errors={errors}
          isVisible={isValidationPanelVisible}
          onClose={() => setValidationPanelVisible(false)}
          onErrorClick={handleErrorClick}
        />
      </div>
    </div>
  );

  const renderVisualDiagram = () => (
    <div className='h-full'>
      <VisualDiagram
        scxmlContent={content}
        onNodeChange={(nodes) => {
          // console.log('Nodes changed:', nodes);
        }}
        onEdgeChange={(edges) => {
          // console.log('Edges changed:', edges);
        }}
        onSCXMLChange={handleSCXMLChangeFromDiagram}
        isUpdatingFromHistory={isUpdatingFromHistory}
        historyActionType={currentHistoryActionType}
      />
    </div>
  );

  const renderActions = (
    activeTab: TabType,
    setActiveTab: (tab: TabType) => void,
  ) => (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept='.scxml,.xml'
        onChange={handleFileInputChange}
        className='hidden'
      />

      {systemIntegrationEnabled ? (
        <div className='flex items-center space-x-2'>
          <FileText className='h-5 w-5 text-gray-500' />
          <h2 className='text-lg font-semibold text-gray-900'>
            {fileInfo?.name || "Untitled Document"}
          </h2>
          {isDirty && (
            <span className='text-xs text-amber-600 font-medium'>
              • Modified
            </span>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={handleLoadProgram}
            disabled={isProgramLoading}
            className='cursor-pointer flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <span>
              {isProgramLoading ? "Loading…" : "Load Current Program"}
            </span>
          </button>

          <button
            onClick={handleApplyToSystem}
            disabled={isApplying}
            className='cursor-pointer flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <span>{isApplying ? "Applying…" : "Apply to System"}</span>
          </button>
        </>
      )}

      <div className='flex-1' />

      <UndoRedoControls
        onUndo={handleUndo}
        onRedo={handleRedo}
        className='mr-2'
      />

      <div className='h-6 w-px bg-gray-300 mx-2' />

      <button
        onClick={handleNewFileUpload}
        className='cursor-pointer flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors'
      >
        <Upload className='h-4 w-4' />
        <span>Load New File</span>
      </button>

      <button
        onClick={() => {
          // If on visual tab, switch to code editor tab
          if (activeTab === "visual") {
            setActiveTab("code");
          }
          setValidationPanelVisible(!isValidationPanelVisible);
        }}
        className={`cursor-pointer text-sm px-3 py-2 rounded-md transition-colors ${
          hasErrors
            ? "bg-red-100 text-red-800 hover:bg-red-200"
            : hasWarnings
              ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
              : "bg-green-100 text-green-800 hover:bg-green-200"
        }`}
      >
        {errors.length === 0
          ? "Valid"
          : `${errors.filter((e) => e.severity === "error").length} errors, ${
              errors.filter((e) => e.severity === "warning").length
            } warnings`}
      </button>

      <VisualMetadataExport
        scxmlContent={content}
        filename={getDownloadFilename()}
        hasVisualMetadata={hasVisualMetadata(content)}
        onExportComplete={(exportType) => {}}
      />
    </>
  );

  return (
    <ErrorBoundary>
      <div className='min-h-screen bg-gray-50 overflow-hidden'>
        {!content ? (
          <div className='container mx-auto px-4 py-8'>
            <div className='mb-8'>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                Visual SCXML Editor
              </h1>
              <p className='text-gray-600'>
                Edit SCXML files with syntax highlighting, validation, and
                interactive visual diagrams
              </p>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
              <div className='bg-white rounded-lg shadow-sm p-6'>
                <FileUpload
                  onFileLoad={handleFileLoad}
                  onError={handleFileError}
                />
              </div>

              <div className='space-y-6'>
                <div className='bg-white rounded-lg shadow-sm p-6'>
                  <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                    Getting Started
                  </h3>
                  <div className='space-y-4 text-sm text-gray-600'>
                    <div className='flex items-start space-x-3'>
                      <div className='flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium'>
                        1
                      </div>
                      <p>
                        Upload an SCXML file or{' '}
                        <button
                          type='button'
                          onClick={handleCreateNewDocument}
                          className='inline text-blue-600 cursor-pointer hover:text-blue-800 underline transition-colors focus:outline-none'
                          aria-label='Create new SCXML document'
                        >
                          create a new one
                        </button>
                      </p>
                    </div>
                    <div className='flex items-start space-x-3'>
                      <div className='flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium'>
                        2
                      </div>
                      <p>
                        Edit with syntax highlighting and real-time validation
                      </p>
                    </div>
                    <div className='flex items-start space-x-3'>
                      <div className='flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium'>
                        3
                      </div>
                      <p>Switch to visual diagram for interactive editing</p>
                    </div>
                    <div className='flex items-start space-x-3'>
                      <div className='flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium'>
                        4
                      </div>
                      <p>Download your validated SCXML file</p>
                    </div>
                  </div>
                </div>

                <div className='bg-white rounded-lg shadow-sm p-6'>
                  <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                    Features
                  </h3>
                  <ul className='space-y-2 text-sm text-gray-600'>
                    <li className='flex items-center space-x-2'>
                      <div className='w-1.5 h-1.5 bg-green-500 rounded-full'></div>
                      <span>Two-way synchronization (Code ↔ Visual)</span>
                    </li>
                    <li className='flex items-center space-x-2'>
                      <div className='w-1.5 h-1.5 bg-green-500 rounded-full'></div>
                      <span>Interactive state diagram editing</span>
                    </li>
                    <li className='flex items-center space-x-2'>
                      <div className='w-1.5 h-1.5 bg-green-500 rounded-full'></div>
                      <span>SCXML-specific autocomplete</span>
                    </li>
                    <li className='flex items-center space-x-2'>
                      <div className='w-1.5 h-1.5 bg-green-500 rounded-full'></div>
                      <span>Real-time validation</span>
                    </li>
                    <li className='flex items-center space-x-2'>
                      <div className='w-1.5 h-1.5 bg-green-500 rounded-full'></div>
                      <span>Visual metadata preservation</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className='h-screen relative'>
            {toast && (
              <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start space-x-3 px-4 py-3 rounded-lg shadow-lg text-sm max-w-lg w-full ${
                toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                <span className='flex-1 whitespace-pre-wrap'>{toast.message}</span>
                <button onClick={() => setToast(null)} className='shrink-0 font-bold opacity-60 hover:opacity-100'>✕</button>
              </div>
            )}
            <TwoTabLayout
              codeEditor={renderCodeEditor()}
              visualDiagram={renderVisualDiagram()}
              fileInfo={{
                name: fileInfo?.name,
                isDirty,
              }}
              actions={renderActions}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
