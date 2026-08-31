/**
 * Positions a <parallel> state's regions as side-by-side columns.
 *
 * Each region's own children already carry a position relative to that
 * region (they were converted from XML exactly as if the region were an
 * ordinary compound-state parent, positioned from viz:xywh). This module
 * doesn't re-lay-out anything within a region — it just picks an x-offset
 * per region (based on the widest content in every region before it) and
 * adds that offset to each of the region's children's existing relative
 * position, so regions read left-to-right without their nodes overlapping.
 */

export const REGION_COLUMN_WIDTH = 260;
export const REGION_COLUMN_GAP = 60;
export const REGION_COLUMN_TOP_MARGIN = 90;
export const REGION_COLUMN_PADDING = 40;
export const REGION_FALLBACK_ROW_HEIGHT = 140;

export interface RegionColumnLayout {
  regionId: string;
  regionLabel: string;
  index: number;
  x: number;
  width: number;
}

export interface RegionLayoutNode {
  id: string;
  regionId: string;
  width: number;
  height: number;
  /** Position relative to the region's own origin, if already known (from viz:xywh). */
  relativeX?: number;
  relativeY?: number;
}

export interface RegionLayoutResult {
  columns: RegionColumnLayout[];
  positions: Map<string, { x: number; y: number }>;
  totalWidth: number;
  /** Lowest (y + height) across every positioned node, for sizing dividers/add-buttons. */
  contentBottom: number;
}

export function computeParallelRegionColumns(
  regions: { id: string; label: string }[],
  nodesByRegion: Map<string, RegionLayoutNode[]>
): RegionLayoutResult {
  const columns: RegionColumnLayout[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  let cursorX = 0;
  let contentBottom = REGION_COLUMN_TOP_MARGIN;

  regions.forEach((region, index) => {
    const regionNodes = nodesByRegion.get(region.id) ?? [];

    const contentWidth = regionNodes.reduce((max, node) => {
      const right = (node.relativeX ?? 0) + node.width;
      return Math.max(max, right);
    }, 0);
    const columnWidth = Math.max(REGION_COLUMN_WIDTH, contentWidth + REGION_COLUMN_PADDING);

    let fallbackIndex = 0;
    regionNodes.forEach((node) => {
      const x =
        node.relativeX !== undefined
          ? cursorX + node.relativeX
          : cursorX + (columnWidth - node.width) / 2;
      const y =
        node.relativeY !== undefined
          ? REGION_COLUMN_TOP_MARGIN + node.relativeY
          : REGION_COLUMN_TOP_MARGIN + fallbackIndex * REGION_FALLBACK_ROW_HEIGHT;
      if (node.relativeY === undefined) {
        fallbackIndex += 1;
      }

      positions.set(node.id, { x, y });
      contentBottom = Math.max(contentBottom, y + node.height);
    });

    columns.push({
      regionId: region.id,
      regionLabel: region.label,
      index,
      x: cursorX,
      width: columnWidth,
    });

    cursorX += columnWidth + REGION_COLUMN_GAP;
  });

  return {
    columns,
    positions,
    totalWidth: Math.max(0, cursorX - REGION_COLUMN_GAP),
    contentBottom,
  };
}
