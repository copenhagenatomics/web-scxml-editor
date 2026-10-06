'use client';

import { useEffect } from 'react';
import { useDiagramExportStore } from '@/stores/diagram-export-store';

// Covers the app while "Export PDF" steps the canvas through every hierarchy
// level — hides the level-by-level jumping and blocks edits mid-export. It is
// outside `.react-flow__viewport`, so it never appears in the captured PDF.
export function PdfExportOverlay() {
  const progress = useDiagramExportStore((state) => state.progress);
  const isExporting = progress !== null;

  // The overlay only stops pointer input; the app's shortcuts (undo/redo,
  // Delete, paste…) are window keydown listeners. Swallow every keydown in
  // the window's capture phase — which runs before all of them — so nothing
  // can change the SCXML while pages are being captured.
  useEffect(() => {
    if (!isExporting) return;
    const blockKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockKey, true);
    return () => window.removeEventListener('keydown', blockKey, true);
  }, [isExporting]);

  if (!progress) return null;

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/40'>
      <div
        role='status'
        aria-live='polite'
        aria-atomic='true'
        className='flex items-center gap-3 px-5 py-4 rounded-lg shadow-lg bg-elevated border border-default text-sm text-default'
      >
        <span
          aria-hidden='true'
          className='h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block'
        />
        {progress.total > 0
          ? `Exporting PDF — level ${progress.current} of ${progress.total}`
          : 'Preparing PDF export…'}
      </div>
    </div>
  );
}
