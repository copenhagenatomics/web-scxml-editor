import { create } from 'zustand';
import type { DiagramExportSource } from '@/lib/utils/diagram-pdf';

// The mounted VisualDiagram registers itself here so the toolbar's "Export
// PDF" action (which lives outside the ReactFlowProvider) can capture it.
// Null whenever the Visual tab isn't mounted.
interface DiagramExportState {
  source: DiagramExportSource | null;
  setSource: (source: DiagramExportSource | null) => void;
  /** Non-null while a PDF export is running; drives the progress overlay. */
  progress: { current: number; total: number } | null;
  setProgress: (progress: { current: number; total: number } | null) => void;
}

export const useDiagramExportStore = create<DiagramExportState>((set) => ({
  source: null,
  setSource: (source) => set({ source }),
  progress: null,
  setProgress: (progress) => set({ progress }),
}));
