'use client';

import { useCallback, useMemo, useRef } from 'react';
import type { TabType } from '@/components/layout';
import type { DiagramExportSource } from '@/lib/utils/diagram-pdf';
import { useDiagramExportStore } from '@/stores/diagram-export-store';
import { useEditorStore } from '@/stores/editor-store';
import { useHostAPIStore } from '@/stores/host-api-store';

/** How long PDF export waits for the Visual tab's diagram to mount after switching to it. */
const DIAGRAM_MOUNT_TIMEOUT_MS = 5000;

/** Resolves once the VisualDiagram has mounted and registered itself for export. */
function waitForDiagramSource(): Promise<DiagramExportSource> {
  const current = useDiagramExportStore.getState().source;
  if (current) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Visual diagram did not mount in time'));
    }, DIAGRAM_MOUNT_TIMEOUT_MS);
    const unsubscribe = useDiagramExportStore.subscribe((state) => {
      if (!state.source) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(state.source);
    });
  });
}

export function useDownload() {
  const content = useEditorStore(state => state.content);
  const fileInfo = useEditorStore(state => state.fileInfo);

  const downloadFilename = useMemo(() => fileInfo?.name ?? 'document.scxml', [fileInfo]);

  // Strings are SCXML text; a ready-made Blob (the PDF) is downloaded as-is.
  const downloadBlob = useCallback((fileContent: string | Blob, fileName: string) => {
    const blob = typeof fileContent === 'string'
      ? new Blob([fileContent], { type: 'application/xml' })
      : fileContent;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadWithVisualData = useCallback(() => {
    downloadBlob(content, downloadFilename);
  }, [content, downloadBlob, downloadFilename]);

  const handleDownloadClean = useCallback(async () => {
    try {
      const { removeVisualMetadataFromXML } = await import('@/lib/utils/visual-metadata-utils');
      const { SCXMLParser: Parser } = await import('@/lib/parsers/scxml-parser');
      const cleanParser = new Parser();
      const parseResult = cleanParser.parse(content);
      const cleanName = downloadFilename.replace(/\.(scxml|xml)$/i, '-clean.$1');
      if (parseResult.success && parseResult.data) {
        downloadBlob(cleanParser.serialize(parseResult.data, false), cleanName);
      } else {
        downloadBlob(removeVisualMetadataFromXML(content), cleanName);
      }
    } catch {
      downloadBlob(content, downloadFilename);
    }
  }, [content, downloadBlob, downloadFilename]);

  // Exports the visual diagram (every hierarchy level) as a PDF. The diagram
  // only exists while the Visual tab is mounted and only shows one level at a
  // time, so this temporarily switches tab/level and restores both afterwards.
  const isExportingPdfRef = useRef(false);
  const handleDownloadPdf = useCallback(async (activeTab: TabType, setActiveTab: (tab: TabType) => void) => {
    if (isExportingPdfRef.current) return;
    isExportingPdfRef.current = true;

    const { setProgress } = useDiagramExportStore.getState();
    const { showFeedback } = useHostAPIStore.getState();
    // Show the overlay right away (0 of 0 = "preparing"), before the tab switch.
    setProgress({ current: 0, total: 0 });

    const savedHierarchy = useEditorStore.getState().hierarchyState;
    if (activeTab !== 'visual') setActiveTab('visual');

    try {
      const source = await waitForDiagramSource();
      const { buildDiagramPdf } = await import('@/lib/utils/diagram-pdf');
      const { blob, incompleteLevels } = await buildDiagramPdf(source, {
        showLevel: (level) =>
          useEditorStore.setState((state) => ({
            hierarchyState: {
              ...state.hierarchyState,
              currentPath: level.path,
              currentParentId: level.parentId,
              visibleNodes: new Set(),
            },
          })),
        onProgress: (current, total) => setProgress({ current, total }),
      });
      downloadBlob(blob, downloadFilename.replace(/\.(scxml|xml)$/i, '') + '.pdf');
      if (incompleteLevels.length > 0) {
        showFeedback(
          `PDF exported, but these levels didn't finish rendering and may be incomplete: ${incompleteLevels.join(', ')}`,
          'warning'
        );
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showFeedback('PDF export failed. See the browser console for details.', 'error');
    } finally {
      useEditorStore.setState({ hierarchyState: savedHierarchy });
      if (activeTab !== 'visual') setActiveTab(activeTab);
      setProgress(null);
      isExportingPdfRef.current = false;
    }
  }, [downloadBlob, downloadFilename]);

  return { handleDownloadClean, handleDownloadWithVisualData, handleDownloadPdf };
}
