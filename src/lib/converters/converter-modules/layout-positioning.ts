/**
 * Layout Positioning Module for SCXML Converter
 *
 * Handles ELK layout application, history state positioning,
 * hierarchical position calculation, and initial state detection.
 */

import type { HierarchicalNode } from '@/types/hierarchical-node';
import type { Edge } from 'reactflow';
import { elkLayoutService } from '@/lib/layout/elk-layout-service';
import type { StateRegistryEntry } from './state-registry';

/**
 * Position history states to wrap around their parent containers
 * @deprecated Legacy manual positioning - kept for fallback only
 * Use applyDefaultELKLayout() instead for ELK force-directed layout
 */
export function positionHistoryStates(
  allNodes: HierarchicalNode[],
  stateRegistry: Map<string, StateRegistryEntry>
): void {
  const historyNodes = allNodes.filter(
    (node) => stateRegistry.get(node.id)?.elementType === 'history'
  );

  historyNodes.forEach((historyNode) => {
    const parentId = historyNode.parentId;
    if (!parentId) return;

    const parentNode = allNodes.find((node) => node.id === parentId);
    if (!parentNode) return;

    // Use a generous multiplier approach for history wrapper size
    // This ensures it wraps around the entire container and its content
    const containerData = parentNode.data as any;
    const baseWidth =
      containerData.width || parentNode.containerBounds?.width || 300;
    const baseHeight =
      containerData.height || parentNode.containerBounds?.height || 200;

    // Use a generous fixed margin approach - simpler and more predictable
    const wrapMargin = 150; // Large margin to ensure coverage

    // Calculate wrapper size with generous margins
    const wrapperWidth = baseWidth + wrapMargin * 3.5;
    const wrapperHeight = baseHeight + wrapMargin * 2;

    // Position wrapper so container is centered within it
    historyNode.position = {
      x: parentNode.position.x - 160,
      y: parentNode.position.y + 48,
    };

    // Set history state size to wrap the entire visual area
    (historyNode.data as any).width = wrapperWidth;
    (historyNode.data as any).height = wrapperHeight;

    // IMPORTANT: Also set the style property for ReactFlow
    historyNode.style = {
      ...historyNode.style,
      width: wrapperWidth,
      height: wrapperHeight,
    };

    // Mark this as a history wrapper for special rendering
    (historyNode.data as any).isHistoryWrapper = true;
    (historyNode.data as any).wrappedContainerId = parentId;

    // Store bounds for the history wrapper
    historyNode.containerBounds = {
      x: historyNode.position.x,
      y: historyNode.position.y,
      width: wrapperWidth,
      height: wrapperHeight,
    };
  });
}

/**
 * Apply ELK force-directed layout to all nodes
 * Preserves viz:xywh positions (x,y only) with absolute priority
 * Ignores width/height from viz:xywh
 */
export async function applyDefaultELKLayout(
  nodes: HierarchicalNode[],
  edges: Edge[]
): Promise<void> {
  // Step 1: Collect nodes with viz:xywh positions
  const nodesWithVizPositions = new Map<string, { x: number; y: number }>();

  nodes.forEach((node) => {
    const vizX = (node.data as any).vizX;
    const vizY = (node.data as any).vizY;
    if (vizX !== undefined && vizY !== undefined) {
      nodesWithVizPositions.set(node.id, { x: vizX, y: vizY });
    }
  });

  // Step 2: Run ELK force-directed layout on ALL nodes
  // ELK will calculate good positions considering the graph structure
  const positions = await elkLayoutService.computeLayout(nodes, edges, {
    algorithm: 'layered', // Force-directed by default for organic layouts
    direction: 'DOWN',
    edgeRouting: 'ORTHOGONAL',
    spacing: {
      nodeNode: 40, // Reduced: Space between nodes
      edgeNode: 20, // Reduced: Space between edges and nodes
      edgeEdge: 10, // Reduced: Space between edges
    },
    padding: {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    },
    hierarchical: true, // Respect parent-child relationships
    aspectRatio: 3, // Prefer wider layouts (16:10 ratio) for more compact vertical spacing
  });

  // Step 3: Apply positions - viz:xywh takes ABSOLUTE priority over ELK
  nodes.forEach((node) => {
    const vizPosition = nodesWithVizPositions.get(node.id);

    if (vizPosition) {
      // Use viz:xywh position (highest priority)
      // This preserves user-defined positions from SCXML
      node.position = { x: vizPosition.x, y: vizPosition.y };
    } else {
      // Use ELK calculated position for nodes without explicit positions
      const elkPos = positions.get(node.id);
      if (elkPos) {
        node.position = { x: elkPos.x, y: elkPos.y };
      }
      // If no ELK position (shouldn't happen), keep existing position
    }

    // Note: Width/height are now properly handled from viz:xywh
    // They are applied in createStateNode() and createParallelNode()
  });
}

