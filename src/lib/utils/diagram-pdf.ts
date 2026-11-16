/**
 * Visual diagram → PDF export.
 *
 * Captures the live ReactFlow canvas (html-to-image on `.react-flow__viewport`)
 * so nodes, edges, markers and labels keep their exact on-screen styling.
 * The canvas only ever shows one hierarchy level, so the export steps through
 * every level (via the caller-supplied `showLevel`) and gives each exactly
 * one page. Page layout decisions live in diagram-pdf-layout.ts.
 *
 * jsPDF and html-to-image are imported dynamically so they only load on export.
 */

import type { Node } from 'reactflow';
import type { jsPDF as JsPDFType } from 'jspdf';
import { isNoteId } from '@/types/visual-metadata';
import {
  capturePixelRatio,
  computeExportLevels,
  contentBounds,
  levelTitle,
  pageSize,
  planLevelPage,
  usableArea,
  FOOTER_HEIGHT,
  PAGE_MARGIN,
  type ExportLevel,
  type LevelPagePlan,
  type Orientation,
  type Rect,
} from './diagram-pdf-layout';

/** What the mounted VisualDiagram exposes for exporting (see diagram-export-store). */
export interface DiagramExportSource {
  /** False while the latest async parse/layout hasn't rendered yet (including the first one). */
  isReady: () => boolean;
  /** The `.react-flow__viewport` element (null if not mounted). */
  getViewportElement: () => HTMLElement | null;
  /** Every node across all hierarchy levels, with original parentId. */
  getAllNodes: () => Node[];
  /** Number of edges ReactFlow currently has for the displayed level. */
  getEdgeCount: () => number;
  /** Parallel-region divider x-positions (flow coords) for the displayed level. */
  getDividerXs: () => number[];
  /** Current theme — the PDF pages follow it (dark mode → dark pages). */
  isDark: () => boolean;
  /** Deselects everything so selection highlights don't end up in the PDF. */
  clearSelection: () => void;
}

export interface DiagramPdfOptions {
  /** Switches the canvas to the given hierarchy level. */
  showLevel: (level: ExportLevel) => void;
  /** Called before each level is captured (1-based). */
  onProgress?: (current: number, total: number) => void;
}

export interface DiagramPdfResult {
  blob: Blob;
  /** Titles of levels that hadn't finished rendering when captured (may be incomplete). */
  incompleteLevels: string[];
}

/** Padding (flow px) around measured content — covers arrowheads and label shadows. */
const CONTENT_PADDING = 24;
/** Per-level render wait; on timeout the level is captured anyway and reported as incomplete. */
const LEVEL_RENDER_TIMEOUT_MS = 4000;
/** First parse includes ELK layout, which can take a while on big machines. */
const DIAGRAM_READY_TIMEOUT_MS = 20000;

/**
 * Page colors per theme: capture background, page fill (null = leave the
 * page white) and RGB colors for header/footer text and the header rule.
 * Dark values match the canvas's slate-900 background.
 */
const THEMES = {
  light: { background: '#ffffff', fill: null, text: [100, 116, 139], rule: [203, 213, 225] },
  dark: { background: '#0f172a', fill: [15, 23, 42], text: [148, 163, 184], rule: [51, 65, 85] },
} as const;

function nextFrame(): Promise<void> {
  // rAF doesn't fire in a background tab — fall back to a timeout.
  return Promise.race([
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 50)),
  ]);
}

/**
 * Waits until the canvas shows exactly the given level: every node of that
 * level is in the DOM, no node of another level still is, and all edges have
 * rendered. Returns false if that didn't happen before the timeout.
 */
