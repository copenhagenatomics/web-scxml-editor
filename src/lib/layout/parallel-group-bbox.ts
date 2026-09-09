/**
 * Pure bounding-box math for the "Parallel State" visual overlay: given the
 * already-laid-out positions/sizes of a container's flattened member nodes
 * (see collectEffectiveStateChildren in state-registry.ts) and the group
 * structure reported by collectAutoParallelGroups, computes the outer
 * wrapper box plus one sub-box per region (for the divider lines between
 * regions). No React/ReactFlow dependency, so this is independently
 * testable and reusable by both the wrapper node and the divider overlay.
 */
import type { AutoParallelGroupInfo } from '@/lib/utils/parallel-group-normalization';

export interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionBBox {
  memberIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParallelGroupBBox {
  parallelId: string;
  containerId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  regions: RegionBBox[];
  /** Absolute x of each vertical divider line, one per gap between
   * horizontally-adjacent regions (left-to-right order), for a plain-line
   * separator between work trees instead of a box drawn around each one. */
  dividerLines: number[];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function unionRect(rects: Box[], padding: number): Box {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * The flat, per-level ELK layout that positions a container's children has
 * no notion of "region" — a region's members can end up interleaved with, or
 * even fully sandwiched inside, another region's x-span. When that happens
 * there is no single straight line that can separate the two work trees, no
 * matter how computeParallelGroupBBoxes's divider midpoint is computed.
 *
 * This computes the minimal set of x-translations (by member id) needed to
 * pull each region into its own contiguous, non-overlapping horizontal band,
 * ordered left-to-right by each region's current leftmost x (so the visual
 * order the user already sees is preserved wherever possible). The leftmost
 * region never moves; each subsequent region is only pushed right — by just
 * enough to clear the previous region's right edge plus `gap` — when it
 * actually overlaps or sits closer than `gap`. A region that's already
 * cleanly separated is left untouched.
 */
export function computeRegionSeparationTranslations(
  groups: AutoParallelGroupInfo[],
  nodeRects: Map<string, NodeRect>,
  gap: number = 80
): Map<string, number> {
  const translations = new Map<string, number>();

  for (const group of groups) {
    const regionSpans: { memberIds: string[]; x: number; width: number }[] = [];
    for (const region of group.regions) {
      const rects = region.memberIds
        .map((id) => nodeRects.get(id))
        .filter((r): r is NodeRect => r !== undefined);
      if (rects.length === 0) continue;
      const minX = Math.min(...rects.map((r) => r.x));
      const maxX = Math.max(...rects.map((r) => r.x + r.width));
      regionSpans.push({ memberIds: region.memberIds, x: minX, width: maxX - minX });
    }
    if (regionSpans.length < 2) continue;

    const ordered = [...regionSpans].sort((a, b) => a.x - b.x);
    let cursorRight = ordered[0].x + ordered[0].width;

    for (let i = 1; i < ordered.length; i++) {
      const region = ordered[i];
      const minAllowedX = cursorRight + gap;
      if (region.x < minAllowedX) {
        const dx = minAllowedX - region.x;
        for (const id of region.memberIds) {
          translations.set(id, dx);
        }
        cursorRight = minAllowedX + region.width;
      } else {
        cursorRight = region.x + region.width;
      }
    }
  }

  return translations;
}

export function computeParallelGroupBBoxes(
  groups: AutoParallelGroupInfo[],
  nodeRects: Map<string, NodeRect>,
  padding: number = 24
): ParallelGroupBBox[] {
  const result: ParallelGroupBBox[] = [];

  for (const group of groups) {
    const regions: RegionBBox[] = [];
    for (const region of group.regions) {
      const rects = region.memberIds
        .map((id) => nodeRects.get(id))
        .filter((r): r is NodeRect => r !== undefined);
      if (rects.length === 0) continue;
      regions.push({ memberIds: region.memberIds, ...unionRect(rects, padding) });
    }
    if (regions.length === 0) continue;

    const outer = unionRect(regions, 0);
    const sortedByX = [...regions].sort((a, b) => a.x - b.x);
    const dividerLines = sortedByX
      .slice(0, -1)
      .map((r, i) => (r.x + r.width + sortedByX[i + 1].x) / 2);

    result.push({
      parallelId: group.parallelId,
      containerId: group.containerId,
      ...outer,
      regions,
      dividerLines,
    });
  }

  return result;
}

export interface LiveNode {
  id: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  data?: {
    isParallelGroupWrapper?: boolean;
    regions?: { memberIds: string[] }[];
    width?: number;
    height?: number;
  };
}

/**
 * Recomputes every visible Parallel State group's divider lines from the
 * CURRENT on-screen node positions, instead of reading the `dividerLines`
 * value a wrapper node's data was given at the last full SCXML re-parse.
 * That baked-in value goes stale the instant a member is dragged: React
 * Flow updates node.position live during a drag (and visual-diagram.tsx's
 * own resync effect can silently drop a just-finished re-parse's fresher
 * value — see its isUpdatingPositionRef gate), but nothing else re-derives
 * data.dividerLines to match. Recomputing here, from the same live `nodes`
 * array the canvas already renders from, keeps the divider lines correct
 * on every frame regardless of that resync's timing.
 */
export function computeLiveParallelDividerXs(nodes: LiveNode[]): number[] {
  const nodeRects = new Map<string, NodeRect>();
  nodes.forEach((n) => {
    nodeRects.set(n.id, {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: n.width ?? n.data?.width ?? 160,
      height: n.height ?? n.data?.height ?? 80,
    });
  });

  const xs: number[] = [];
  nodes.forEach((n) => {
    const regions = n.data?.isParallelGroupWrapper ? n.data.regions : undefined;
    if (!regions || regions.length === 0) return;
    const boxes = computeParallelGroupBBoxes(
      [{ containerId: null, parallelId: n.id, regions }],
      nodeRects
    );
    boxes.forEach((box) => xs.push(...box.dividerLines));
  });
  return xs;
}
