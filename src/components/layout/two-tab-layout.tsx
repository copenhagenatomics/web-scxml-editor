"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Code2, Workflow, ChevronRight, Home, Layers } from "lucide-react";
import { InlineTipsCarousel } from "./inline-tips-carousel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useHostAPIStore } from "@/stores/host-api-store";
import { useEditorStore } from "@/stores/editor-store";
import { Panel, Badge } from "@/components/ui/primitives";
import { formatInitialTooltip, HIERARCHY_ROOT_KEY } from "@/lib/utils/hierarchy-initial-info";
import { ValidationPanel } from "@/components/ui";
import { usePanelStore } from "@/stores/panel-store";
import type { ValidationError } from "@/types/common";

interface TwoTabLayoutProps {
  codeEditor: React.ReactNode;
  visualDiagram: React.ReactNode;
  fileInfo?: {
    name?: string;
    isDirty?: boolean;
  };
  actions?:
    | React.ReactNode
    | ((
        activeTab: TabType,
        setActiveTab: (tab: TabType) => void,
      ) => React.ReactNode);
  validationPanelTab: 'validation' | 'host-alerts';
  onValidationTabChange: (tab: 'validation' | 'host-alerts') => void;
  onValidationClose: () => void;
  onNavigateToLine: (line: number, column: number) => void;
}

export type TabType = "code" | "visual";

