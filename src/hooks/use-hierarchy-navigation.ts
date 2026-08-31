import { useMemo, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { useEditorStore } from '@/stores/editor-store';
import { isNoteId } from '@/types/visual-metadata';
import {
  computeParallelRegionColumns,
  type RegionColumnLayout,
  type RegionLayoutNode,
} from '@/lib/layout/region-layout';

interface UseHierarchyNavigationProps {
  allNodes: Node[];
  allEdges: Edge[];
}

export interface RegionSummary {
  id: string;
  label: string;
}

interface RegionInfo {
  regionId: string;
  regionLabel: string;
  regionIndex: number;
}

interface RegionModeSelection {
  /** Every node to show while drilled into a <parallel>: each region's own
   *  children, plus any notes parented directly to the parallel itself
   *  (region mode still needs to surface those — see selectRegionModeNodes). */
  visibleNodes: Node[];
  regionByNodeId: Map<string, RegionInfo>;
}

/**
 * Selects the nodes to show when drilled into a <parallel> state: each
 * region's own children (grandchildren of the parallel), tagged with which
 * region they came from. Notes parented directly to the parallel (added via
 * "Add Note" while inside it) are included too, untagged — they aren't part
 * of any region, but region mode is the only level from which they're ever
 * visible, so they must be unioned in here rather than dropped.
 */
function selectRegionModeNodes(
  allNodes: Node[],
  currentParentNode: Node,
  regions: RegionSummary[]
): RegionModeSelection {
  const regionByNodeId = new Map<string, RegionInfo>();

  const regionChildren = regions.flatMap((region, regionIndex) => {
    const children = allNodes.filter(
      (n) => n.parentId === region.id && !isNoteId(n.id)
    );
    children.forEach((child) => {
      regionByNodeId.set(child.id, { regionId: region.id, regionLabel: region.label, regionIndex });
    });
    return children;
  });

  const directNotes = allNodes.filter(
    (n) => n.parentId === currentParentNode.id && isNoteId(n.id)
  );

  return { visibleNodes: [...regionChildren, ...directNotes], regionByNodeId };
}

/**
 * Repositions an already-tagged (regionId-carrying) node list into
 * side-by-side region columns via Task 3's computeParallelRegionColumns.
 * Nodes without a regionId (e.g. notes parented directly to the parallel)
 * are left at their existing position, unrepositioned.
 */
function applyRegionColumns(
  nodes: Node[],
  regions: RegionSummary[]
): { positioned: Node[]; columns: RegionColumnLayout[]; contentBottom: number } {
  const nodesByRegion = new Map<string, RegionLayoutNode[]>();
  nodes.forEach((node) => {
    const regionId = (node.data as { regionId?: string }).regionId;
    if (!regionId) return;
    const list = nodesByRegion.get(regionId) ?? [];
    list.push({
      id: node.id,
      regionId,
      width: node.width ?? 190,
      height: node.height ?? 90,
      relativeX: node.position?.x,
      relativeY: node.position?.y,
    });
    nodesByRegion.set(regionId, list);
  });

  const { positions, columns, contentBottom } = computeParallelRegionColumns(regions, nodesByRegion);

  const positioned = nodes.map((node) => {
    const pos = positions.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });

  return { positioned, columns, contentBottom };
}

export function useHierarchyNavigation({
  allNodes,
  allEdges,
}: UseHierarchyNavigationProps) {
  const {
    hierarchyState,
    navigateIntoState,
    navigateUp,
    navigateToRoot,
    setVisibleNodes,
  } = useEditorStore();

  // Track root node IDs to detect when a new file is loaded
  const rootNodeIds = useMemo(() => {
    return allNodes
      .filter((node) => !node.parentId)
      .map((n) => n.id)
      .sort()
      .join(',');
  }, [allNodes]);

  // Reset navigation when root nodes change (indicates new file loaded)
  useEffect(() => {
    if (rootNodeIds && hierarchyState.currentPath.length > 0) {
      const currentParentExists = allNodes.some(n => n.id === hierarchyState.currentParentId);
      if (!currentParentExists) {
        navigateToRoot();
      }
    }
  }, [rootNodeIds, hierarchyState.currentPath.length, hierarchyState.currentParentId, allNodes, navigateToRoot]);

  // A <parallel>'s direct children are orthogonal regions, not ordinary
  // substates — region mode auto-expands one extra level so every region's
  // own children render side by side, instead of needing a second drill-in
  // click per region.
  const currentParentNode = useMemo(
    () => allNodes.find((n) => n.id === hierarchyState.currentParentId) ?? null,
    [allNodes, hierarchyState.currentParentId]
  );
  const isParallelRegionMode = currentParentNode?.data?.stateType === 'parallel';

  const regions: RegionSummary[] = useMemo(() => {
    if (!isParallelRegionMode || !currentParentNode) return [];
    return allNodes
      .filter((n) => n.parentId === currentParentNode.id && !isNoteId(n.id))
      .map((n) => ({ id: n.id, label: (n.data?.label as string) ?? n.id }));
  }, [allNodes, isParallelRegionMode, currentParentNode]);

  const { filteredNodes, regionColumns, regionContentBottom } = useMemo(() => {
    if (allNodes.length === 0) {
      return { filteredNodes: [] as Node[], regionColumns: [] as RegionColumnLayout[], regionContentBottom: 0 };
    }

    let visibleNodesList: Node[] = [];
    let regionByNodeId: Map<string, RegionInfo> | null = null;

    if (isParallelRegionMode && currentParentNode) {
      const selection = selectRegionModeNodes(allNodes, currentParentNode, regions);
      visibleNodesList = selection.visibleNodes;
      regionByNodeId = selection.regionByNodeId;
    } else if (!hierarchyState.currentParentId) {
      visibleNodesList = allNodes.filter((node) => !node.parentId);
    } else {
      visibleNodesList = allNodes.filter(
        (node) => node.parentId === hierarchyState.currentParentId
      );
    }

    // Update node data to indicate if they have children (compound states).
    // Notes are annotations, not structural children, so they must never
    // make a state look/behave like a compound (navigable) state.
    const withMetadata = visibleNodesList.map((node) => {
      const hasChildren = allNodes.some(
        (n) => n.parentId === node.id && !isNoteId(n.id)
      );
      const regionInfo = regionByNodeId?.get(node.id);

      return {
        ...node,
        // Remove parentId for hierarchy navigation since parent is not rendered
        parentId: undefined,
        data: {
          ...node.data,
          hasChildren,
          isCompound: hasChildren,
          stateType:
            node.data.stateType || (hasChildren ? 'compound' : 'simple'),
          // Add navigation handler for all states (even empty ones)
          onNavigateInto: () => navigateIntoState(node.id),
          ...(regionInfo && {
            regionId: regionInfo.regionId,
            regionLabel: regionInfo.regionLabel,
            regionIndex: regionInfo.regionIndex,
          }),
        },
        // Update visual style for compound states
        style: {
          ...node.style,
          // Use only non-shorthand properties to avoid React warnings
          // borderStyle: hasChildren ? 'dashed' : 'solid',
          // borderWidth: hasChildren ? 2 : 1,
          // borderColor: node.style?.borderColor || '#9ca3af',
          // Ensure proper sizing for compound state indicators
          minWidth: 160,
          minHeight: 80,
        },
      };
    });

    if (!isParallelRegionMode || regions.length === 0) {
      return { filteredNodes: withMetadata, regionColumns: [], regionContentBottom: 0 };
    }

    // Offset each region's nodes into side-by-side columns. Each node's
    // existing position was converted as if its region were a normal
    // compound-state parent, so it's already relative to that region's
    // own origin — applyRegionColumns just adds a per-region x-offset on
    // top of it (notes with no regionId are left where they were).
    const { positioned, columns, contentBottom } = applyRegionColumns(withMetadata, regions);

    return { filteredNodes: positioned, regionColumns: columns, regionContentBottom: contentBottom };
  }, [allNodes, hierarchyState.currentParentId, navigateIntoState, isParallelRegionMode, currentParentNode, regions]);

  // Update visible nodes in store when filtered nodes change
  useEffect(() => {
    const visibleIds = new Set(filteredNodes.map((n) => n.id));
    setVisibleNodes(visibleIds);
  }, [filteredNodes, setVisibleNodes]);

  // Filter edges to only show connections between visible nodes
  const filteredEdges = useMemo(() => {
    if (filteredNodes.length === 0) return [];

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    return allEdges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [allEdges, filteredNodes]);

  // Check if we can navigate up
  const canNavigateUp = hierarchyState.currentPath.length > 0;

  return {
    filteredNodes,
    filteredEdges,
    canNavigateUp,
    navigateUp,
    navigateToRoot,
    navigateIntoState,
    currentParentId: hierarchyState.currentParentId,
    isParallelRegionMode,
    regions,
    regionColumns,
    regionContentBottom,
  };
}
