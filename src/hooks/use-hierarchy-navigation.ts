import { useMemo, useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { useEditorStore } from '@/stores/editor-store';

interface UseHierarchyNavigationProps {
  allNodes: Node[];
  allEdges: Edge[];
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
    // When root nodes change and we're not at root, navigate to root
    if (rootNodeIds && hierarchyState.currentPath.length > 0) {
      const currentParentExists = allNodes.some(n => n.id === hierarchyState.currentParentId);
      if (!currentParentExists) {
        navigateToRoot();
      }
    }
  }, [rootNodeIds, hierarchyState.currentPath.length, hierarchyState.currentParentId, allNodes, navigateToRoot]);

  // Filter nodes to only show current hierarchy level
  const filteredNodes = useMemo(() => {
    if (allNodes.length === 0) return [];

    let visibleNodesList: Node[] = [];

    if (!hierarchyState.currentParentId) {
      // At root level - show only nodes without parents
      visibleNodesList = allNodes.filter((node) => !node.parentId);
    } else {
      // Inside a state - show only its direct children
      visibleNodesList = allNodes.filter(
        (node) => node.parentId === hierarchyState.currentParentId
      );
    }

    // Update node data to indicate if they have children (compound states)
    return visibleNodesList.map((node) => {
      const hasChildren = allNodes.some((n) => n.parentId === node.id);

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
  }, [allNodes, hierarchyState.currentParentId, navigateIntoState]);

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

  // Get breadcrumb path for navigation display
  const breadcrumbPath = useMemo(() => {
    if (hierarchyState.currentPath.length === 0) {
      return ['Root'];
    }
    return ['Root', ...hierarchyState.currentPath];
  }, [hierarchyState.currentPath]);

  // Check if we can navigate up
  const canNavigateUp = hierarchyState.currentPath.length > 0;

  // Navigate to a specific level in the breadcrumb
  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index === 0) {
        navigateToRoot();
      } else if (index < hierarchyState.currentPath.length) {
        // Navigate to intermediate level
        const targetPath = hierarchyState.currentPath.slice(0, index);
        const targetParentId = targetPath[targetPath.length - 1] || null;

        // We need to reset to that level
        // For now, we'll navigate up repeatedly
        const stepsUp = hierarchyState.currentPath.length - index;
        for (let i = 0; i < stepsUp; i++) {
          navigateUp();
        }
      }
    },
    [hierarchyState.currentPath, navigateToRoot, navigateUp]
  );

  // Find parent node info for display
  const currentParentNode = useMemo(() => {
    if (!hierarchyState.currentParentId) return null;
    return allNodes.find((n) => n.id === hierarchyState.currentParentId);
  }, [hierarchyState.currentParentId, allNodes]);

  return {
    filteredNodes,
    filteredEdges,
    breadcrumbPath,
    canNavigateUp,
    navigateUp,
    navigateToRoot,
    navigateIntoState,
    navigateToBreadcrumb,
    currentParentNode,
    currentParentId: hierarchyState.currentParentId,
  };
}
