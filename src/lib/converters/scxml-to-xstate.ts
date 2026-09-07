import type { SCXMLStateNodeData } from '@/components/diagram';
import { ContainerLayoutManager } from '@/lib/layout/container-layout-manager';
import { nodeDimensionCalculator } from '@/lib/layout/node-dimension-calculator';
import type {
  HierarchicalLayout,
  HierarchicalNode,
} from '@/types/hierarchical-node';
import type { SCXMLDocument } from '@/types/scxml';
import type { Edge, Node } from 'reactflow';

// Import converter modules
import {
  buildActionOrderMap,
  collectAllTransitions,
  extractActionsText,
  type ActionTag,
} from './converter-modules/edge-conversion';
import { toSafeId } from './converter-modules/id-mapping';
import {
  applyDefaultELKLayout,
  isInitialState,
  positionHistoryStates,
} from './converter-modules/layout-positioning';
import {
  getAncestorChain,
  registerAllStates,
  type StateRegistryEntry,
} from './converter-modules/state-registry';
import {
  convertDataModel,
  extractVisualMetadata,
  getAttribute,
  getElements,
  writeLayoutToSCXML,
  type EdgeHandleEntry,
} from './converter-modules/visual-metadata';
import {
  ensureNoteIds,
  extractNoteNodes,
  notesNeedIds,
} from './converter-modules/note-conversion';
import {
  approximateOrthogonalRoute,
  countRouteCrossings,
  getHandleAnchor,
  type Rect,
} from '@/lib/layout/edge-obstacle-utils';

/**
 * Converts SCXML documents to XState v5 machine configurations and React Flow diagram data
 */

export class SCXMLToXStateConverter {
  private stateRegistry: Map<string, StateRegistryEntry> = new Map();
  private hierarchyMap: Map<string, string[]> = new Map(); // parent -> children mapping
  private parentMap: Map<string, string> = new Map(); // child -> parent mapping
  private rootScxml: any = null;
  private claimedStates: Set<string> = new Set(); // Track states already claimed by their parent
  private edgePairCounts: Map<string, number> = new Map(); // Track edge pairs for handle assignment

  // Map original IDs to safe IDs (without dots) and vice versa
  private idToSafeId: Map<string, string> = new Map();
  private safeIdToId: Map<string, string> = new Map();

  // Store original SCXML content for write-back
  private originalScxmlContent: string = '';

  // True document order of onentry/onexit action children per state id,
  // used to fix up the type-grouped order the primary XML parser produces.
  private actionOrderMap: Map<string, { onentry: ActionTag[]; onexit: ActionTag[] }> = new Map();

  // Store initialized SCXML content (with viz:xywh added)
  private initializedSCXML: string | null = null;

  /**
   * Wrapper method for toSafeId - delegates to module function
   */
  private toSafeId(id: string | null | undefined): string | null | undefined {
    return toSafeId(id, this.idToSafeId, this.safeIdToId);
  }

  /**
   * Wrapper method for getAttribute - delegates to module function
   */
  private getAttribute(element: any, attrName: string): string | undefined {
    return getAttribute(element, attrName);
  }

  /**
   * Wrapper method for getElements - delegates to module function
   */
  private getElements(parent: any, elementName: string): any {
    return getElements(parent, elementName);
  }