async function waitForLevel(source: DiagramExportSource, level: ExportLevel): Promise<boolean> {
  const parentById = new Map(source.getAllNodes().map((n) => [n.id, n.parentId ?? null]));
  const expectedIds = [...parentById].filter(([, parent]) => parent === level.parentId).map(([id]) => id);

  const start = performance.now();
  while (performance.now() - start < LEVEL_RENDER_TIMEOUT_MS) {
    await nextFrame();
    const viewport = source.getViewportElement();
    if (!viewport) continue;

    const domIds = Array.from(viewport.querySelectorAll<HTMLElement>('.react-flow__node'))
      .map((el) => el.dataset.id)
      .filter((id): id is string => Boolean(id));
    const domIdSet = new Set(domIds);
    // DOM nodes the model doesn't know about (if any) are ignored; only a
    // leftover node from a *different* level means the switch isn't done.
    const nodesReady =
      expectedIds.every((id) => domIdSet.has(id)) &&
      domIds.every((id) => !parentById.has(id) || parentById.get(id) === level.parentId);
    const edgesReady = viewport.querySelectorAll('.react-flow__edge').length >= source.getEdgeCount();

    if (nodesReady && edgesReady) {
      // Let handle measurement / edge routing settle.
      await nextFrame();
      await nextFrame();
      return true;
    }
  }
  return false;
}

/**
 * Bounding rects of every rendered node and edge, converted from screen
 * pixels to flow coordinates (dividing out the viewport's current zoom and
 * offset), so the result doesn't depend on how the user had panned/zoomed.
 */
function measureContentRects(viewport: HTMLElement): Rect[] {
  const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a || 1;
  const origin = viewport.getBoundingClientRect();
  return Array.from(viewport.querySelectorAll('.react-flow__node, .react-flow__edge'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      x: (r.left - origin.left) / zoom,
      y: (r.top - origin.top) / zoom,
      width: r.width / zoom,
      height: r.height / zoom,
    }));
}

/**
 * html-to-image copies each element's full computed `cssText`, which in
 * Chrome includes every inherited custom property. Monaco's codicon CSS
 * defines ~1,250 `--vscode-*` variables on :root, so without this every
 * captured element carried ~70 KB of them — a 64-state level produced a
 * 220 MB SVG and took over a minute. The diagram never uses them, so they're
 * reset to `initial` (which drops them from computed style) on the viewport
 * for the duration of the capture. Returns the cleanup function.
 */
function suppressEditorCssVariables(viewport: HTMLElement): () => void {
  const computed = getComputedStyle(viewport);
  const names = Array.from(computed).filter((name) => name.startsWith('--vscode-'));
  if (names.length === 0) return () => {};
  const style = document.createElement('style');
  style.textContent = `.react-flow__viewport { ${names.map((name) => `${name}: initial;`).join(' ')} }`;
  document.head.appendChild(style);
  return () => style.remove();
}

/** Resize handles only appear on a selected node; never include them. */
function captureFilter(node: HTMLElement): boolean {
  return !node.classList?.contains('react-flow__resize-control');
}

