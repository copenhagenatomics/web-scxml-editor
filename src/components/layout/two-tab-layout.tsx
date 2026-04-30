"use client";

import React, { useState, useCallback } from "react";
import { Code, FileText, Workflow } from "lucide-react";
import { InlineTipsCarousel } from "./inline-tips-carousel";
import { useHostAPIStore } from "@/stores/host-api-store";

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
}

export type TabType = "code" | "visual";

export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  actions,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("code");
  const { commands, feedbackQueue, executeCommand, dismissFeedback } =
    useHostAPIStore();

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  // Tips for the carousel
  const editorTips = [
    {
      tab: "code" as const,
      content: (
        <>
          Press{" "}
          <kbd className='px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono'>
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
          <kbd className='px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono'>
            Ctrl+Z
          </kbd>{" "}
          to undo and{" "}
          <kbd className='px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono'>
            Ctrl+Y
          </kbd>{" "}
          to redo changes
        </>
      ),
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Select an edge, then{" "}
          <kbd className='px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono'>
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
          <kbd className='px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono'>
            Delete
          </kbd>{" "}
          (Windows) or{" "}
          <kbd className='px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono'>
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
              ? "bg-green-50 border border-green-200 text-green-800"
              : item.level === "warning"
                ? "bg-yellow-50 border border-yellow-200 text-yellow-800"
                : "bg-red-50 border border-red-200 text-red-800"
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

      {/* Actions toolbar */}
      <div className='flex items-center justify-between px-4 py-2 border-b bg-white'>
        <div className='flex flex-1 space-between space-x-3'>
          {/* Host-registered commands */}
          {commands.length > 0 ? (
            <div className='flex gap-2 justify-center items-center'>
              {commands.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => executeCommand(cmd.id)}
                  disabled={cmd.isExecuting}
                  title={cmd.tooltip}
                  className='cursor-pointer flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {cmd.isExecuting && (
                    <span className='h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block' />
                  )}
                  <span>{cmd.label}</span>
                </button>
              ))}
              <div className='h-6 w-px bg-gray-300' />
            </div>
          ) : (
            <div className='flex items-center space-x-3'>
              <FileText className='h-5 w-5 text-gray-500' />
              <h2 className='text-lg font-semibold text-gray-900'>
                {fileInfo?.name || "Untitled Document"}
              </h2>
              {fileInfo?.isDirty && (
                <span className='text-xs text-amber-600 font-medium'>
                  • Modified
                </span>
              )}
            </div>
          )}
          {/* Built-in actions */}
          {actions &&
            (typeof actions === "function"
              ? actions(activeTab, setActiveTab)
              : actions)}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className='flex items-center justify-between border-b bg-gray-50'>
        <div className='flex'>
          <button
            onClick={() => handleTabChange("code")}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === "code"
                ? "border-blue-500 text-blue-600 bg-white"
                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Code className='h-4 w-4' />
            <span>Code Editor</span>
          </button>
          <button
            onClick={() => handleTabChange("visual")}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === "visual"
                ? "border-blue-500 text-blue-600 bg-white"
                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Workflow className='h-4 w-4' />
            <span>Visual Diagram</span>
          </button>
        </div>

        <div className='px-6'>
          <InlineTipsCarousel
            tips={editorTips}
            activeTab={activeTab}
            autoAdvance={true}
            autoAdvanceInterval={6000}
          />
        </div>
      </div>

      {/* Content Area */}
      <div className='flex-1 overflow-hidden'>
        {activeTab === "code" && (
          <div className='h-full p-4 bg-white'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-gray-100'>{visualDiagram}</div>
        )}
      </div>
    </div>
  );
};