  /**
   * Convert SCXML document to React Flow nodes and edges with ELK force-directed layout
   * @async This method is async because it uses ELK layout computation
   */
  async convertToReactFlow(
    scxmlDoc: SCXMLDocument,
    originalXmlContent?: string
  ): Promise<{
    nodes: Node[];
    edges: Edge[];
    initializedSCXML?: string | null;
  }> {
    const scxml = scxmlDoc.scxml;
    this.rootScxml = scxml;

    // Store original content for potential write-back
    if (originalXmlContent) {
      this.originalScxmlContent = originalXmlContent;
      this.actionOrderMap = buildActionOrderMap(originalXmlContent);
    }

    // Reset initialized SCXML
    this.initializedSCXML = null;

    // Parse datamodel to get context
    const dataModel = this.getElements(scxml, 'datamodel');
    if (dataModel) {
      convertDataModel(dataModel, getElements, getAttribute);
    }

    // First, ensure state registry is populated
    if (this.stateRegistry.size === 0) {
      this.stateRegistry.clear();
      this.hierarchyMap.clear();
      this.parentMap.clear();
      this.claimedStates.clear();
      this.idToSafeId.clear();
      this.safeIdToId.clear();
      registerAllStates(
        scxml,
        '',
        this.stateRegistry,
        this.hierarchyMap,
        this.parentMap,
        this.claimedStates,
        getAttribute,
        getElements
      );
    }

    const layoutManager = new ContainerLayoutManager();
    const hierarchicalLayout = await this.createHierarchicalLayout(
      layoutManager
    );

    // Append post-it note nodes AFTER layout so ELK, dimension calculation
    // and the layout write-back never touch them
    const noteNodes = extractNoteNodes(scxml);

    // Persist ids for legacy notes that lack viz:id, piggybacking on the
    // initialization write-back (the diagram re-derives from the result)
    if (notesNeedIds(scxml)) {
      const withNoteIds = ensureNoteIds(
        this.initializedSCXML || this.originalScxmlContent
      );
      if (withNoteIds) {
        this.initializedSCXML = withNoteIds;
      }
    }

    return {
      nodes: [...hierarchicalLayout.nodes, ...noteNodes],
      edges: hierarchicalLayout.edges,
      initializedSCXML: this.initializedSCXML,
    };
  }