/** Truncates `text` with "..." so it fits in `maxWidth` points at the current font. */
function fitText(doc: JsPDFType, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(`${truncated}...`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

/**
 * Redraws the parallel-region divider lines as vector lines. On screen they
 * are an overlay outside `.react-flow__viewport`, so the capture misses them.
 */
function drawDividers(
  doc: JsPDFType,
  bounds: Rect,
  plan: LevelPagePlan,
  dividerXs: number[],
  GState: typeof import('jspdf').GState
) {
  const { offset, scale } = plan;
  const visible = dividerXs.filter((x) => x >= bounds.x && x <= bounds.x + bounds.width);
  if (visible.length === 0) return;

  // Matches ParallelRegionDividerOverlay: 2px dashed rgba(124, 58, 237, 0.5),
  // spanning the full height of the level.
  doc.saveGraphicsState();
  doc.setGState(new GState({ 'stroke-opacity': 0.5 }));
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(2 * scale);
  doc.setLineDashPattern([6 * scale, 4 * scale], 0);
  for (const x of visible) {
    const px = offset.x + (x - bounds.x) * scale;
    doc.line(px, offset.y, px, offset.y + bounds.height * scale);
  }
  doc.restoreGraphicsState();
}

/** Renders every hierarchy level of the diagram into a PDF, one page per level. */
export async function buildDiagramPdf(source: DiagramExportSource, options: DiagramPdfOptions): Promise<DiagramPdfResult> {
  const [{ jsPDF, GState }, { toCanvas, getFontEmbedCSS }] = await Promise.all([
    import('jspdf'),
    import('html-to-image'),
  ]);

  const readySince = performance.now();
  while (!source.isReady()) {
    if (performance.now() - readySince > DIAGRAM_READY_TIMEOUT_MS) {
      throw new Error('Visual diagram did not finish loading in time');
    }
    await nextFrame();
  }

  const theme = source.isDark() ? THEMES.dark : THEMES.light;
  const levels = computeExportLevels(source.getAllNodes(), isNoteId);
  source.clearSelection();

  let doc: JsPDFType | null = null;
  const pageTitles: string[] = [];
  const incompleteLevels: string[] = [];
  let fontEmbedCSS: string | undefined;

  // jsPDF needs the first page's orientation at construction time, so the
  // document is created lazily; every later page sets its own orientation.
  const addPage = (orientation: Orientation, title: string): JsPDFType => {
    if (!doc) {
      doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    } else {
      doc.addPage('a4', orientation);
    }
    if (theme.fill) {
      const { width, height } = pageSize(orientation);
      doc.setFillColor(theme.fill[0], theme.fill[1], theme.fill[2]);
      doc.rect(0, 0, width, height, 'F');
    }
    pageTitles.push(title);
    return doc;
  };

  for (const [index, level] of levels.entries()) {
    options.onProgress?.(index + 1, levels.length);
    options.showLevel(level);
    const title = levelTitle(level);
    if (!(await waitForLevel(source, level))) incompleteLevels.push(title);

    const viewport = source.getViewportElement();
    const bounds = viewport ? contentBounds(measureContentRects(viewport), CONTENT_PADDING) : null;

    if (!viewport || !bounds) {
      const page = addPage('portrait', title);
      const area = usableArea('portrait');
      page.setFont('helvetica', 'italic');
      page.setFontSize(11);
      page.setTextColor(theme.text[0], theme.text[1], theme.text[2]);
      page.text('This level has no states.', area.x + area.width / 2, area.y + 40, { align: 'center' });
      continue;
    }

    fontEmbedCSS ??= await getFontEmbedCSS(viewport);
    const plan = planLevelPage(bounds);
    const width = Math.ceil(bounds.width);
    const height = Math.ceil(bounds.height);
    const restoreEditorCssVariables = suppressEditorCssVariables(viewport);
    let canvas: HTMLCanvasElement;
    try {
      // Captures a copy of the viewport. The `style` override applies to
      // that copy only: it shifts the level's top-left to (0,0) at zoom 1,
      // independent of the live camera (which may still be animating).
      canvas = await toCanvas(viewport, {
        width,
        height,
        pixelRatio: capturePixelRatio(bounds, plan.scale),
        backgroundColor: theme.background,
        fontEmbedCSS,
        filter: captureFilter,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`,
        },
      });
    } finally {
      restoreEditorCssVariables();
    }

    // PNG over JPEG: JPEG was only ~10–15% faster end to end but made files
    // ~4x larger (diagrams are mostly flat colors), and is lossy on small text.
    const page = addPage(plan.orientation, title);
    page.addImage(canvas, 'PNG', plan.offset.x, plan.offset.y, width * plan.scale, height * plan.scale, undefined, 'FAST');
    drawDividers(page, bounds, plan, source.getDividerXs(), GState);
  }

  // Always set in practice (the top level is always exported), but TS can't
  // see the assignment inside addPage, so narrow explicitly.
  if (!doc) throw new Error('Nothing to export');
  const pdf: JsPDFType = doc;

  // Header/footer pass — total page count is only known now.
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(theme.text[0], theme.text[1], theme.text[2]);
    pdf.text(fitText(pdf, pageTitles[i - 1], pageWidth - PAGE_MARGIN * 2), PAGE_MARGIN, PAGE_MARGIN + 8);
    pdf.setDrawColor(theme.rule[0], theme.rule[1], theme.rule[2]);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE_MARGIN, PAGE_MARGIN + 13, pageWidth - PAGE_MARGIN, PAGE_MARGIN + 13);
    pdf.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - PAGE_MARGIN - FOOTER_HEIGHT / 2 + 8, {
      align: 'center',
    });
  }

  return { blob: pdf.output('blob'), incompleteLevels };
}
