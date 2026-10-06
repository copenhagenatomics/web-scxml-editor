'use client';

import { useDiagramExportStore } from '@/stores/diagram-export-store';

// Covers the app while "Export PDF" steps the canvas through every hierarchy
// level — hides the level-by-level jumping and blocks edits mid-export. It is
// outside `.react-flow__viewport`, so it never appears in the captured PDF.
export function PdfExportOverlay() {
  const progress = useDiagramExportStore((state) => state.progress);
  if (!progress) return null;

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/40'>
      <div className='flex items-center gap-3 px-5 py-4 rounded-lg shadow-lg bg-elevated border border-default text-sm text-default'>
        <span className='h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block' />
        {progress.total > 0
          ? `Exporting PDF — level ${progress.current} of ${progress.total}`
          : 'Preparing PDF export…'}
      </div>
    </div>
  );
}
