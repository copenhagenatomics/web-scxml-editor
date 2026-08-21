# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the SCXML editor UI to a modern warm-neutral look using shadcn/ui and Tailwind CSS stone palette, with no business logic changes.

**Architecture:** Install shadcn/ui with stone theme to provide interactive primitives (Button, Tooltip, DropdownMenu, etc.). Restructure `TwoTabLayout` to a single toolbar row (icon view-toggle + breadcrumb + host commands + overflow `···` menu) plus a thin context bar. Replace all `gray-*` Tailwind tokens with `stone-*` throughout every component. The download/upload/validation actions move into the overflow `DropdownMenu` in `page.tsx`. All state management, parsing, validation and diagram logic is untouched.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, shadcn/ui (stone base), lucide-react, TypeScript

---

## File Map

| Action | File | What changes |
|---|---|---|
| CREATE | `src/lib/utils.ts` | `cn` helper (from shadcn init) |
| CREATE | `src/components/ui/button.tsx` | shadcn Button primitive |
| CREATE | `src/components/ui/separator.tsx` | shadcn Separator |
| CREATE | `src/components/ui/tooltip.tsx` | shadcn Tooltip |
| CREATE | `src/components/ui/dropdown-menu.tsx` | shadcn DropdownMenu |
| CREATE | `src/components/ui/badge.tsx` | shadcn Badge |
| CREATE | `src/components/ui/scroll-area.tsx` | shadcn ScrollArea |
| CREATE | `components.json` | shadcn config (from init) |
| MODIFY | `src/app/globals.css` | shadcn CSS vars + remove cursor rule |
| MODIFY | `src/app/layout.tsx` | Wrap body children in `TooltipProvider` |
| MODIFY | `src/app/page.tsx` | Landing page, renderActions, statusBar |
| MODIFY | `src/components/file-operations/file-upload.tsx` | Stone palette |
| MODIFY | `src/components/file-operations/visual-metadata-export.tsx` | Add `mode='menu-items'` rendering path |
| MODIFY | `src/components/layout/two-tab-layout.tsx` | Full toolbar redesign |
| MODIFY | `src/components/layout/inline-tips-carousel.tsx` | Stone palette |
| MODIFY | `src/components/ui/undo-redo-controls.tsx` | Use shadcn Button |
| MODIFY | `src/components/ui/validation-panel.tsx` | Stone palette |
| MODIFY | `src/components/ui/config-panel.tsx` | Stone palette + ScrollArea |
| MODIFY | `src/components/ui/channel-mapping-panel.tsx` | Stone palette |
| MODIFY | `src/components/ui/searchable-select.tsx` | Stone palette |

---

## Task 1: Install shadcn/ui

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Run shadcn init**

```bash
cd d:/web-scxml-editor
npx shadcn@latest init
```

When prompted:
- **Which style?** → New York
- **Which base color?** → Stone
- **CSS variables?** → Yes

This creates `components.json`, `src/lib/utils.ts`, and updates `src/app/globals.css`.

- [ ] **Step 2: Add all required shadcn components**

```bash
npx shadcn@latest add button separator tooltip dropdown-menu badge scroll-area
```

This creates `src/components/ui/button.tsx`, `separator.tsx`, `tooltip.tsx`, `dropdown-menu.tsx`, `badge.tsx`, `scroll-area.tsx`.

- [ ] **Step 3: Verify `src/lib/utils.ts` exists and exports `cn`**

Expected content (shadcn generates this):
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

If `cn` is missing, write the file above manually.

- [ ] **Step 4: Verify build compiles**

```bash
npm run build
```