export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  actions,
  validationPanelTab,
  onValidationTabChange,
  onValidationClose,
  onNavigateToLine,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    () => useHostAPIStore.getState().requestedTab ?? "code"
  );
  const {
    commands, feedbackQueue, executeCommand, dismissFeedback, requestedTab, setRequestedTab,
    hostErrors, dismissHostError, clearHostErrors,
  } = useHostAPIStore();
  const { hierarchyState, navigateToRoot, navigateUp, initialChildByParent, errors, setFocusTarget } = useEditorStore();
  const { activePanel } = usePanelStore();
  const currentPath = hierarchyState.currentPath;
  const visiblePath = currentPath.slice(-2);
  const hasHiddenSegments = currentPath.length > 2;

  const [isHierarchyPanelOpen, setIsHierarchyPanelOpen] = useState(false);
  const hierarchyPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHierarchyPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (hierarchyPanelRef.current && !hierarchyPanelRef.current.contains(e.target as Node)) {
        setIsHierarchyPanelOpen(false);
      }
    };
    // Capture phase: the ReactFlow canvas stops propagation of its own
    // mousedown handling, so a bubble-phase listener here never sees clicks
    // on the diagram — capture fires before that, regardless.
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isHierarchyPanelOpen]);

  useEffect(() => {
    if (requestedTab !== null) {
      setActiveTab(requestedTab);
      setRequestedTab(null);
    }
  }, [requestedTab, setRequestedTab]);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const handleVisualErrorClick = useCallback(
    (error: ValidationError) => {
      if (error.stateId) {
        setFocusTarget({ stateId: error.stateId, targetStateId: error.targetStateId });
        return;
      }
      if (error.line && error.column) {
        setActiveTab("code");
        onNavigateToLine(error.line, error.column);
      }
    },
    [setFocusTarget, onNavigateToLine]
  );

  const editorTips = [
    {
      tab: "code" as const,
      content: (
        <>
          Press{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Ctrl+Space
          </kbd>{" "}
          for autocomplete suggestions
        </>
      ),
    },
    {
      tab: "both" as const,
      content: (
        <>
          Use{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Ctrl+Z
          </kbd>{" "}
          to undo and{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Ctrl+Y
          </kbd>{" "}
          to redo changes
        </>
      ),
    },
    {
      tab: "both" as const,
      content: (
        <>
        You can create a new channel by using {" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            this_
          </kbd>{" "}prefix
        </>
      ),
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Select an edge, then{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Shift+Click
          </kbd>{" "}
          to add waypoints
        </>
      ),
    },
    {
      tab: "visual" as const,
      content: "Click the plus icon on a simple state to add a child state.",
    },
    {
      tab: "visual" as const,
      content:
        "Click the down arrow on a compound state to navigate inside it.",
    },
    {
      tab: "visual" as const,
      content: "Click the network icon for auto-layout options",
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Press{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Delete
          </kbd>{" "}
          (Windows) or{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            fn+Delete
          </kbd>{" "}
          (Mac) to remove selected states or transitions
        </>
      ),
    },
  ];

  return (
    <div className='h-full flex flex-col relative'>
      {feedbackQueue.map((item) => (
        <div
          key={item.id}
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start space-x-3 px-4 py-3 rounded-lg shadow-lg text-sm max-w-lg w-full ${
            item.level === "info"
              ? "bg-success/10 border border-success/30 text-success"
              : item.level === "warning"
                ? "bg-warning/10 border border-warning/30 text-warning"
                : "bg-error/10 border border-error/30 text-error"
          }`}
        >
          <span className='flex-1 whitespace-pre-wrap'>{item.message}</span>
          <button
            onClick={() => dismissFeedback(item.id)}
            className='shrink-0 font-bold opacity-60 hover:opacity-100'
          >
            ✕
          </button>
        </div>
      ))}

      {/* Combined toolbar */}
      <div className='flex items-center gap-1 px-3 py-2 border-b border-default bg-elevated'>
        {/* Tab switcher icon buttons */}
        <button
          onClick={() => handleTabChange("visual")}
          title="Visual Diagram"
          className={`p-2 rounded-md transition-colors ${
            activeTab === "visual"
              ? "bg-primary-muted text-primary"
              : "text-muted hover:bg-muted hover:text-default"
          }`}
        >
          <Workflow className='h-4 w-4' />
        </button>
        <button
          onClick={() => handleTabChange("code")}
          title="Code Editor"
          className={`p-2 rounded-md transition-colors ${
            activeTab === "code"
              ? "bg-primary-muted text-primary"
              : "text-muted hover:bg-muted hover:text-default"
          }`}
        >
          <Code2 className='h-4 w-4' />
        </button>

        {/* Host-registered commands */}
        {commands.length > 0 && (
          <>
            <div className='h-6 w-px bg-[var(--ui-border)] mx-1' />
            {commands.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd.id)}
                disabled={cmd.isExecuting}
                title={cmd.tooltip}
                className='cursor-pointer flex items-center space-x-2 text-sm px-3 py-1.5 rounded-md border border-primary text-primary bg-elevated hover:bg-primary-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {cmd.isExecuting && (
                  <span className='h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block' />
                )}
                <span>{cmd.label}</span>
              </button>
            ))}
          </>
        )}

        {/* Breadcrumb — visible when navigated into a nested state */}
        {currentPath.length > 0 && (
          <>
            <div className='h-4 w-px bg-[var(--ui-border)] mx-1' />
            <div className='flex items-center gap-0.5 text-sm'>
              <button
                onClick={navigateToRoot}
                className='p-0.5 text-dimmed hover:text-default transition-colors'
                title='Navigate to root'
              >
                <Home className='h-3.5 w-3.5' />
              </button>
              {hasHiddenSegments && (
                <>
                  <ChevronRight className='h-3.5 w-3.5 text-dimmed' />
                  <span className='text-dimmed px-0.5'>…</span>
                </>
              )}
              {visiblePath.map((segment, i) => {
                const isLast = i === visiblePath.length - 1;
                const stepsUp = visiblePath.length - 1 - i;
                return (
                  <React.Fragment key={i}>
                    <ChevronRight className='h-3.5 w-3.5 text-dimmed' />
                    {isLast ? (
                      <span className='text-default font-medium'>{segment}</span>
                    ) : (
                      <button
                        onClick={() => { for (let j = 0; j < stepsUp; j++) navigateUp(); }}
                        className='px-1 text-muted hover:text-default transition-colors'
                        title={`Navigate to ${segment}`}
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className='relative' ref={hierarchyPanelRef}>
              <button
                onClick={() => setIsHierarchyPanelOpen((v) => !v)}
                className='flex items-center gap-1 p-0.5 text-dimmed hover:text-default transition-colors'
                title='Show full state path'
              >
                <Layers className='h-3.5 w-3.5' />
                <Badge>{currentPath.length + 1}</Badge>
              </button>
              {isHierarchyPanelOpen && (
                <div className='absolute left-0 top-full mt-1 z-50'>
                  <Panel
                    title='State Path'
                    onClose={() => setIsHierarchyPanelOpen(false)}
                    widthClass='w-64'
                    className='max-h-[60vh]'
                  >
                    <ul className='py-1'>
                      <li>
                        <button
                          onClick={() => { navigateToRoot(); setIsHierarchyPanelOpen(false); }}
                          className='w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-default hover:bg-muted transition-colors'
                          title={formatInitialTooltip(initialChildByParent.get(HIERARCHY_ROOT_KEY))}
                        >
                          <Home className='h-3.5 w-3.5' />
                          Home
                        </button>
                      </li>
                      {currentPath.map((segment, i) => {
                        const isLast = i === currentPath.length - 1;
                        const stepsUp = currentPath.length - 1 - i;
                        const tooltip = formatInitialTooltip(initialChildByParent.get(segment));
                        return (
                          <li key={i}>
                            {isLast ? (
                              <span
                                className='block px-3 py-1.5 pl-7 text-sm font-medium text-default'
                                title={tooltip}
                              >
                                {segment}
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  for (let j = 0; j < stepsUp; j++) navigateUp();
                                  setIsHierarchyPanelOpen(false);
                                }}
                                className='w-full text-left px-3 py-1.5 pl-7 text-sm text-muted hover:text-default hover:bg-muted transition-colors'
                                title={tooltip}
                              >
                                {segment}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                </div>
              )}
            </div>
          </>
        )}

        <div className='flex-1' />

        <InlineTipsCarousel
          tips={editorTips}
          activeTab={activeTab}
          autoAdvance={true}
          autoAdvanceInterval={10000}
        />

        <ThemeToggle />

        {/* Built-in actions (undo/redo + ⋮ menu from page.tsx) */}
        {actions &&
          (typeof actions === "function"
            ? actions(activeTab, setActiveTab)
            : actions)}
      </div>

      {/* Content Area */}
      <div className='flex-1 overflow-hidden'>
        {activeTab === "code" && (
          <div className='h-full p-4 bg-base'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-muted relative'>
            {visualDiagram}
            {activePanel === 'validation' && (
              <div className='absolute right-4 top-4 bottom-4 z-40'>
                <ValidationPanel
                  errors={errors}
                  hostErrors={hostErrors}
                  isVisible={true}
                  activeTab={validationPanelTab}
                  onClose={onValidationClose}
                  onTabChange={onValidationTabChange}
                  onErrorClick={handleVisualErrorClick}
                  supportsStateHighlight={true}
                  onDismissHostError={dismissHostError}
                  onClearHostErrors={clearHostErrors}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