  /**
   * Create hierarchical layout with ELK force-directed positioning
   * Preserves viz:xywh positions with absolute priority
   */
  private async createHierarchicalLayout(
    layoutManager: ContainerLayoutManager
  ): Promise<HierarchicalLayout> {
    const allNodes: HierarchicalNode[] = [];
    const edges: Edge[] = [];

    // First pass: Create all nodes with basic information
    const stateEntries = Array.from(this.stateRegistry.entries());

    for (const [stateId, stateInfo] of stateEntries) {
      const node = this.createHierarchicalNode(stateId, stateInfo);
      if (node) {
        allNodes.push(node);
      }
    }

    // Filter to only include root-level nodes (nodes without parents) for ReactFlow
    // Also exclude history states from root nodes since they wrap containers
    const rootNodes = allNodes.filter(
      (node) =>
        !node.parentId &&
        this.stateRegistry.get(node.id)?.elementType !== 'history'
    );

    // No longer need to attach descendants - using native parent-child relationships

    // Reset edge pair counts for handle assignment
    this.edgePairCounts.clear();

    // Collect all transitions/edges BEFORE layout
    // ELK needs edges to calculate optimal node positions
    collectAllTransitions(
      this.rootScxml,
      edges,
      this.stateRegistry,
      this.parentMap,
      this.edgePairCounts,
      getAttribute,
      getElements
    );

    // Calculate dimensions for nodes without viz:xywh width/height BEFORE ELK runs,
    // so ELK receives correct sizes and computes accurate non-overlapping positions.
    let needsInitialization = false;

    allNodes.forEach((node) => {
      const nodeData = node.data as any;
      const hasVizDimensions =
        nodeData.width !== undefined && nodeData.height !== undefined;

      if (!hasVizDimensions) {
        const dims = nodeDimensionCalculator.calculateDimensionsFromNode(node);

        nodeData.width = dims.width;
        nodeData.height = dims.height;

        // Also write to node.style so the ELK builder finds them via node.style?.width
        (node as any).style = {
          ...(node as any).style,
          width: dims.width,
          height: dims.height,
        };

        needsInitialization = true;
      }
    });

    // Apply ELK force-directed layout with viz:xywh priority
    await applyDefaultELKLayout(allNodes, edges);

    // Compute smart source/target handles for edges that have no saved viz:sourceHandle /
    // viz:targetHandle. Handles are chosen with a traffic-aware cost model: each candidate
    // (sourceHandle, targetHandle) pair is scored by how directly it faces the other node,
    // plus how much other traffic already uses those same handles — globally, across the
    // whole diagram, not just within one node pair — so a busy handle gets avoided in favor
    // of a quieter one, the way traffic routes around a congested lane. Candidates whose
    // approximate route would cut through sibling nodes pay an extra per-node penalty, so
    // a clear perpendicular route beats a direct one that's blocked by a node in between.
    // Edges with saved handles are never overridden, but they still count as traffic that
    // later edges route around.
    const nodePositionMap = new Map(allNodes.map((n) => [n.id, n]));

    const getNodeRect = (id: string): Rect | undefined => {
      const node = nodePositionMap.get(id);
      if (!node) return undefined;
      return {
        x: node.position.x,
        y: node.position.y,
        width: (node.data as any).width || 160,
        height: (node.data as any).height || 80,
      };
    };

    const getNodeCenter = (id: string) => {
      const rect = getNodeRect(id);
      if (!rect) return undefined;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };

    // Sibling node rects grouped by parent — the obstacle set for an edge is the
    // other nodes at its own hierarchy level (source and target always share a
    // parent here; cross-hierarchy transitions were filtered during conversion).
    // Child positions are parent-relative, so only same-parent rects are in the
    // same coordinate frame as the edge's anchors anyway.
    const siblingRectsByParent = new Map<string, Array<{ id: string; rect: Rect }>>();
    allNodes.forEach((node) => {
      const rect = getNodeRect(node.id);
      if (!rect) return;
      const parentKey = node.parentId || '';
      if (!siblingRectsByParent.has(parentKey)) {
        siblingRectsByParent.set(parentKey, []);
      }
      siblingRectsByParent.get(parentKey)!.push({ id: node.id, rect });
    });

    type HandleSide = 'top' | 'bottom' | 'left' | 'right';

    // generalUsage: how many edges of any kind already use a given handle on a given node
    // — the broad "how busy is this lane" signal.
    const generalUsage = new Map<string, number>();
    const generalKey = (nodeId: string, side: string) => `${nodeId}\0${side}`;
    const bumpGeneral = (nodeId: string, side: string) => {
      const key = generalKey(nodeId, side);
      generalUsage.set(key, (generalUsage.get(key) || 0) + 1);
    };
    const getGeneral = (nodeId: string, side: string) => generalUsage.get(generalKey(nodeId, side)) || 0;

    // pairUsage: how many edges already use this exact physical slot — the same two
    // node+handle anchor points — between these two specific nodes. Direction-independent:
    // A→B and B→A landing on mirrored handles count as the same slot, since they'd overlap
    // on the same two physical points.
    const pairUsage = new Map<string, number>();
    const pairKey = (a: string, aSide: string, b: string, bSide: string) =>
      [`${a}:${aSide}`, `${b}:${bSide}`].sort().join('|');
    const bumpPair = (a: string, aSide: string, b: string, bSide: string) => {
      const key = pairKey(a, aSide, b, bSide);
      pairUsage.set(key, (pairUsage.get(key) || 0) + 1);
    };
    const getPair = (a: string, aSide: string, b: string, bSide: string) =>
      pairUsage.get(pairKey(a, aSide, b, bSide)) || 0;

    // Seed both registries from edges that don't need computed handles (explicit
    // saves, self-loops) so newly computed handles route around already-fixed traffic too.
    edges.forEach((edge) => {
      const isSelfLoop = edge.source === edge.target;
      const needsSource = !edge.data?.hasExplicitSourceHandle;
      const needsTarget = !edge.data?.hasExplicitTargetHandle;
      if (!isSelfLoop && (needsSource || needsTarget)) return; // computed below instead

      if (edge.sourceHandle) bumpGeneral(edge.source, edge.sourceHandle);
      if (edge.targetHandle) bumpGeneral(edge.target, edge.targetHandle);
      if (!isSelfLoop && edge.sourceHandle && edge.targetHandle) {
        bumpPair(edge.source, edge.sourceHandle, edge.target, edge.targetHandle);
      }
    });

    // Perpendicular candidates cost more than a direct face-to-face route geometrically,
    // but repeated use of the *same exact slot* between the same two nodes costs far more
    // than generic handle load elsewhere in the diagram — this keeps normal fan-outs (many
    // distinct neighbors sharing one handle) untouched while still strongly separating
    // genuine parallel/bidirectional edges between the same pair. Cutting through a node
    // costs more than the perpendicular geometric penalty, so a single blocked node is
    // enough to push an edge onto a clear perpendicular route instead.
    const GEOMETRIC_PENALTY_PERP = 6;
    const SAME_PAIR_WEIGHT = 8;
    const GENERAL_LOAD_WEIGHT = 1;
    const NODE_CROSSING_WEIGHT = 12;

    edges.forEach((edge) => {
      if (edge.source === edge.target) return; // self-loops keep their default bottom→top handles
      const needsSource = !edge.data?.hasExplicitSourceHandle;
      const needsTarget = !edge.data?.hasExplicitTargetHandle;
      if (!needsSource && !needsTarget) return; // fully explicit, already seeded above

      const srcRect = getNodeRect(edge.source);
      const tgtRect = getNodeRect(edge.target);
      if (!srcRect || !tgtRect) return;
      const srcCenter = getNodeCenter(edge.source)!;
      const tgtCenter = getNodeCenter(edge.target)!;

      const sourceParentKey = nodePositionMap.get(edge.source)?.parentId || '';
      const obstacleRects = (siblingRectsByParent.get(sourceParentKey) || [])
        .filter((sibling) => sibling.id !== edge.source && sibling.id !== edge.target)
        .map((sibling) => sibling.rect);

      const edx = tgtCenter.x - srcCenter.x;
      const edy = tgtCenter.y - srcCenter.y;
      const isHorizontal = Math.abs(edx) >= Math.abs(edy);

      // Direct: face the other node, mirrors per this edge's own direction.
      const directSource: HandleSide = isHorizontal
        ? edx >= 0 ? 'right' : 'left'
        : edy >= 0 ? 'bottom' : 'top';
      const directTarget: HandleSide = isHorizontal
        ? edx >= 0 ? 'left' : 'right'
        : edy >= 0 ? 'top' : 'bottom';
      // Perpendicular slots use the same side name for both nodes ('right'↔'right' or
      // 'bottom'↔'bottom'), so they don't depend on edge direction.
      const perpASide: HandleSide = isHorizontal ? 'bottom' : 'right';
      const perpBSide: HandleSide = isHorizontal ? 'top' : 'left';

      const candidates: Array<{ source: HandleSide; target: HandleSide; penalty: number; isDirect: boolean }> = [
        { source: directSource, target: directTarget, penalty: 0, isDirect: true },
        { source: perpASide, target: perpASide, penalty: GEOMETRIC_PENALTY_PERP, isDirect: false },
        { source: perpBSide, target: perpBSide, penalty: GEOMETRIC_PENALTY_PERP, isDirect: false },
      ];

      let best: (typeof candidates)[number] | undefined;
      let bestCost = Infinity;
      for (const candidate of candidates) {
        const pairCount = getPair(edge.source, candidate.source, edge.target, candidate.target);
        // The direct route is the tight face-to-face gap between the two nodes — there's
        // barely any room for a second edge to visibly bow away from the first one there.
        // The perpendicular loops travel all the way around a node's side and have real
        // room to separate, so once direct is taken, every further edge cycles between
        // the two perpendicular loops instead of ever doubling up on direct again.
        if (candidate.isDirect && pairCount >= 1) continue;

        const route = approximateOrthogonalRoute(
          getHandleAnchor(srcRect, candidate.source),
          candidate.source,
          getHandleAnchor(tgtRect, candidate.target),
          candidate.target
        );
        const nodeCrossings = countRouteCrossings(route, obstacleRects);

        const cost =
          candidate.penalty +
          SAME_PAIR_WEIGHT * pairCount +
          NODE_CROSSING_WEIGHT * nodeCrossings +
          GENERAL_LOAD_WEIGHT *
            (getGeneral(edge.source, candidate.source) + getGeneral(edge.target, candidate.target));
        if (cost < bestCost) {
          bestCost = cost;
          best = candidate;
        }
      }
      if (!best) best = candidates[0]; // unreachable safety fallback

      if (needsSource) {
        edge.sourceHandle = best.source;
        edge.data!.sourceHandle = best.source;
      }
      if (needsTarget) {
        edge.targetHandle = best.target;
        edge.data!.targetHandle = best.target;
      }

      // Record this edge as traffic so subsequent edges route around it too.
      bumpGeneral(edge.source, best.source);
      bumpGeneral(edge.target, best.target);
      bumpPair(edge.source, best.source, edge.target, best.target);
    });

    // Write back to SCXML when nodes lack viz:xywh OR any edge lacks viz:sourceHandle/targetHandle.
    // This persists the computed handles once so subsequent re-parses (e.g. after node drag)
    // find hasExplicitSourceHandle=true and skip smart handle recomputation entirely.
    const edgesNeedHandles = edges.some(
      (e) => !e.data?.hasExplicitSourceHandle || !e.data?.hasExplicitTargetHandle
    );

    if ((needsInitialization || edgesNeedHandles) && this.originalScxmlContent) {
      const edgeHandles: EdgeHandleEntry[] = edges
        .filter((e) => e.sourceHandle && e.targetHandle)
        .map((e) => ({
          source: e.source,
          target: e.target,
          event: e.data?.event,
          condition: e.data?.condition,
          sourceHandle: e.sourceHandle as string,
          targetHandle: e.targetHandle as string,
        }));

      this.initializedSCXML = writeLayoutToSCXML(
        allNodes,
        this.originalScxmlContent,
        edgeHandles
      );
    }

    // Update container bounds after layout is complete
    allNodes.forEach((node) => {
      if (
        node.childIds &&
        node.childIds.length > 0 &&
        this.stateRegistry.get(node.id)?.elementType !== 'history'
      ) {
        const nodeData = node.data as any;
        // Use the largest available dimensions
        const finalWidth = Math.max(
          nodeData.width || 0,
          node.containerBounds?.width || 0,
          300 // minimum fallback
        );
        const finalHeight = Math.max(
          nodeData.height || 0,
          node.containerBounds?.height || 0,
          200 // minimum fallback
        );

        node.containerBounds = {
          x: node.position.x,
          y: node.position.y,
          width: finalWidth,
          height: finalHeight,
        };
      }
    });

    // Position history states (but allow them to also participate in sibling layout)
    positionHistoryStates(allNodes, this.stateRegistry);

    // DON'T convert absolute positions to relative positions
    // We're using hierarchy navigation which removes parentId for flat rendering
    // All positions should remain absolute for correct display
    //
    // Convert absolute positions to relative positions for nested nodes
    allNodes.forEach((node) => {
      if (node.parentId) {
        const parent = allNodes.find((p) => p.id === node.parentId);
        if (parent) {
          const hasVizPosition = (node.data as any).hasVizPosition === true;

          // For nodes with viz positions, keep them absolute (don't convert to relative)
          // because hierarchy navigation removes parentId and treats all nodes as root-level
          if (hasVizPosition) {
            // SKIP conversion - keep absolute position
          } else {
            // For auto-laid out nodes, they're already relative - keep as is
          }

          // Add extent to constrain child within parent bounds
          (node as any).extent = 'parent';
          // Make parent expand to fit children automatically
          (node as any).expandParent = true;
        }
      }
    });

    // Include history wrapper nodes that should be rendered at the top level
    const historyWrapperNodes = allNodes.filter(
      (node) =>
        this.stateRegistry.get(node.id)?.elementType === 'history' &&
        (node.data as any).isHistoryWrapper
    );

    // Use all nodes with native parent-child relationships
    const finalNodes = allNodes;

    // All nodes now use scxmlState type
    // State classification is handled via data.stateType property

    // Remove proxy node creation helpers - no longer needed

    // No proxy nodes needed

    // Remove descendant processing - no longer needed

    // Layout processing function removed - no longer needed

    // Layout calculation function removed - no longer needed

    // No longer need to process descendants for proxy nodes

    // Edges now connect directly to the actual nodes

    return {
      nodes: finalNodes, // All nodes with proper parent-child relationships
      edges: edges, // Direct edges without proxy mapping
      hierarchy: this.hierarchyMap,
      parentMap: this.parentMap,
    };
  }

