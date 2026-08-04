'use client';

import { type XMLEditorRef } from '@/components/editor';
import { TwoTabLayout, type TabType } from '@/components/layout';
import { ErrorBoundary, UndoRedoControls } from '@/components/ui';
import { StatusDot } from '@/components/ui/primitives';
import { HistoryManager } from '@/lib/history/history-manager';
import { hasVisualMetadata } from '@/lib/utils';
import { useEditorStore } from '@/stores/editor-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { usePanelStore } from '@/stores/panel-store';
import type { ValidationError } from '@/types/common';
import { Download, Eye, Github, MoreVertical, Upload as UploadIcon } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { CodeEditorPane } from './_components/code-editor-pane';
import { VisualEditorPane } from './_components/visual-editor-pane';
import { WelcomeScreen } from './_components/welcome-screen';
import { useContentValidation } from './_hooks/use-content-validation';
import { useDownload } from './_hooks/use-download';
import { useFileOperations } from './_hooks/use-file-operations';
import { useHistoryRestore } from './_hooks/use-history-restore';
import { useHostAPIBridge } from './_hooks/use-host-api-bridge';
import { useInitialLoad } from './_hooks/use-initial-load';
import { useMoreMenu } from './_hooks/use-more-menu';

export default function Home() {
  // --- Store subscriptions ---
  const { content, errors, fileInfo, isDirty, setContent } = useEditorStore();
  const { activePanel, setActivePanel } = usePanelStore();
  const hostErrors = useHostAPIStore(state => state.hostErrors);
  const requestedValidationTab = useHostAPIStore(state => state.requestedValidationTab);
  const { setRequestedValidationTab } = useHostAPIStore();

  // --- Stable instances ---
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);

  // --- Custom hooks ---
  const { isInitialLoading } = useInitialLoad();
  const { isUpdatingFromHistory, currentHistoryActionType, handleHistoryRestore } = useHistoryRestore();
  const { fileInputRef, handleFileLoad, handleFileError, handleCreateNewDocument, handleNewFileUpload, handleFileInputChange } = useFileOperations();
  const { handleDownloadClean, handleDownloadWithVisualData } = useDownload();
  const { isMoreMenuOpen, setIsMoreMenuOpen, moreMenuRef } = useMoreMenu();
  const { handleEntriesChange } = useHostAPIBridge();
  useContentValidation();

  // --- Local state ---
  const [validationPanelTab, setValidationPanelTab] = React.useState<'validation' | 'host-alerts'>('validation');

  // --- Refs ---
  const editorRef = useRef<XMLEditorRef>(null);
  const pendingNavigateRef = useRef<{ line: number; column: number } | null>(null);

  // --- Derived ---
  const totalErrors = useMemo(
    () => errors.filter(e => e.severity === 'error').length + hostErrors.filter(e => e.level === 'error').length,
    [errors, hostErrors]
  );
  const totalWarnings = useMemo(
    () => errors.filter(e => e.severity === 'warning').length + hostErrors.filter(e => e.level === 'warning').length,
    [errors, hostErrors]
  );
  const hasErrors = totalErrors > 0;
  const hasWarnings = totalWarnings > 0;

  // --- Handlers ---
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      if (!isUpdatingFromHistory) historyManager.trackTextEdit(newContent);
    },
    [setContent, historyManager, isUpdatingFromHistory]
  );

  const handleSCXMLChangeFromDiagram = useCallback(
    (newContent: string, changeType?: 'position' | 'structure' | 'property' | 'resize') => {
      setContent(newContent);
      if (!isUpdatingFromHistory) historyManager.trackDiagramChange(newContent, undefined, changeType);
    },
    [setContent, historyManager, isUpdatingFromHistory]
  );

  const handleErrorClick = useCallback((error: ValidationError) => {
    if (error.line && error.column && editorRef.current) {
      editorRef.current.navigateToLine(error.line, error.column);
    }
  }, []);

  const handleEditorMount = useCallback(() => {
    const pending = pendingNavigateRef.current;
    if (pending) {
      pendingNavigateRef.current = null;
      editorRef.current?.navigateToLine(pending.line, pending.column);
    }
  }, []);

  const handleValidationClose = useCallback(() => {
    setActivePanel(null);
    setValidationPanelTab('validation');
  }, [setActivePanel]);

  // --- Effects ---
  // Open requested validation tab driven by host API
  useEffect(() => {
    if (requestedValidationTab !== null) {
      setValidationPanelTab(requestedValidationTab);
      setActivePanel('validation');
      setRequestedValidationTab(null);
    }
  }, [requestedValidationTab, setRequestedValidationTab, setActivePanel]);

  // --- Render ---
  const renderActions = useCallback(
    (activeTab: TabType, setActiveTab: (tab: TabType) => void) => (
      <>
        <input
          ref={fileInputRef}
          type='file'
          accept='.scxml,.xml'
          onChange={handleFileInputChange}
          className='hidden'
        />

        <UndoRedoControls onUndo={handleHistoryRestore} onRedo={handleHistoryRestore} />

        <button
          onClick={() => {
            const opening = activePanel !== 'validation';
            setActivePanel(opening ? 'validation' : null);
            if (!opening) setValidationPanelTab('validation');
          }}
          title={
            totalErrors === 0 && totalWarnings === 0
              ? 'No issues'
              : `${totalErrors} error${totalErrors !== 1 ? 's' : ''}, ${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}`
          }
          className='p-2 rounded-md hover:bg-muted transition-colors'
        >
          <StatusDot status={hasErrors ? 'error' : hasWarnings ? 'warning' : 'success'} />
        </button>

        <button
          onClick={() => setActivePanel(activePanel === 'github' ? null : 'github')}
          title='GitHub'
          className='p-2 rounded-md text-muted hover:bg-muted hover:text-default transition-colors'
        >
          <Github className='h-4 w-4' />
        </button>

        <div className='h-6 w-px bg-[var(--ui-border)]' />

        <div className='relative' ref={moreMenuRef}>
          <button
            onClick={() => setIsMoreMenuOpen(v => !v)}
            className='p-2 rounded-md text-muted hover:bg-muted hover:text-default transition-colors'
            title='More options'
          >
            <MoreVertical className='h-4 w-4' />
          </button>

          {isMoreMenuOpen && (
            <div className='absolute right-0 top-full mt-1 w-48 bg-elevated border border-default rounded-lg shadow-lg z-50 py-1'>
              <button
                onClick={() => { handleNewFileUpload(); setIsMoreMenuOpen(false); }}
                className='w-full flex items-center gap-3 px-4 py-2 text-sm text-default hover:bg-muted transition-colors'
              >
                <UploadIcon className='h-4 w-4 text-muted' />
                Upload
              </button>
              <button
                onClick={() => { handleDownloadClean(); setIsMoreMenuOpen(false); }}
                className='w-full flex items-center gap-3 px-4 py-2 text-sm text-default hover:bg-muted transition-colors'
              >
                <Download className='h-4 w-4 text-muted' />
                Clean SCXML
              </button>
              {hasVisualMetadata(content) && (
                <button
                  onClick={() => { handleDownloadWithVisualData(); setIsMoreMenuOpen(false); }}
                  className='w-full flex items-center gap-3 px-4 py-2 text-sm text-default hover:bg-muted transition-colors'
                >
                  <Eye className='h-4 w-4 text-muted' />
                  With Visual Data
                </button>
              )}
            </div>
          )}
        </div>
      </>
    ),
    [
      fileInputRef, handleFileInputChange, handleHistoryRestore,
      activePanel, setActivePanel, totalErrors, totalWarnings, hasErrors, hasWarnings,
      moreMenuRef, isMoreMenuOpen, setIsMoreMenuOpen,
      handleNewFileUpload, handleDownloadClean, handleDownloadWithVisualData, content,
    ]
  );

  return (
    <ErrorBoundary>
      <div className='min-h-screen bg-base overflow-hidden'>
        {isInitialLoading ? (
          <div className='flex items-center justify-center h-screen bg-base'>
            <div className='h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin' />
          </div>
        ) : !content ? (
          <WelcomeScreen
            onFileLoad={handleFileLoad}
            onFileError={handleFileError}
            onCreateNew={handleCreateNewDocument}
          />
        ) : (
          <div className='h-screen relative'>
            <TwoTabLayout
              codeEditor={
                <CodeEditorPane
                  editorRef={editorRef}
                  onContentChange={handleContentChange}
                  onErrorClick={handleErrorClick}
                  validationPanelTab={validationPanelTab}
                  onValidationTabChange={setValidationPanelTab}
                  onValidationClose={handleValidationClose}
                  onEntriesChange={handleEntriesChange}
                  onEditorMount={handleEditorMount}
                />
              }
              visualDiagram={
                <VisualEditorPane
                  onSCXMLChange={handleSCXMLChangeFromDiagram}
                  isUpdatingFromHistory={isUpdatingFromHistory}
                  historyActionType={currentHistoryActionType}
                  onEntriesChange={handleEntriesChange}
                  onContentChange={handleContentChange}
                />
              }
              fileInfo={{ name: fileInfo?.name, isDirty }}
              actions={renderActions}
              validationPanelTab={validationPanelTab}
              onValidationTabChange={setValidationPanelTab}
              onValidationClose={handleValidationClose}
              onNavigateToLine={(line, column) => {
                pendingNavigateRef.current = { line, column };
              }}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
