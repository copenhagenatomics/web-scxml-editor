/**
 * Layout Positioning Module for SCXML Converter
 *
 * Handles ELK layout application, history state positioning,
 * hierarchical position calculation, and initial state detection.
 */

import type { HierarchicalNode } from '@/types/hierarchical-node';
import type { Edge } from 'reactflow';
import { elkLayoutService } from '@/lib/layout/elk-layout-service';
import { computeAdaptiveSpacing } from '@/lib/layout/adaptive-spacing';
import { computeHubCentroidNudges } from '@/lib/layout/hub-centroid-nudge';
import { shouldWrapLevel } from '@/lib/layout/chain-wrapping';
import { parseStateIdList } from '@/lib/validators/validator-utils';
import {
  computeParallelGroupBBoxes,
  computeRegionSeparationTranslations,
  type NodeRect,
} from '@/lib/layout/parallel-group-bbox';
import type { AutoParallelGroupInfo } from '@/lib/utils/parallel-group-normalization';
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
 * Pulls each region of every auto-wrapped Initial-state group into its own
 * contiguous, non-overlapping horizontal band. The flat, per-level layout
 * `applyDefaultELKLayout` produces has no notion of "region" — a region's
 * members can end up interleaved with, or even fully sandwiched inside,
 * another region's x-span, which makes a single straight divider line
 * (see computeParallelGroupBBoxes/ParallelRegionDividerOverlay) impossible
 * to place correctly no matter how its midpoint is computed.
 *
 * Mutates node positions in place (x only — y is left untouched). Must run
 * after layout has assigned every member node its position, and before
 * computeParallelGroupWrapperNodes computes the wrapper/divider geometry
 * from those positions.
 */
export function separateParallelRegions(
  allNodes: HierarchicalNode[],
  groups: AutoParallelGroupInfo[]
): void {
  if (groups.length === 0) return;

  const nodeRects = new Map<string, NodeRect>();
  allNodes.forEach((n) => {
    const data = n.data as any;
    nodeRects.set(n.id, {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: data?.width || 160,
      height: data?.height || 80,
    });
  });

  const translations = computeRegionSeparationTranslations(groups, nodeRects);
  if (translations.size === 0) return;

  allNodes.forEach((n) => {
    const dx = translations.get(n.id);
    if (dx) {
      n.position = { ...n.position, x: n.position.x + dx };
    }
  });
}

/**
 * Flags every real member node of every auto-wrapped Initial-state group
 * with `data.isParallelGroupMember = true`. Consumed downstream (see
 * resolveEnhancedNodePosition in visual-diagram.tsx) so a node's saved
 * viz:xywh position — normally given priority so a manually-placed node
 * never "jumps" — is never re-applied on top of this converter's own
 * position for a group member, which would silently undo
 * separateParallelRegions' work the moment the member's *old*, pre-grouping
 * position happened to already be saved.
 */
export function markParallelGroupMembers(
  allNodes: HierarchicalNode[],
  groups: AutoParallelGroupInfo[]
): void {
  if (groups.length === 0) return;

  const memberIds = new Set<string>();
  for (const group of groups) {
    for (const region of group.regions) {
      for (const id of region.memberIds) memberIds.add(id);
    }
  }
  if (memberIds.size === 0) return;

  allNodes.forEach((n) => {
    if (memberIds.has(n.id)) {
      (n.data as any).isParallelGroupMember = true;
    }
  });
}

/**
 * Synthesizes one "Parallel State" wrapper node per auto-wrapped group (see
 * collectAutoParallelGroups), sized/positioned from the union bounding box
 * of its already-laid-out flattened member nodes. Never drillable/selectable
 * as a state in its own right — no visible border/background/label at all
 * (see ParallelGroupWrapperNode); the only visual cue is the full-height
 * divider lines drawn separately by ParallelRegionDividerOverlay.
 *
 * pointer-events:auto here means the whole node area is a drag zone
 * (`dragHandle` targets the entire node, not just a small sub-element), so
 * the group can be grabbed from any empty space within its bounds and
 * dragged as a unit — visual-diagram.tsx translates every member node by
 * the same delta, since there's no real React Flow parent-child
 * relationship to move them automatically. Real member nodes still render
 * at the same flattened level as before wrapping (see
 * collectEffectiveStateChildren in state-registry.ts) as separate, later-
 * painted elements, so a click that actually lands on a member reaches it
 * first — this relies on the wrapper node being inserted FIRST into the
 * node array by the caller (scxml-to-xstate.ts uses unshift, not push), so
 * it's earliest in DOM order and therefore paints below every member node
 * at the tied z-index:0 stacking level.
 *
 * Run after normal layout has positioned every node.
 */