Expected: no TypeScript errors. Fix any import errors before proceeding.

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/utils.ts src/app/globals.css src/components/ui/button.tsx src/components/ui/separator.tsx src/components/ui/tooltip.tsx src/components/ui/dropdown-menu.tsx src/components/ui/badge.tsx src/components/ui/scroll-area.tsx package.json package-lock.json
git commit -m "chore: install shadcn/ui with stone theme"
```

---

## Task 2: Add TooltipProvider to app layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update layout.tsx**

Replace the entire file content with:

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SCXML Parser & Editor',
  description: 'SCXML Parser & Editor',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  if(window.ScxmlEditorAPI)return;
  var q={ready:[],commands:[],feedback:[],hostErrors:[]};
  window.ScxmlEditorAPI={
    _q:q,
    onReady:function(cb){q.ready.push(cb);},
    registerCommand:function(o){q.commands.push(o);},
    showFeedback:function(m,l){q.feedback.push([m,l]);},
    setChannels:function(c){q.channels=c;},
    showErrors:function(errors){errors.forEach(function(e){q.hostErrors.push(e);});},
    clearErrors:function(){q.clearErrors=true;q.hostErrors=[];},
    loadScxml:function(){},
    getScxml:function(){return'';},
    toggleConfigPanel:function(){},
    setActiveTab:function(){}
  };
})();` }} />
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ui): add TooltipProvider to app root"
```

---

## Task 3: Redesign landing page (empty state)

**Files:**
- Modify: `src/app/page.tsx` — only the `!content` JSX branch (lines ~517–609)

- [ ] **Step 1: Add `Badge` import to `page.tsx`**

Add to the existing imports at the top of `page.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';
```

- [ ] **Step 2: Replace the `!content` branch in `page.tsx`**

Find this block in `page.tsx`:
```tsx
) : !content ? (
  <div className='container mx-auto px-4 py-8'>
    ...
  </div>
```

Replace everything from `<div className='container mx-auto px-4 py-8'>` to its closing `</div>` with:

```tsx
) : !content ? (
  <div className='min-h-screen bg-stone-50 flex flex-col items-center justify-center p-8 gap-8'>
    {/* Logo */}
    <div className='w-11 h-11 bg-stone-900 rounded-xl flex items-center justify-center flex-shrink-0'>
      <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='white' strokeWidth='1.8'>
        <circle cx='12' cy='12' r='2.5' />
        <circle cx='4' cy='6' r='1.8' /><circle cx='20' cy='6' r='1.8' />
        <circle cx='4' cy='18' r='1.8' /><circle cx='20' cy='18' r='1.8' />
        <line x1='5.6' y1='6.8' x2='10.4' y2='10.5' />
        <line x1='18.4' y1='6.8' x2='13.6' y2='10.5' />
        <line x1='5.6' y1='17.2' x2='10.4' y2='13.5' />
        <line x1='18.4' y1='17.2' x2='13.6' y2='13.5' />
      </svg>
    </div>

    {/* Heading */}
    <div className='text-center space-y-2'>
      <h1 className='text-2xl font-bold tracking-tight text-stone-900'>
        Visual SCXML Editor
      </h1>
      <p className='text-sm text-stone-500 max-w-sm leading-relaxed'>
        Edit SCXML files with syntax highlighting, real-time validation, and interactive visual diagrams.
      </p>
    </div>

    {/* Upload zone */}
    <div className='w-full max-w-md'>
      <FileUpload onFileLoad={handleFileLoad} onError={handleFileError} />
    </div>

    {/* New document link */}
    <p className='text-sm text-stone-500'>
      or{' '}
      <button
        type='button'
        onClick={handleCreateNewDocument}
        className='text-stone-900 font-medium underline underline-offset-2 hover:text-stone-600 transition-colors focus:outline-none'
      >
        create a new document
      </button>
    </p>

    {/* Feature pills */}
    <div className='flex gap-2 flex-wrap justify-center'>
      {['Code ↔ Visual sync', 'Real-time validation', 'SCXML autocomplete', 'Visual metadata', 'Undo / Redo'].map((f) => (
        <Badge key={f} variant='outline' className='text-stone-500 border-stone-200 bg-white font-normal'>
          {f}
        </Badge>
      ))}
    </div>
  </div>
```

Also update the outermost wrapper `<div className='min-h-screen bg-gray-50 overflow-hidden'>` to use stone:
```tsx
<div className='min-h-screen bg-stone-50 overflow-hidden'>
```

And the loading spinner wrapper:
```tsx
<div className='flex items-center justify-center h-screen bg-stone-50'>
  <div className='h-8 w-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin' />
</div>
```

- [ ] **Step 2: Run dev server and verify landing page**

```bash
npm run dev
```

Navigate to `http://localhost:3000`. Expected: centered hero with logo, title, subtitle, upload zone, "create a new document" link, feature pills. Stone/warm neutral palette throughout.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): redesign landing page with centered hero layout"
```

---

## Task 4: Restyle FileUpload component

**Files:**
- Modify: `src/components/file-operations/file-upload.tsx`

- [ ] **Step 1: Replace file-upload.tsx**

```tsx
'use client';

import React, { useRef } from 'react';
import { Upload, FileText } from 'lucide-react';
import { validateFile, readFileAsText } from '@/lib/utils/file-utils';
import type { FileInfo } from '@/types/common';

interface FileUploadProps {
  onFileLoad: (fileInfo: FileInfo) => void;
  onError: (errors: string[]) => void;
  disabled?: boolean;
  accept?: string;
}

export function FileUpload({
  onFileLoad,
  onError,
  disabled = false,
  accept = '.scxml,.xml',
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      onError(validationErrors);
      return;
    }
    try {
      const content = await readFileAsText(file);
      onFileLoad({ name: file.name, size: file.size, lastModified: new Date(file.lastModified), content });
    } catch (error) {
      onError([error instanceof Error ? error.message : 'Failed to read file']);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) handleFileSelect(files[0]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className='w-full'>
      <input
        ref={fileInputRef}
        type='file'
        accept={accept}
        onChange={handleInputChange}
        className='hidden'
        disabled={disabled}
      />

      <div
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDrop={disabled ? undefined : handleDrop}
        onDragOver={disabled ? undefined : handleDragOver}
        className={[
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200',
          disabled
            ? 'border-stone-200 bg-stone-50 cursor-not-allowed'
            : 'border-stone-300 bg-white cursor-pointer hover:border-stone-500 hover:bg-stone-50',
        ].join(' ')}
      >
        <div className='flex flex-col items-center gap-4'>
          <div className={`p-3 rounded-lg ${disabled ? 'bg-stone-100' : 'bg-stone-100'}`}>
            {disabled ? (
              <FileText className='h-8 w-8 text-stone-400' />
            ) : (
              <Upload className='h-8 w-8 text-stone-500' />
            )}
          </div>

          <div className='space-y-1'>
            <p className={`text-sm font-medium ${disabled ? 'text-stone-400' : 'text-stone-700'}`}>
              {disabled ? 'Upload disabled' : 'Drop your SCXML file here'}
            </p>
            {!disabled && (
              <>
                <p className='text-xs text-stone-400'>Click to browse or drag and drop</p>
                <p className='text-xs text-stone-400'>Supports .scxml and .xml · up to 10MB</p>
              </>
            )}
          </div>

          {!disabled && (
            <span className='inline-flex items-center px-4 py-1.5 bg-stone-900 text-white text-xs font-medium rounded-md hover:bg-stone-700 transition-colors'>
              Browse file
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Open the landing page. The upload zone should show a rounded-xl dashed border, stone tones, and a "Browse file" button.

- [ ] **Step 3: Commit**

```bash
git add src/components/file-operations/file-upload.tsx
git commit -m "feat(ui): restyle FileUpload with stone palette"
```

---

## Task 5: Redesign TwoTabLayout

**Files:**
- Modify: `src/components/layout/two-tab-layout.tsx`

- [ ] **Step 1: Replace two-tab-layout.tsx**

```tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Code2, FileText, Workflow } from "lucide-react";
import { InlineTipsCarousel } from "./inline-tips-carousel";
import { useHostAPIStore } from "@/stores/host-api-store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  statusBar?: React.ReactNode;
}

export type TabType = "code" | "visual";

export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  actions,
  statusBar,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    () => useHostAPIStore.getState().requestedTab ?? "code",
  );
  const {
    commands,
    feedbackQueue,
    executeCommand,
    dismissFeedback,
    requestedTab,
    setRequestedTab,
  } = useHostAPIStore();

  useEffect(() => {
    if (requestedTab !== null) {
      setActiveTab(requestedTab);
      setRequestedTab(null);
    }
  }, [requestedTab, setRequestedTab]);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const editorTips = [
    {
      tab: "code" as const,
      content: (
        <>
          Press{" "}
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
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
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
            Ctrl+Z
          </kbd>{" "}
          to undo and{" "}
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
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
          Create a new channel using the{" "}
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
            this_
          </kbd>{" "}
          prefix
        </>
      ),
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Select an edge, then{" "}
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
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
      content: "Click the network icon for auto-layout options.",
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Press{" "}
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
            Delete
          </kbd>{" "}
          (Windows) or{" "}
          <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-700 font-mono text-xs">
            fn+Delete
          </kbd>{" "}
          (Mac) to remove selected states or transitions
        </>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col relative">
      {/* Feedback toasts */}
      {feedbackQueue.map((item) => (
        <div
          key={item.id}
          className={cn(
            "absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start space-x-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-lg w-full",
            item.level === "info"
              ? "bg-green-50 border border-green-200 text-green-800"
              : item.level === "warning"
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : "bg-red-50 border border-red-200 text-red-800",
          )}
        >
          <span className="flex-1 whitespace-pre-wrap">{item.message}</span>
          <button
            onClick={() => dismissFeedback(item.id)}
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Toolbar — single row */}
      <div className="flex items-center h-11 px-3 border-b border-stone-200 bg-white gap-2 flex-shrink-0">
        {/* View icon toggle */}
        <div className="flex bg-stone-100 rounded-md p-0.5 border border-stone-200">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleTabChange("visual")}
                className={cn(
                  "flex items-center justify-center w-8 h-7 rounded transition-all",
                  activeTab === "visual"
                    ? "bg-white shadow-sm text-stone-900"
                    : "text-stone-400 hover:text-stone-600",
                )}
              >
                <Workflow className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Visual Diagram</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleTabChange("code")}
                className={cn(
                  "flex items-center justify-center w-8 h-7 rounded transition-all",
                  activeTab === "code"
                    ? "bg-white shadow-sm text-stone-900"
                    : "text-stone-400 hover:text-stone-600",
                )}
              >
                <Code2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Code Editor</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* File breadcrumb */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <FileText className="h-3.5 w-3.5 text-stone-400 flex-shrink-0" />
          <span className="text-sm font-medium text-stone-900 truncate">
            {fileInfo?.name || "Untitled Document"}
          </span>
          {fileInfo?.isDirty && (
            <span className="text-amber-600 text-xs" title="Unsaved changes">
              ●
            </span>
          )}
        </div>

        {/* Host-registered commands */}
        {commands.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex gap-1.5">
              {commands.map((cmd) => (
                <Button
                  key={cmd.id}
                  variant="outline"
                  size="sm"
                  onClick={() => executeCommand(cmd.id)}
                  disabled={cmd.isExecuting}
                  title={cmd.tooltip}
                  className="text-stone-600 border-stone-200 hover:bg-stone-50 h-8 text-xs"
                >
                  {cmd.isExecuting && (
                    <span className="h-3 w-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin mr-1" />
                  )}
                  {cmd.label}
                </Button>
              ))}
            </div>
          </>
        )}

        {/* Actions injected from page.tsx (undo/redo + overflow menu) */}
        {actions &&
          (typeof actions === "function"
            ? actions(activeTab, setActiveTab)
            : actions)}
      </div>

      {/* Context bar — tips carousel */}
      <div className="flex items-center h-9 px-3 border-b border-stone-200 bg-stone-50 flex-shrink-0">
        <InlineTipsCarousel
          tips={editorTips}
          activeTab={activeTab}
          autoAdvance={true}
          autoAdvanceInterval={6000}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "code" && (
          <div className="h-full p-4 bg-white">{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className="h-full bg-stone-100">{visualDiagram}</div>
        )}
      </div>

      {/* Status bar — rendered by page.tsx */}
      {statusBar}
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors. If page.tsx errors about missing `statusBar` prop, ignore for now — Task 7 adds it.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/two-tab-layout.tsx
git commit -m "feat(ui): redesign TwoTabLayout with single toolbar, context bar, status bar slot"
```

---

## Task 6: Adapt VisualMetadataExport for dropdown menu items

**Files:**
- Modify: `src/components/file-operations/visual-metadata-export.tsx`

- [ ] **Step 1: Replace visual-metadata-export.tsx**

```tsx
'use client';

import React from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface VisualMetadataExportProps {
  scxmlContent: string;
  filename?: string;
  hasVisualMetadata?: boolean;
  onExportComplete?: (exportType: 'with-metadata' | 'clean') => void;
  mode?: 'buttons' | 'menu-items';
}

export const VisualMetadataExport: React.FC<VisualMetadataExportProps> = ({
  scxmlContent,
  filename = 'document.scxml',
  hasVisualMetadata = false,
  onExportComplete,
  mode = 'buttons',
}) => {
  const downloadFile = (
    content: string,
    fileName: string,
    exportType: 'with-metadata' | 'clean',
  ) => {
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onExportComplete?.(exportType);
  };

  const handleExportWithMetadata = () => {
    downloadFile(scxmlContent, filename, 'with-metadata');
  };

  const handleExportClean = async () => {
    try {
      const { removeVisualMetadataFromXML } = await import(
        '@/lib/utils/visual-metadata-utils'
      );
      const regexCleanedContent = removeVisualMetadataFromXML(scxmlContent);
      try {
        const { SCXMLParser } = await import('@/lib/parsers/scxml-parser');
        const parser = new SCXMLParser();
        const parseResult = parser.parse(scxmlContent);
        if (parseResult.success && parseResult.data) {
          const cleanContent = parser.serialize(parseResult.data, false);
          const cleanFilename = filename.replace(/\.(scxml|xml)$/i, '-clean.$1');
          downloadFile(cleanContent, cleanFilename, 'clean');
          return;
        }
      } catch (parserError) {
        console.warn('Parser error, using regex-based cleaning:', parserError);
      }
      const cleanFilename = filename.replace(/\.(scxml|xml)$/i, '-clean.$1');
      downloadFile(regexCleanedContent, cleanFilename, 'clean');
    } catch (error) {
      console.error('Error creating clean export:', error);
      const cleanFilename = filename.replace(/\.(scxml|xml)$/i, '-clean.$1');
      downloadFile(scxmlContent, cleanFilename, 'clean');
    }
  };

  if (mode === 'menu-items') {
    if (!hasVisualMetadata) {
      return (
        <DropdownMenuItem onClick={handleExportWithMetadata}>
          <Download className='h-4 w-4 mr-2' />
          Download
        </DropdownMenuItem>
      );
    }
    return (
      <>
        <DropdownMenuItem onClick={handleExportWithMetadata}>
          <Eye className='h-4 w-4 mr-2' />
          Download Download
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportClean}>
          <EyeOff className='h-4 w-4 mr-2' />
          Clean SCXML
        </DropdownMenuItem>
      </>
    );
  }

  // mode === 'buttons' (legacy, kept for compatibility)
  if (!hasVisualMetadata) {
    return (
      <button
        onClick={handleExportWithMetadata}
        className='inline-flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors'
        title='Download SCXML file'
      >
        <Download className='h-4 w-4' />
        <span>Download</span>
      </button>
    );
  }

  return (
    <div className='flex items-center space-x-2'>
      <button
        onClick={handleExportWithMetadata}
        className='cursor-pointer inline-flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors'
        title='Download with visual metadata'
      >
        <Download className='h-4 w-4' />
        <span>Download</span>
      </button>
      <button
        onClick={handleExportClean}
        className='cursor-pointer inline-flex items-center space-x-2 text-sm px-3 py-2 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors'
        title='Download clean W3C-compliant SCXML'
      >
        <Download className='h-4 w-4' />
        <span>Clean SCXML</span>
      </button>
    </div>
  );
};

export default VisualMetadataExport;
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/file-operations/visual-metadata-export.tsx
git commit -m "feat(ui): add menu-items mode to VisualMetadataExport for dropdown"
```

---

## Task 7: Update page.tsx — renderActions, renderCodeEditor, statusBar

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update imports in page.tsx**

Find the existing imports block at the top of `page.tsx`. Add these imports:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
```

Remove the existing `import { Upload } from 'lucide-react';` line (it's already in the file; add `MoreHorizontal, AlertCircle` to the same lucide import instead).

The updated lucide import line should be:
```tsx
import { Upload, MoreHorizontal, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Replace `renderActions` in page.tsx**

Find the existing `const renderActions = (...)` block (around line 444) and replace it entirely with:

```tsx
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

      <UndoRedoControls
        onUndo={handleUndo}
        onRedo={handleRedo}
        className='mr-1'
      />

      <Separator orientation='vertical' className='h-5 mx-1' />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className='flex items-center justify-center w-8 h-8 rounded-md text-stone-500 hover:bg-stone-100 transition-colors'>
            <MoreHorizontal className='h-4 w-4' />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-52'>
          <DropdownMenuItem onClick={handleNewFileUpload}>
            <Upload className='h-4 w-4 mr-2' />
            Upload file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <VisualMetadataExport
            mode='menu-items'
            scxmlContent={content}
            filename={getDownloadFilename()}
            hasVisualMetadata={hasVisualMetadata(content)}
            onExportComplete={(exportType) => {}}
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (activeTab === 'visual') setActiveTab('code');
              const opening = !isValidationPanelVisible;
              setValidationPanelVisible(opening);
              if (opening) {
                setConfigPanelVisible(false);
              } else {
                setValidationPanelTab('validation');
              }
            }}
          >
            <AlertCircle
              className={cn(
                'h-4 w-4 mr-2',
                hasErrors
                  ? 'text-red-500'
                  : hasWarnings
                    ? 'text-amber-500'
                    : 'text-stone-400',
              )}
            />
            <span>Validation</span>
            {(totalErrors > 0 || totalWarnings > 0) && (
              <Badge
                variant='outline'
                className={cn(
                  'ml-auto text-xs',
                  hasErrors
                    ? 'border-red-200 text-red-600'
                    : 'border-amber-200 text-amber-600',
                )}
              >
                {totalErrors > 0 ? `${totalErrors}e` : ''}
                {totalErrors > 0 && totalWarnings > 0 ? ' ' : ''}
                {totalWarnings > 0 ? `${totalWarnings}w` : ''}
              </Badge>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
```

- [ ] **Step 3: Replace `renderCodeEditor` in page.tsx**

Find the existing `const renderCodeEditor = () => (...)` block (around line 393) and replace:

```tsx
  const renderCodeEditor = () => (
    <div className='flex gap-4 h-full'>
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
          hostErrors={hostErrors}
          isVisible={isValidationPanelVisible}
          activeTab={validationPanelTab}
          onClose={() => {
            setValidationPanelVisible(false);
            setValidationPanelTab('validation');
          }}
          onTabChange={setValidationPanelTab}
          onErrorClick={handleErrorClick}
          onDismissHostError={dismissHostError}
          onClearHostErrors={clearHostErrors}
        />
        {renderSidePanels()}
      </div>
    </div>
  );
```

(Only change is `h-[calc(100vh-200px)]` → `h-full`.)

- [ ] **Step 4: Add `renderStatusBar` helper and pass `statusBar` to TwoTabLayout**

Add this helper just before the `return` statement:

```tsx
  const renderStatusBar = () => (
    <div className='h-6 border-t border-stone-200 bg-stone-50 px-3 flex items-center gap-3 text-xs text-stone-400 flex-shrink-0'>
      {hasErrors || hasWarnings ? (
        <div className='flex items-center gap-3'>
          {totalErrors > 0 && (
            <div className='flex items-center gap-1'>
              <div className='w-1.5 h-1.5 rounded-full bg-red-500' />
              <span>
                {totalErrors} error{totalErrors !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {totalWarnings > 0 && (
            <div className='flex items-center gap-1'>
              <div className='w-1.5 h-1.5 rounded-full bg-amber-400' />
              <span>
                {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className='flex items-center gap-1'>
          <div className='w-1.5 h-1.5 rounded-full bg-green-500' />
          <span>Valid</span>
        </div>
      )}
      <span className='ml-auto text-stone-400'>
        {fileInfo?.name || 'Untitled'} · SCXML
      </span>
    </div>
  );
```

Then in the `return` JSX, update the `<TwoTabLayout>` call (around line 613) to add `statusBar`:

```tsx
          <TwoTabLayout
            codeEditor={renderCodeEditor()}
            visualDiagram={renderVisualDiagram()}
            fileInfo={{
              name: fileInfo?.name,
              isDirty,
            }}
            actions={renderActions}
            statusBar={renderStatusBar()}
          />
```

- [ ] **Step 5: Verify dev server**

```bash
npm run dev
```

Load a file. Expected: toolbar shows icon view toggle + file breadcrumb + undo/redo + `···` overflow button. Opening `···` shows Upload, Download options, Validation. No separate tab row. Context bar below toolbar shows tips. Status bar at bottom shows valid/error status + file name.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): update page.tsx with overflow dropdown and status bar"
```

---

## Task 8: Restyle UndoRedoControls

**Files:**
- Modify: `src/components/ui/undo-redo-controls.tsx`

- [ ] **Step 1: Replace undo-redo-controls.tsx**

```tsx
'use client';

import React, { useEffect, useCallback } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useHistoryStore } from '@/stores/history-store';
import { HistoryManager } from '@/lib/history/history-manager';
import type { ActionType } from '@/types/history';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UndoRedoControlsProps {
  onUndo?: (content: string, actionType: ActionType) => void;
  onRedo?: (content: string, actionType: ActionType) => void;
  className?: string;
  showTooltips?: boolean;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({
  onUndo,
  onRedo,
  className = '',
  showTooltips = true,
}) => {
  const { canUndo, canRedo, getUndoDescription, getRedoDescription } =
    useHistoryStore();
  const historyManager = HistoryManager.getInstance();

  const handleUndo = useCallback(() => {
    const result = historyManager.undo();
    if (result !== null && onUndo) {
      onUndo(result.content, result.actionType);
    }
  }, [onUndo]);

  const handleRedo = useCallback(() => {
    const result = historyManager.redo();
    if (result !== null && onRedo) {
      onRedo(result.content, result.actionType);
    }
  }, [onRedo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlCmd = isMac ? event.metaKey : event.ctrlKey;

      if (isCtrlCmd && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        if (canUndo()) handleUndo();
      } else if (
        (isCtrlCmd && event.shiftKey && event.key === 'z') ||
        (isCtrlCmd && event.key === 'y')
      ) {
        event.preventDefault();
        if (canRedo()) handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, handleUndo, handleRedo]);

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <Button
        variant='ghost'
        size='icon'
        onClick={handleUndo}
        disabled={!canUndo()}
        title={showTooltips ? getUndoDescription() || 'Undo (Ctrl+Z)' : undefined}
        aria-label='Undo'
        className={cn(
          'h-8 w-8',
          canUndo() ? 'text-stone-600 hover:text-stone-900' : 'text-stone-300',
        )}
      >
        <Undo2 className='h-4 w-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        onClick={handleRedo}
        disabled={!canRedo()}
        title={showTooltips ? getRedoDescription() || 'Redo (Ctrl+Y)' : undefined}
        aria-label='Redo'
        className={cn(
          'h-8 w-8',
          canRedo() ? 'text-stone-600 hover:text-stone-900' : 'text-stone-300',
        )}
      >
        <Redo2 className='h-4 w-4' />
      </Button>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/undo-redo-controls.tsx
git commit -m "feat(ui): restyle UndoRedoControls with stone palette"
```

---

## Task 9: Restyle ValidationPanel

**Files:**
- Modify: `src/components/ui/validation-panel.tsx`

- [ ] **Step 1: Replace validation-panel.tsx**

```tsx
'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import type { ValidationError } from '@/types/common';
import type { HostErrorItem } from '@/types/host-api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ValidationPanelProps {
  errors: ValidationError[];
  hostErrors: HostErrorItem[];
  isVisible: boolean;
  activeTab: 'validation' | 'host-alerts';
  onClose: () => void;
  onTabChange: (tab: 'validation' | 'host-alerts') => void;
  onErrorClick?: (error: ValidationError) => void;
  onDismissHostError: (id: string) => void;
  onClearHostErrors: () => void;
}

export function ValidationPanel({
  errors,
  hostErrors,
  isVisible,
  activeTab,
  onClose,
  onTabChange,
  onErrorClick,
  onDismissHostError,
  onClearHostErrors,
}: ValidationPanelProps) {
  if (!isVisible) return null;

  const showTabs = hostErrors.length > 0;

  return (
    <div className='bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden'>
      <div className='flex items-center justify-between px-4 pt-3 pb-0'>
        <h3 className='text-sm font-semibold text-stone-900'>Errors</h3>
        <button
          onClick={onClose}
          className='text-stone-400 hover:text-stone-600 transition-colors'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      {showTabs && (
        <div role='tablist' className='flex border-b border-stone-200 mt-3 px-4'>
          <button
            role='tab'
            aria-selected={activeTab === 'validation'}
            onClick={() => onTabChange('validation')}
            className={cn(
              'px-0 py-2 text-xs font-medium border-b-2 transition-colors mr-4',
              activeTab === 'validation'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-600',
            )}
          >
            Validation ({errors.length})
          </button>
          <button
            role='tab'
            aria-selected={activeTab === 'host-alerts'}
            onClick={() => onTabChange('host-alerts')}
            className={cn(
              'px-0 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === 'host-alerts'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-600',
            )}
          >
            Host Alerts ({hostErrors.length})
          </button>
        </div>
      )}

      <div className='p-4'>
        {!showTabs || activeTab === 'validation' ? (
          <ValidationTab errors={errors} onErrorClick={onErrorClick} />
        ) : (
          <HostAlertsTab
            hostErrors={hostErrors}
            onDismiss={onDismissHostError}
            onClearAll={onClearHostErrors}
          />
        )}
      </div>
    </div>
  );
}

interface ValidationTabProps {
  errors: ValidationError[];
  onErrorClick?: (error: ValidationError) => void;
}

function ValidationTab({ errors, onErrorClick }: ValidationTabProps) {
  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;
  const sortedErrors = [...errors].sort((a, b) => {
    if (a.severity === 'error' && b.severity === 'warning') return -1;
    if (a.severity === 'warning' && b.severity === 'error') return 1;
    return 0;
  });

  if (errors.length === 0) {
    return (
      <div className='flex items-center gap-2 text-green-600'>
        <CheckCircle className='h-4 w-4' />
        <span className='text-sm'>No validation issues found</span>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-3 text-xs'>
        {errorCount > 0 && (
          <div className='flex items-center gap-1 text-red-600'>
            <AlertCircle className='h-3.5 w-3.5' />
            <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {warningCount > 0 && (
          <div className='flex items-center gap-1 text-amber-600'>
            <AlertTriangle className='h-3.5 w-3.5' />
            <span>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      <ScrollArea className='max-h-96'>
        <div className='space-y-1.5'>
          {sortedErrors.map((error, index) => (
            <ValidationErrorItem key={index} error={error} onClick={onErrorClick} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface HostAlertsTabProps {
  hostErrors: HostErrorItem[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

function HostAlertsTab({ hostErrors, onDismiss, onClearAll }: HostAlertsTabProps) {
  if (hostErrors.length === 0) {
    return (
      <div className='flex items-center gap-2 text-green-600'>
        <CheckCircle className='h-4 w-4' />
        <span className='text-sm'>No host alerts</span>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='flex justify-end'>
        <button
          onClick={onClearAll}
          className='text-xs text-stone-400 hover:text-stone-600 transition-colors'
        >
          Clear all
        </button>
      </div>
      <ScrollArea className='max-h-96'>
        <div className='space-y-1.5'>
          {hostErrors.map((item) => (
            <HostErrorCard key={item.id} item={item} onDismiss={onDismiss} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface HostErrorCardProps {
  item: HostErrorItem;
  onDismiss: (id: string) => void;
}

function HostErrorCard({ item, onDismiss }: HostErrorCardProps) {
  const isError = item.level === 'error';
  const isWarning = item.level === 'warning';
  const Icon = isError ? AlertCircle : isWarning ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        'p-2.5 rounded-lg border flex items-start gap-2 overflow-hidden',
        isError
          ? 'bg-red-50 border-red-100'
          : isWarning
            ? 'bg-amber-50 border-amber-100'
            : 'bg-blue-50 border-blue-100',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 flex-shrink-0 mt-0.5',
          isError ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-blue-400',
        )}
      />
      <div className='ml-0 min-w-0 flex-1'>
        <p
          className={cn(
            'text-xs font-medium whitespace-pre-wrap break-all',
            isError ? 'text-red-800' : isWarning ? 'text-amber-800' : 'text-blue-800',
          )}
        >
          {item.message}
        </p>
      </div>
      <button
        onClick={() => onDismiss(item.id)}
        className='ml-1 flex-shrink-0 text-stone-400 hover:text-stone-600 transition-colors'
        aria-label='Dismiss'
      >
        <X className='h-3.5 w-3.5' />
      </button>
    </div>
  );
}

interface ValidationErrorItemProps {
  error: ValidationError;
  onClick?: (error: ValidationError) => void;
}

function ValidationErrorItem({ error, onClick }: ValidationErrorItemProps) {
  const isError = error.severity === 'error';
  const isClickable = onClick && error.line && error.column;

  return (
    <div
      className={cn(
        'p-2.5 rounded-lg border',
        isError ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100',
        isClickable ? 'cursor-pointer hover:shadow-sm transition-shadow' : '',
      )}
      onClick={isClickable ? () => onClick(error) : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(error);
              }
            }
          : undefined
      }
    >
      <div className='flex items-start gap-2'>
        {isError ? (
          <AlertCircle className='h-4 w-4 text-red-400 flex-shrink-0 mt-0.5' />
        ) : (
          <AlertTriangle className='h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5' />
        )}
        <div className='flex-1 min-w-0'>
          <p
            className={cn(
              'text-xs font-medium break-words',
              isError ? 'text-red-800' : 'text-amber-800',
            )}
          >
            {error.message}
          </p>
          {(error.line || error.column) && (
            <p
              className={cn(
                'text-xs mt-1 font-mono',
                isError ? 'text-red-500' : 'text-amber-500',
              )}
            >
              Line {error.line || '?'}, Col {error.column || '?'}
              {isClickable && (
                <span className='ml-1 not-italic font-sans opacity-70'>
                  (click to navigate)
                </span>
              )}
            </p>
          )}
          {error.code && (
            <p
              className={cn(
                'text-xs mt-0.5 font-mono',
                isError ? 'text-red-400' : 'text-amber-400',
              )}
            >
              {error.code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/validation-panel.tsx
git commit -m "feat(ui): restyle ValidationPanel with stone palette and ScrollArea"
```

---

## Task 10: Restyle ConfigPanel

**Files:**
- Modify: `src/components/ui/config-panel.tsx`

- [ ] **Step 1: Replace config-panel.tsx**

```tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import type { ConfigValue } from '@/types/host-api';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
  onAddField: (name: string, defaultValue: string) => void;
  onFieldChange: (name: string, newDefaultValue: string) => void;
  onEntriesChange?: (values: ConfigValue[]) => void;
}

interface OverrideEntry {
  field: ConfigField;
  override: string;
}

export function ConfigPanel({
  isVisible,
  onClose,
  scxmlContent,
  onAddField,
  onFieldChange,
  onEntriesChange,
}: ConfigPanelProps) {
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');

  const fetchOverrides = useCallback(async (fields: ConfigField[]) => {
    if (fields.length === 0) {
      setEntries([]);
      return;
    }
    try {
      const res = await fetch('/scxml-editor/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { name: string; override: string | null }[] = await res.json();
      const overrideMap = Object.fromEntries(data.map((d) => [d.name, d.override ?? '']));
      setEntries(fields.map((f) => ({ field: f, override: overrideMap[f.name] ?? '' })));
    } catch {
      setEntries(fields.map((f) => ({ field: f, override: '' })));
    }
  }, []);

  useEffect(() => {
    const fields = extractConfigFields(scxmlContent);
    fetchOverrides(fields);
  }, [scxmlContent, fetchOverrides]);

  useEffect(() => {
    onEntriesChange?.(
      entries.map((e) => ({
        name: e.field.name,
        type: e.field.type,
        defaultValue: e.field.defaultValue,
        override: e.override,
      })),
    );
  }, [entries, onEntriesChange]);

  const handleConfirmAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddField(trimmed, newDefault.trim());
    setNewName('');
    setNewDefault('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewName('');
    setNewDefault('');
    setIsAdding(false);
  };

  if (!isVisible) return null;

  return (
    <div className='w-80 flex flex-col border border-stone-200 rounded-xl bg-white shadow-sm h-full overflow-hidden'>
      <div className='flex items-center justify-between px-3 py-2.5 border-b border-stone-200 bg-stone-50'>
        <span className='text-xs font-semibold text-stone-700'>Config Values</span>
        <button
          onClick={onClose}
          className='text-stone-400 hover:text-stone-600 transition-colors'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      <ScrollArea className='flex-1'>
        {entries.length === 0 && !isAdding ? (
          <div className='p-4 text-xs text-stone-500 space-y-2'>
            <p>No configurable fields found in this SCXML.</p>
            <p>
              Add a{' '}
              <code className='bg-stone-100 px-1 rounded text-stone-700'>conf_</code> prefix
              to any{' '}
              <code className='bg-stone-100 px-1 rounded text-stone-700'>&lt;data&gt;</code>{' '}
              field in the datamodel to make it configurable per deployment.
            </p>
            <p className='text-stone-400'>
              Example:{' '}
              <code className='bg-stone-100 px-1 rounded text-stone-600'>
                &lt;data expr="0.5" id="conf_threshold"/&gt;
              </code>
            </p>
          </div>
        ) : (
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-stone-50 border-b border-stone-200'>
                <th className='text-left px-3 py-2 text-stone-500 font-medium'>Field</th>
                <th className='text-left px-3 py-2 text-stone-500 font-medium w-14'>Type</th>
                <th className='text-left px-3 py-2 text-stone-500 font-medium'>Data Model</th>
                <th className='text-left px-3 py-2 text-stone-500 font-medium'>IO.Conf</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ field, override }) => (
                <tr key={field.name} className='border-b border-stone-100 hover:bg-stone-50'>
                  <td className='px-3 py-2 font-medium text-stone-800'>{field.name}</td>
                  <td className='px-3 py-2'>
                    <span className='text-indigo-600 font-mono'>{field.type}</span>
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      type='text'
                      value={field.defaultValue}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setEntries((prev) =>
                          prev.map((en) =>
                            en.field.name === field.name
                              ? { ...en, field: { ...en.field, defaultValue: newVal } }
                              : en,
                          ),
                        );
                      }}
                      onBlur={(e) => onFieldChange(field.name, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className='w-full border border-stone-200 rounded px-2 py-1 text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400'
                    />
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      type='text'
                      value={override}
                      placeholder='—'
                      onChange={(e) =>
                        setEntries((prev) =>
                          prev.map((en) =>
                            en.field.name === field.name
                              ? { ...en, override: e.target.value }
                              : en,
                          ),
                        )
                      }
                      className='w-full border border-stone-200 text-stone-500 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400'
                    />
                  </td>
                </tr>
              ))}
              {isAdding && (
                <tr className='border-b border-stone-100 bg-stone-50'>
                  <td className='px-3 py-2' colSpan={2}>
                    <div className='flex items-center gap-1'>
                      <span className='text-stone-400 text-[10px] shrink-0'>conf_</span>
                      <input
                        autoFocus
                        type='text'
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmAdd();
                          if (e.key === 'Escape') handleCancelAdd();
                        }}
                        placeholder='field_name'
                        className='w-full border border-stone-200 rounded px-2 py-1 text-xs text-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-400'
                      />
                    </div>
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      type='text'
                      value={newDefault}
                      onChange={(e) => setNewDefault(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmAdd();
                        if (e.key === 'Escape') handleCancelAdd();
                      }}
                      placeholder='default'
                      className='w-full border border-stone-200 rounded px-2 py-1 text-xs text-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-400'
                    />
                  </td>
                  <td className='px-3 py-2'>
                    <div className='flex gap-1'>
                      <button
                        onClick={handleConfirmAdd}
                        disabled={!newName.trim()}
                        className='p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed'
                      >
                        <Check className='h-3 w-3' />
                      </button>
                      <button
                        onClick={handleCancelAdd}
                        className='p-1 rounded text-stone-400 hover:bg-stone-100'
                      >
                        <X className='h-3 w-3' />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </ScrollArea>

      <div className='px-3 py-2 border-t border-stone-200 bg-stone-50'>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-stone-300 text-stone-500 hover:border-stone-500 hover:text-stone-700 transition-colors'
          >
            <Plus className='h-3 w-3' />
            Add config
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/config-panel.tsx
git commit -m "feat(ui): restyle ConfigPanel with stone palette and ScrollArea"
```

---

## Task 11: Restyle ChannelMappingPanel and SearchableSelect

**Files:**
- Modify: `src/components/ui/channel-mapping-panel.tsx`
- Modify: `src/components/ui/searchable-select.tsx`

- [ ] **Step 1: Replace channel-mapping-panel.tsx**

```tsx
'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import {
  extractDatamodelVariables,
  extractUnresolvedChannelRefs,
} from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChannelMappingPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
}

export function ChannelMappingPanel({
  isVisible,
  onClose,
  scxmlContent,
}: ChannelMappingPanelProps) {
  const channels = useHostAPIStore((state) => state.channels);
  const channelMappings = useHostAPIStore((state) => state.channelMappings);
  const updateChannelMapping = useHostAPIStore((state) => state.updateChannelMapping);

  const unresolvedRefs = useMemo(
    () => extractUnresolvedChannelRefs(scxmlContent, channels),
    [scxmlContent, channels],
  );

  const availableOptions = useMemo(() => {
    const datamodelVars = extractDatamodelVariables(scxmlContent).filter(
      (v) => !v.startsWith('this_'),
    );
    return Array.from(new Set([...channels, ...datamodelVars])).sort();
  }, [scxmlContent, channels]);

  const getMapped = (scxmlRef: string) =>
    channelMappings.find((m) => m.scxmlRef === scxmlRef)?.mappedChannel ?? '';

  if (!isVisible) return null;

  return (
    <div className='w-80 flex flex-col border border-stone-200 rounded-xl bg-white shadow-sm h-full overflow-hidden'>
      <div className='flex items-center justify-between px-3 py-2.5 border-b border-stone-200 bg-stone-50'>
        <span className='text-xs font-semibold text-stone-700'>Channel Mapping</span>
        <button
          onClick={onClose}
          className='text-stone-400 hover:text-stone-600 transition-colors'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      <ScrollArea className='flex-1'>
        {unresolvedRefs.length === 0 ? (
          <div className='p-4 text-xs text-stone-500 space-y-2'>
            <p>No unresolved channel references found in this SCXML.</p>
            <p>
              Channel references are variable names used in conditions or expressions that are not
              declared in the{' '}
              <code className='bg-stone-100 px-1 rounded text-stone-700'>&lt;datamodel&gt;</code>{' '}
              and do not use the{' '}
              <code className='bg-stone-100 px-1 rounded text-stone-700'>this_</code> or{' '}
              <code className='bg-stone-100 px-1 rounded text-stone-700'>conf_</code> prefixes.
            </p>
          </div>
        ) : (
          <table className='w-full text-xs table-fixed'>
            <thead>
              <tr className='bg-stone-50 border-b border-stone-200'>
                <th className='text-left px-3 py-2 text-stone-500 font-medium w-2/5'>
                  SCXML Ref
                </th>
                <th className='text-left px-3 py-2 text-stone-500 font-medium w-3/5'>
                  Physical Channel
                </th>
              </tr>
            </thead>
            <tbody>
              {unresolvedRefs.map((ref) => (
                <tr key={ref} className='border-b border-stone-100 hover:bg-stone-50'>
                  <td
                    className='px-3 py-2 font-mono text-stone-700 truncate max-w-0'
                    title={ref}
                  >
                    {ref}
                  </td>
                  <td className='px-3 py-2'>
                    {availableOptions.length === 0 ? (
                      <span className='text-stone-400 italic'>No channels available</span>
                    ) : (
                      <SearchableSelect
                        value={getMapped(ref)}
                        options={availableOptions}
                        onChange={(v) => updateChannelMapping(ref, v)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Replace searchable-select.tsx**

```tsx
'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = '—',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !buttonRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dropW = Math.max(rect.width, 220);
      const dropH = 240;
      const spaceBelow = vh - rect.bottom;
      const top =
        spaceBelow >= dropH || spaceBelow >= rect.top
          ? rect.bottom + 4
          : rect.top - dropH - 4;
      const left =
        rect.left + dropW > vw - 8 ? Math.max(8, rect.right - dropW) : rect.left;
      setDropdownStyle({ position: 'fixed', top: Math.max(8, top), left, width: dropW, zIndex: 9999 });
    }
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (isOpen ? (setIsOpen(false), setSearch('')) : handleOpen())}
        className='w-full border border-stone-200 rounded-md px-2.5 py-1.5 text-xs bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-1 focus:ring-stone-400 hover:border-stone-300 transition-colors'
      >
        <span className={`truncate ${value ? 'text-stone-700' : 'text-stone-400'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-stone-400 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className='bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden'
          >
            <div className='flex items-center gap-2 px-2.5 py-2 border-b border-stone-100 bg-stone-50'>
              <Search className='h-3.5 w-3.5 text-stone-400 flex-shrink-0' />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search...'
                className='flex-1 text-xs text-stone-700 focus:outline-none bg-transparent placeholder-stone-400'
              />
            </div>
            <div className='max-h-52 overflow-y-auto'>
              <button
                onClick={() => handleSelect('')}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  !value ? 'bg-stone-100 text-stone-700' : 'text-stone-400 hover:bg-stone-50'
                }`}
              >
                —
              </button>
              {filtered.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    value === option
                      ? 'bg-stone-100 text-stone-900 font-medium'
                      : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {option}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className='px-3 py-3 text-xs text-stone-400 text-center'>No matches</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/channel-mapping-panel.tsx src/components/ui/searchable-select.tsx
git commit -m "feat(ui): restyle ChannelMappingPanel and SearchableSelect with stone palette"
```

---

## Task 12: Restyle InlineTipsCarousel

**Files:**
- Modify: `src/components/layout/inline-tips-carousel.tsx`

- [ ] **Step 1: Replace inline-tips-carousel.tsx**

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Tip {
  content: React.ReactNode;
  tab?: 'code' | 'visual' | 'both';
}

interface InlineTipsCarouselProps {
  tips: Tip[];
  activeTab?: 'code' | 'visual';
  autoAdvance?: boolean;
  autoAdvanceInterval?: number;
}

export const InlineTipsCarousel: React.FC<InlineTipsCarouselProps> = ({
  tips,
  activeTab,
  autoAdvance = true,
  autoAdvanceInterval = 5000,
}) => {
  const filteredTips = tips.filter(
    (tip) => !tip.tab || tip.tab === 'both' || tip.tab === activeTab,
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [filteredTips.length]);

  useEffect(() => {
    if (!autoAdvance || filteredTips.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % filteredTips.length);
    }, autoAdvanceInterval);
    return () => clearInterval(timer);
  }, [autoAdvance, autoAdvanceInterval, filteredTips.length]);

  if (filteredTips.length === 0) return null;

  const currentTip = filteredTips[currentIndex];

  return (
    <div className='flex items-center gap-1.5 text-xs text-stone-400 min-w-0'>
      {filteredTips.length > 1 && (
        <button
          onClick={() =>
            setCurrentIndex(
              (prev) => (prev - 1 + filteredTips.length) % filteredTips.length,
            )
          }
          className='p-0.5 hover:bg-stone-200 rounded transition-colors flex-shrink-0'
          aria-label='Previous tip'
        >
          <ChevronLeft className='h-3 w-3' />
        </button>
      )}

      <div className='flex items-center gap-1 min-w-0'>
        <span className='font-medium flex-shrink-0'>Tip:</span>
        <span className='truncate'>{currentTip?.content}</span>
      </div>

      {filteredTips.length > 1 && (
        <>
          <span className='flex-shrink-0 text-stone-300'>
            {currentIndex + 1}/{filteredTips.length}
          </span>
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev + 1) % filteredTips.length)
            }
            className='p-0.5 hover:bg-stone-200 rounded transition-colors flex-shrink-0'
            aria-label='Next tip'
          >
            <ChevronRight className='h-3 w-3' />
          </button>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/inline-tips-carousel.tsx
git commit -m "feat(ui): restyle InlineTipsCarousel with stone palette"
```

---

## Task 13: Update globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Remove the `button:hover { cursor: pointer; }` rule**

Find and remove this block from `globals.css`:

```css
button:hover {
  cursor: pointer;
}
```

shadcn/ui's Button component and the `cursor-pointer` utility handle this where needed.

Keep all ReactFlow overrides and the shadcn-generated CSS variables.

- [ ] **Step 2: Verify build and run**

```bash
npm run build
```

Expected: clean build, no errors.

```bash
npm run dev
```

Navigate through the app. Verify:
- Landing page: centered hero, warm neutral tone
- Load a file: single toolbar with icon toggle, breadcrumb, undo/redo, `···`
- `···` menu: Upload, Download, Validation items
- Context bar: tips carousel below toolbar
- Status bar: valid/error count + file name at the bottom
- Validation panel (via `···` → Validation): stone borders, rounded-xl
- Config panel and Channel Mapping: stone palette

- [ ] **Step 3: Final commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): finalize warm neutral redesign — remove stale cursor rule"
```