  /**
   * Create a hierarchical node from state registry entry
   */
  private createHierarchicalNode(
    stateId: string,
    stateInfo: StateRegistryEntry
  ): HierarchicalNode | null {
    const state = stateInfo.state;
    const isContainer = stateInfo.isContainer;

    // Extract visual metadata FIRST
    const visualMetadata = extractVisualMetadata(state, getAttribute);

    // Extract actions
    const onentry = this.getElements(state, 'onentry');
    const onexit = this.getElements(state, 'onexit');
    const order = this.actionOrderMap.get(getAttribute(state, 'id') || '');
    const entryActions = onentry
      ? extractActionsText(onentry, getAttribute, getElements, order?.onentry)
      : [];
    const exitActions = onexit
      ? extractActionsText(onexit, getAttribute, getElements, order?.onexit)
      : [];

    // Extract internal event actions (targetless transitions with type="internal")
    const rawTransitions = this.getElements(state, 'transition');
    const internalEventActions: { event: string; location: string; expr: string; type: 'internal' | 'external' }[] = [];
    if (rawTransitions) {
      const transArray = Array.isArray(rawTransitions) ? rawTransitions : [rawTransitions];
      for (const tr of transArray) {
        const trEvent = getAttribute(tr, 'event');
        const trType = getAttribute(tr, 'type');
        const trTarget = getAttribute(tr, 'target');
        if (trEvent && (trType === 'internal' || trType === 'external') && !trTarget) {
          const assigns = getElements(tr, 'assign');
          if (assigns) {
            const assignsArray = Array.isArray(assigns) ? assigns : [assigns];
            for (const assign of assignsArray) {
              internalEventActions.push({
                event: trEvent,
                location: getAttribute(assign, 'location') || '',
                expr: getAttribute(assign, 'expr') || '',
                type: (trType as 'internal' | 'external'),
              });
            }
          }
        }
      }
    }

    // Determine node type
    // Most states use 'scxmlState' type, history states use 'scxmlHistory'
    // State classification is handled via data.stateType
    let nodeType: 'scxmlState' | 'scxmlHistory' = 'scxmlState';
    let stateType: SCXMLStateNodeData['stateType'] = 'simple';

    if (stateInfo.elementType === 'parallel') {
      stateType = 'parallel';
    } else if (stateInfo.elementType === 'history') {
      nodeType = 'scxmlHistory'; // Keep history wrapper as special type
      stateType = 'simple';
    } else if (isContainer) {
      stateType = 'compound';
    } else if (state['@_type'] === 'final') {
      stateType = 'final';
    }

    // Check if this is an initial state
    const isInitial = isInitialState(
      stateId,
      stateInfo.parentPath,
      this.rootScxml,
      this.stateRegistry,
      getAttribute,
      getElements
    );

    // Initial position placeholder - will be set by applyDefaultELKLayout()
    // This placeholder is necessary for node creation but will be overwritten
    const position: { x: number; y: number } = { x: 0, y: 0 };

    // Create base node data
    const baseNodeData: SCXMLStateNodeData = {
      label: stateId,
      stateType,
      isInitial,
      entryActions,
      exitActions,
      internalEventActions,
    };

    // Create hierarchical node
    const node: HierarchicalNode = {
      id: stateId,
      type: nodeType,
      position,
      data: baseNodeData,
      parentId: stateInfo.parentPath ? this.parentMap.get(stateId) : undefined,
      childIds: stateInfo.children,
      depth: stateInfo.depth,
    };

    // If this is a container, store children array for reference
    if (isContainer) {
      (node.data as any).children = stateInfo.children;
    }

    // Store viz metadata for position tracking in auto-layout
    if (visualMetadata.x !== undefined && visualMetadata.y !== undefined) {
      // Store absolute viz:xywh position for tracking
      (node.data as any).vizX = visualMetadata.x;
      (node.data as any).vizY = visualMetadata.y;
      (node.data as any).hasVizPosition = true; // Flag to indicate viz position exists
    }

    // Apply viz:xywh width/height at all levels for NodeResizer compatibility
    if (
      visualMetadata.width !== undefined &&
      visualMetadata.height !== undefined
    ) {
      // The stored width is a snapshot from whenever the node was last
      // sized/moved — it can go stale for reasons other than resizing it
      // (renaming to a longer id, adding the "Initial" badge), leaving it
      // too narrow for what's now rendered inside. Never let it shrink
      // content below its calculated minimum; only ever widen up from the
      // stored value, so an intentional manual widening (NodeResizer) isn't
      // clobbered back down to the calculated minimum.
      const effectiveWidth = Math.max(
        visualMetadata.width,
        nodeDimensionCalculator.calculateWidth(stateId, stateType, isInitial)
      );

      // Top-level dimensions (required by NodeResizer)
      (node as any).width = effectiveWidth;
      (node as any).height = visualMetadata.height;

      // Style-level dimensions
      (node as any).style = {
        width: effectiveWidth,
        height: visualMetadata.height,
      };

      // Data-level dimensions (for component access)
      (node.data as any).width = effectiveWidth;
      (node.data as any).height = visualMetadata.height;
    }

    if (visualMetadata.anchors) {
      (node.data as any).anchors = visualMetadata.anchors;
    }

    return node;
  }

  /**
   * Wrapper for getAncestorChain - delegates to module function (kept as public method)
   */
  getAncestorChain(stateId: string): string[] {
    return getAncestorChain(stateId, this.stateRegistry);
  }
}