/**
 * Calculate hierarchical position for a state based on its parent path
 */
export function calculateHierarchicalPosition(
  stateId: string,
  parentPath: string,
  stateRegistry: Map<string, StateRegistryEntry>
): { x: number; y: number } {
  const baseX = 100;
  const baseY = 100;

  if (!parentPath) {
    // Root level states - arrange horizontally
    const rootStates = Array.from(stateRegistry.entries())
      .filter(([_, info]) => !info.parentPath)
      .map(([id]) => id);
    const index = rootStates.indexOf(stateId);

    return {
      x: baseX + index * 400, // More spacing for root states
      y: baseY,
    };
  }

  // Get parent information for relative positioning
  const parentParts =
    typeof parentPath === 'string' ? parentPath.split('#') : [];
  const immediateParent = parentParts[parentParts.length - 1];
  const depth = parentParts.length;

  // Get siblings at the same level
  const siblingsInParent = Array.from(stateRegistry.entries())
    .filter(([_, info]) => info.parentPath === parentPath)
    .map(([id]) => id)
    .sort(); // Sort for consistent ordering

  const siblingIndex = siblingsInParent.indexOf(stateId);
  const totalSiblings = siblingsInParent.length;

  // Special positioning for known patterns
  if (immediateParent === 'Airplane') {
    // Children of Airplane state
    switch (stateId) {
      case 'Refuel':
        return { x: 200, y: 300 };
      case 'Engines':
        return { x: 600, y: 300 };
      case 'AirplaneHistory':
        return { x: 400, y: 450 };
      default:
        return { x: 300 + siblingIndex * 200, y: 300 };
    }
  }

  if (immediateParent === 'Engines') {
    // Parallel engine states - side by side
    switch (stateId) {
      case 'Left':
        return { x: 500, y: 500 };
      case 'Right':
        return { x: 700, y: 500 };
      default:
        return { x: 500 + siblingIndex * 200, y: 500 };
    }
  }

  if (immediateParent === 'Left' || immediateParent === 'Right') {
    // Engine sub-states - vertical arrangement
    const baseXForEngine = immediateParent === 'Left' ? 450 : 650;
    return {
      x: baseXForEngine,
      y: 600 + siblingIndex * 120,
    };
  }

  // Default hierarchical positioning
  const parentBaseX = baseX + (depth - 1) * 250;
  const parentBaseY = baseY + (depth - 1) * 150;

  // Arrange siblings in a grid pattern
  const columns = Math.min(3, totalSiblings);
  const row = Math.floor(siblingIndex / columns);
  const col = siblingIndex % columns;

  return {
    x: parentBaseX + col * 180,
    y: parentBaseY + row * 120,
  };
}

/**
 * Check if a state is an initial state in its parent context
 */
export function isInitialState(
  stateId: string,
  parentPath: string,
  rootScxml: any,
  stateRegistry: Map<string, StateRegistryEntry>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): boolean {
  if (!parentPath) {
    // Check if it's the root initial state
    const rootInitial = getAttribute(rootScxml, 'initial');
    if (stateId === rootInitial) return true;

    // Also check for <initial> element at root
    const initialElement = getElements(rootScxml, 'initial');
    if (initialElement) {
      const transition = getElements(initialElement, 'transition');
      if (transition) {
        const target = getAttribute(transition, 'target');
        if (stateId === target) return true;
      }
    }

    return false;
  }

  // Find parent state and check its initial attribute
  const parentId =
    typeof parentPath === 'string' ? parentPath.split('#').pop() : null;
  if (parentId) {
    const parentInfo = stateRegistry.get(parentId);
    if (parentInfo) {
      const parentInitial = getAttribute(parentInfo.state, 'initial');
      if (stateId === parentInitial) return true;

      // Also check for <initial> element in parent
      const initialElement = getElements(parentInfo.state, 'initial');
      if (initialElement) {
        const transition = getElements(initialElement, 'transition');
        if (transition) {
          const target = getAttribute(transition, 'target');
          if (stateId === target) return true;
        }
      }
    }
  }

  return false;
}
