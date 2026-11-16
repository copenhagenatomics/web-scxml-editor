/**
 * Pure page-layout math for the diagram PDF export (no DOM / jsPDF here, so
 * it can be unit-tested directly). See diagram-pdf.ts for the capture side.
 *
 * Every hierarchy level gets exactly one A4 page: the whole level is scaled
 * to fit, centered, on whichever orientation lets it be drawn largest.
 *
 * Units: diagram ("flow") coordinates are ReactFlow canvas pixels at zoom 1;
 * page coordinates are PDF points. `scale` is points per flow pixel.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Orientation = 'portrait' | 'landscape';

/** One hierarchy level to export — the canvas only ever shows one at a time. */
export interface ExportLevel {
  /** null for the top level, otherwise the compound state whose children are shown. */
  parentId: string | null;
  /** Ancestor ids from the top level down to (and including) parentId. */
  path: string[];
}

export interface LevelPagePlan {
  orientation: Orientation;
  /** PDF points per flow pixel. */
  scale: number;
  /** Where the level's bounds' top-left lands on the page, in points. */
  offset: { x: number; y: number };
}

/** A4 in PDF points (72 pt = 1 inch). */
const A4 = { width: 595.28, height: 841.89 };
/** Page margin on every side; the header and footer bands sit inside it. */
export const PAGE_MARGIN = 36;
const HEADER_HEIGHT = 22;
export const FOOTER_HEIGHT = 18;

/** Small levels are enlarged to fill the page, but not beyond this. */
export const MAX_SCALE = 1.5;

/** Capture resolution: enough for print at this DPI... */
const PRINT_DPI = 300;
/** ...and at least this many image pixels per canvas pixel, so zooming in the PDF stays sharp. */
const ZOOM_PIXEL_RATIO = 2;
/** Chrome's maximum canvas side; html-to-image silently shrinks anything larger. */
const MAX_CANVAS_SIDE = 16384;
/** Memory / PNG-encode-time budget per level (32 MP ≈ 128 MB of RGBA). */
const MAX_CANVAS_PIXELS = 32_000_000;

/** A4 page size in points for the given orientation. */
export function pageSize(orientation: Orientation): { width: number; height: number } {
  return orientation === 'portrait'
    ? { width: A4.width, height: A4.height }
    : { width: A4.height, height: A4.width };
}

/** Printable area of a page (inside margins, between header and footer). */
export function usableArea(orientation: Orientation): Rect {
  const { width, height } = pageSize(orientation);
  return {
    x: PAGE_MARGIN,
    y: PAGE_MARGIN + HEADER_HEIGHT,
    width: width - PAGE_MARGIN * 2,
    height: height - PAGE_MARGIN * 2 - HEADER_HEIGHT - FOOTER_HEIGHT,
  };
}

/** Union of all rects, grown by `padding` on every side. Null when there are no rects. */
export function contentBounds(rects: Rect[], padding = 0): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Fits a whole level onto one page: picks the orientation that allows the
 * larger scale (this accounts for the header/footer, unlike a plain aspect
 * ratio check), caps enlargement at MAX_SCALE, and centers the result.
 */
export function planLevelPage(bounds: Rect): LevelPagePlan {
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);

  const fitFor = (orientation: Orientation) => {
    const area = usableArea(orientation);
    return Math.min(area.width / width, area.height / height);
  };
  const portraitFit = fitFor('portrait');
  const landscapeFit = fitFor('landscape');

  const orientation: Orientation = landscapeFit > portraitFit ? 'landscape' : 'portrait';
  const scale = Math.min(Math.max(portraitFit, landscapeFit), MAX_SCALE);
  const area = usableArea(orientation);

  return {
    orientation,
    scale,
    offset: {
      x: area.x + (area.width - width * scale) / 2,
      y: area.y + (area.height - height * scale) / 2,
    },
  };
}

/**
 * Image pixels per flow pixel for capturing a level: the larger of what
 * PRINT_DPI needs at the page scale and ZOOM_PIXEL_RATIO, reduced only as
 * far as browser canvas limits / the memory budget require.
 */
export function capturePixelRatio(bounds: Rect, scale: number): number {
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const desired = Math.max((scale * PRINT_DPI) / 72, ZOOM_PIXEL_RATIO);
  const limit = Math.min(
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
  );
  return Math.min(desired, limit);
}

/**
 * Every hierarchy level to export, depth-first: the top level, then each
 * state that has (non-note) children, in document order. Mirrors
 * useHierarchyNavigation's notion of a navigable compound state.
 */
export function computeExportLevels(
  nodes: Array<{ id: string; parentId?: string | null }>,
  isNote: (id: string) => boolean
): ExportLevel[] {
  const childrenOf = new Map<string | null, string[]>();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    const list = childrenOf.get(key) ?? [];
    list.push(node.id);
    childrenOf.set(key, list);
  }
  const hasRealChildren = (id: string) => (childrenOf.get(id) ?? []).some((childId) => !isNote(childId));

  const levels: ExportLevel[] = [{ parentId: null, path: [] }];
  const visit = (parentId: string | null, path: string[]) => {
    for (const childId of childrenOf.get(parentId) ?? []) {
      if (isNote(childId) || !hasRealChildren(childId)) continue;
      const childPath = [...path, childId];
      levels.push({ parentId: childId, path: childPath });
      visit(childId, childPath);
    }
  };
  visit(null, []);
  return levels;
}

export function levelTitle(level: ExportLevel): string {
  return level.path.length === 0 ? 'Top level' : level.path.join(' / ');
}