export function computeParallelGroupWrapperNodes(
  allNodes: HierarchicalNode[],
  groups: AutoParallelGroupInfo[]
): HierarchicalNode[] {
  const nodeRects = new Map<string, NodeRect>();
  allNodes.forEach((n) => {
    const data = n.data as any;
    nodeRects.set(n.id, {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: data?.width || 160,
      height: data?.height || 80,
    });
  });

  const boxes = computeParallelGroupBBoxes(groups, nodeRects);

  return boxes.map(
    (box) =>
      ({
        id: box.parallelId,
        type: 'scxmlParallelGroupWrapper',
        position: { x: box.x, y: box.y },
        parentId: box.containerId ?? undefined,
        depth: 0,
        selectable: false,
        draggable: true,
        dragHandle: '.parallel-group-drag-handle',
        connectable: false,
        zIndex: 0,
        style: { width: box.width, height: box.height, zIndex: 0, pointerEvents: 'auto' },
        data: {
          label: box.parallelId,
          stateType: 'parallel',
          isParallelGroupWrapper: true,
          width: box.width,
          height: box.height,
          memberIds: box.regions.flatMap((r) => r.memberIds),
          regions: box.regions.map((r) => ({ memberIds: r.memberIds })),
          dividerLines: box.dividerLines,
        },
      }) as unknown as HierarchicalNode
  );
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

  const ELK_OPTIONS = {
    algorithm: 'layered' as const,
    direction: 'DOWN' as const,
    edgeRouting: 'ORTHOGONAL' as const,
    spacing: { nodeNode: 40, edgeNode: 20, edgeEdge: 10 },
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    // Flat per-level layout — compound nodes are treated as leaves with their
    // visual size, preventing ELK from expanding them to fit children and
    // scattering siblings far apart.
    hierarchical: false,
    aspectRatio: 3,
  };

  // Row-to-row gap for wrapped levels — wide enough for a transition label
  // chip plus the arrows entering/exiting it on both sides.
  const WRAPPED_ROW_GAP = 100;

  // Step 2: Run ELK per hierarchy level so each compound node is sized by its
  // own visual dimensions, not by the space its children need.
  //
  // Collect all distinct parentId values (null = root level).
  const levels = new Set<string | null>([null]);
  nodes.forEach((n) => { if (n.parentId) levels.add(n.parentId); });

  const allPositions = new Map<string, { x: number; y: number }>();

  for (const parentId of levels) {
    const levelNodes = nodes.filter((n) =>
      parentId === null ? !n.parentId : n.parentId === parentId
    );
    if (levelNodes.length === 0) continue;

    const levelNodeIds = new Set(levelNodes.map((n) => n.id));
    // Only pass edges where both endpoints are visible at this level.
    const levelEdges = edges.filter(
      (e) => levelNodeIds.has(e.source) && levelNodeIds.has(e.target)
    );

    // A level with a hub (one node whose degree is a clear outlier among its
    // siblings) gets more node-node spacing than a plain chain/tree — that
    // hub's many neighbors need room to fan their edges and labels apart.
    // Ordinary levels keep ELK's default spacing untouched.
    const levelSpacing = computeAdaptiveSpacing(levelNodes, levelEdges);
    // A chain long enough to matter gets folded into multiple rows/columns —
    // ELK's layered algorithm otherwise puts one node per layer and stacks a
    // long sequence into a single tall column regardless of aspectRatio.
    const wrapping = shouldWrapLevel(levelNodes.length);
    // Wrapped rows need extra vertical room: the transition label chip and
    // its connecting arrows live entirely in the row-to-row gap, which ELK
    // has no notion of (it doesn't see the app's rendered edge labels).
    const levelOptions = {
      ...ELK_OPTIONS,
      spacing: {
        ...ELK_OPTIONS.spacing,
        nodeNode: levelSpacing,
        ...(wrapping && { nodeNodeBetweenLayers: WRAPPED_ROW_GAP }),
      },
      wrapping,
    };

    const levelPositions = await elkLayoutService.computeLayout(
      levelNodes,
      levelEdges,
      levelOptions
    );

    // ELK's layered algorithm has no notion of hub centrality — a node with
    // far more neighbors than its siblings can end up off to one side of its
    // spokes, forcing every edge on that side into a long detour. Nudge only
    // genuine degree outliers back toward the horizontal centroid of their
    // neighbors; every other node keeps its ELK position untouched.
    const nudgeNodes = levelNodes
      .map((n) => {
        const pos = levelPositions.get(n.id);
        if (!pos) return null;
        const width = (n.data as any).width || 160;
        const height = (n.data as any).height || 80;
        return { id: n.id, x: pos.x, y: pos.y, width, height };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
    const nudges = computeHubCentroidNudges(nudgeNodes, levelEdges, {
      minGap: levelSpacing,
    });

    levelPositions.forEach((pos, id) => {
      const nudge = nudges.get(id);
      allPositions.set(id, nudge ?? { x: pos.x, y: pos.y });
    });
  }

  // Step 3: Apply positions — viz:xywh takes ABSOLUTE priority over ELK
  nodes.forEach((node) => {
    const vizPosition = nodesWithVizPositions.get(node.id);

    if (vizPosition) {
      node.position = { x: vizPosition.x, y: vizPosition.y };
    } else {
      const elkPos = allPositions.get(node.id);
      if (elkPos) {
        node.position = { x: elkPos.x, y: elkPos.y };
      }
    }
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
 * Recovers Initial status for a state flattened out of an auto-wrapped
 * <parallel viz:auto-parallel="true"> child of `container` (see
 * src/lib/utils/parallel-group-normalization.ts and
 * collectEffectiveStateChildren in state-registry.ts) — once wrapped, the
 * container's own @_initial names the <parallel>'s id, not any member's id
 * anymore, so the normal @_initial / <initial> checks above no longer see
 * it. A member is Initial when it's the sole state of a bare region, or the
 * @_initial target of a multi-member viz:auto-region wrapper.
 */
function isInitialViaAutoParallel(
  stateId: string,
  container: any,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): boolean {
  const parallels = getElements(container, 'parallel');
  const parallelArray = parallels ? (Array.isArray(parallels) ? parallels : [parallels]) : [];

  for (const parallel of parallelArray) {
    if (getAttribute(parallel, 'viz:auto-parallel') !== 'true') continue;

    const regions = getElements(parallel, 'state');
    const regionArray = regions ? (Array.isArray(regions) ? regions : [regions]) : [];
    for (const region of regionArray) {
      if (getAttribute(region, 'viz:auto-region') === 'true') {
        if (getAttribute(region, 'initial') === stateId) return true;
      } else if (getAttribute(region, 'id') === stateId) {
        return true;
      }
    }
  }

  return false;
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
  const allIds = new Set(stateRegistry.keys());

  if (!parentPath) {
    // Check if it's one of the (possibly multiple) root initial states
    // getAttribute('initial') falls back to the unprefixed 'initial' property
    // when '@_initial' is absent — but that property is also where the
    // parsed <initial> CHILD ELEMENT lives (a different, valid SCXML form),
    // so the typeof guard is required: without it, a state using the
    // <initial> element form (no attribute) gets that element object here
    // instead of undefined, and parseStateIdList would throw on it.
    const rootInitial = getAttribute(rootScxml, 'initial');
    if (
      typeof rootInitial === 'string' &&
      rootInitial &&
      parseStateIdList(rootInitial, allIds).includes(stateId)
    ) {
      return true;
    }

    // Also check for <initial> element at root
    const initialElement = getElements(rootScxml, 'initial');
    if (initialElement) {
      const transition = getElements(initialElement, 'transition');
      if (transition) {
        const target = getAttribute(transition, 'target');
        if (stateId === target) return true;
      }
    }

    return isInitialViaAutoParallel(stateId, rootScxml, getAttribute, getElements);
  }

  // Find parent state and check its (possibly multiple) initial ids
  const parentId =
    typeof parentPath === 'string' ? parentPath.split('#').pop() : null;
  if (parentId) {
    const parentInfo = stateRegistry.get(parentId);
    if (parentInfo) {
      const parentInitial = getAttribute(parentInfo.state, 'initial');
      if (
        typeof parentInitial === 'string' &&
        parentInitial &&
        parseStateIdList(parentInitial, allIds).includes(stateId)
      ) {
        return true;
      }

      // Also check for <initial> element in parent
      const initialElement = getElements(parentInfo.state, 'initial');
      if (initialElement) {
        const transition = getElements(initialElement, 'transition');
        if (transition) {
          const target = getAttribute(transition, 'target');
          if (stateId === target) return true;
        }
      }

      return isInitialViaAutoParallel(stateId, parentInfo.state, getAttribute, getElements);
    }
  }

  return false;
}
