/**
 * Edge Conversion Module for SCXML Converter
 *
 * Handles conversion of SCXML transitions to React Flow edges,
 * including action extraction, waypoint handling, and edge styling.
 */

import { Edge, MarkerType } from 'reactflow';
import type { SCXMLTransitionEdgeData } from '@/components/diagram';
import { ConditionEvaluator } from '@/lib/scxml/condition-evaluator';
import type { StateRegistryEntry } from './state-registry';

/**
 * Generate deterministic edge ID for a transition
 * This ensures stable IDs across re-parses without needing persistence
 */
export function generateDeterministicEdgeId(
  sourceStateId: string,
  targetStateId: string,
  event: string | undefined,
  condition: string | undefined,
  transitionIndex: number
): string {
  const conditionHash =
    condition && typeof condition === 'string'
      ? `-${condition.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`
      : '';
  return `${sourceStateId}-to-${targetStateId}-${
    event || 'always'
  }${conditionHash}-idx${transitionIndex}`;
}

/**
 * Parse transition index from a deterministic edge ID
 * Returns the index, or undefined if not found
 */
export function parseTransitionIndexFromEdgeId(edgeId: string): number | undefined {
  const match = edgeId.match(/-idx(\d+)$/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Convert SCXML transition element to React Flow edge
 */
export function convertTransitionToEdge(
  transition: any,
  sourceStateId: string,
  stateRegistry: Map<string, StateRegistryEntry>,
  parentMap: Map<string, string>,
  edgePairCounts: Map<string, number>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  transitionIndex: number = 0
): Edge<SCXMLTransitionEdgeData> | null {
  const target = getAttribute(transition, 'target');
  if (!target) return null;

  const event = getAttribute(transition, 'event');
  const condition = getAttribute(transition, 'cond');
  const actions = convertTransitionActions(transition, getAttribute, getElements);

  // Track edge pairs for parallel transitions
  const edgePairKey = `${sourceStateId}->${target}`;
  const edgeCount = edgePairCounts.get(edgePairKey) || 0;
  edgePairCounts.set(edgePairKey, edgeCount + 1);

  // Parse the condition if present
  let conditionParsed = undefined;
  if (condition) {
    const parsed = ConditionEvaluator.parseCondition(condition);
    conditionParsed = {
      decoded: parsed.decoded,
      variables: parsed.variables,
      isComplex: parsed.isComplex,
    };
  }

  // Resolve the target - it should be the exact state ID
  // Don't split by dots as the ID itself might contain dots
  const finalTargetId = target;

  // Verify both source and target exist in our registry
  if (!stateRegistry.has(sourceStateId)) {
    console.warn(`Source state '${sourceStateId}' not found in registry`);
    return null;
  }

  if (!stateRegistry.has(finalTargetId!)) {
    console.warn(`Target state '${finalTargetId}' not found in registry`);
    return null;
  }

  // Generic solution: Skip transitions from a parent to its own children
  // This prevents container nodes from having edges to their child states
  const sourceState = stateRegistry.get(sourceStateId);
  if (
    sourceState &&
    sourceState.children &&
    sourceState.children.length > 0
  ) {
    // Check if the target is a child of this source
    if (sourceState.children.includes(finalTargetId!)) {
      return null;
    }
  }

  // Cross-hierarchy transition validation (Milestone 5 - 1C)
  // Skip transitions between states at different hierarchy levels
  const sourceParent = parentMap.get(sourceStateId);
  const targetParent = parentMap.get(finalTargetId!);

  // If both states have defined parents, check if they match
  if (sourceParent !== undefined && targetParent !== undefined) {
    if (sourceParent !== targetParent) {
      // Cross-hierarchy transition detected - skip this edge
      console.warn(
        `[Cross-Hierarchy Filter] Skipping transition from '${sourceStateId}' to '${finalTargetId}' - different hierarchy levels (source parent: '${
          sourceParent || 'root'
        }', target parent: '${targetParent || 'root'}')`
      );
      return null;
    }
  }

  // Generate deterministic edge ID based on transition position
  const edgeId = generateDeterministicEdgeId(
    sourceStateId,
    finalTargetId!,
    event,
    condition,
    transitionIndex
  );

  // Determine edge type based on transition characteristics
  let edgeType = 'smoothstep'; // Use ReactFlow's built-in smoothstep edge

  // Use step edge for conditional transitions for better visibility
  if (condition) {
    edgeType = 'step';
  }
  // Use straight edge for self-transitions
  else if (sourceStateId === finalTargetId) {
    edgeType = 'straight';
  }

  // Extract waypoints from viz:waypoints attribute
  const waypointsAttr = getAttribute(transition, 'viz:waypoints');
  let waypoints: Array<{ x: number; y: number }> | undefined;
  if (waypointsAttr) {
    waypoints = waypointsAttr
      .split(';')
      .map((point: string) => {
        const [x, y] = point
          .split(',')
          .map((s: string) => parseFloat(s.trim()));
        return !isNaN(x) && !isNaN(y) ? { x, y } : null;
      })
      .filter((wp: any): wp is { x: number; y: number } => wp !== null);
  }

  // Extract handle information from viz:sourceHandle and viz:targetHandle attributes
  const sourceHandleAttr = getAttribute(transition, 'viz:sourceHandle');
  const targetHandleAttr = getAttribute(transition, 'viz:targetHandle');

  // Set intelligent defaults: outgoing from bottom, incoming to top
  const sourceHandle = sourceHandleAttr || 'bottom';
  const targetHandle = targetHandleAttr || 'top';

  // For parallel transitions, use standard handles
  // The visual separation will be handled by edge routing/offset
  const edge: any = {
    id: edgeId,
    type: edgeType,
    source: sourceStateId,
    target: finalTargetId!,
    sourceHandle: sourceHandle,
    targetHandle: targetHandle,
    data: {
      event,
      condition,
      conditionParsed,
      actions,
      waypoints, // Add waypoints to edge data
      sourceHandle: sourceHandle,
      targetHandle: targetHandle,
    },
    // Add styling for better visibility
    animated: condition ? false : true, // Animate non-conditional transitions
    style: {
      strokeWidth: 2,
      stroke: condition ? '#ef4444' : '#3b82f6', // Red for conditional, blue for normal
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: condition ? '#ef4444' : '#3b82f6',
      width: 20,
      height: 20,
    },
    pathOptions: {
      offset: 20, // Offset from nodes
      curvature: 0.5, // How curved the edge is
    },
    zIndex: -1, // Put edges behind nodes
    label: event || '',
    labelStyle: {
      fill: 'white',
      fontWeight: 700,
      fontSize: 12,
    },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: {
      fill: condition ? '#ef4444' : '#3b82f6',
      fillOpacity: 0.9,
    },
  };

  // Optionally add handle IDs for better connection points
  // This helps ensure edges connect to the right handle positions
  // Can be enhanced to calculate optimal handles based on node positions

  return edge;
}

/**
 * Convert transition actions to action strings
 */
export function convertTransitionActions(
  transition: any,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): string[] {
  const actions: string[] = [];

  // Inline actions on the transition element
  const logs = getElements(transition, 'log');
  if (logs) {
    const logsArray = Array.isArray(logs) ? logs : [logs];
    for (const log of logsArray) {
      const label = getAttribute(log, 'label') || '';
      const expr = getAttribute(log, 'expr') || '';
      actions.push(`log("${label}: ${expr}")`);
    }
  }

  return actions;
}

/**
 * Helper function to get elements (needed for convertTransitionActions)
 */
function getElements(parent: any, elementName: string): any {
  return parent?.[elementName];
}

/**
 * Convert action elements to action strings
 */
export function convertActions(
  actionsElement: any,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): string[] {
  const actions: string[] = [];

  if (!actionsElement) return actions;

  // Handle different types of actions
  const logs = getElements(actionsElement, 'log');
  if (logs) {
    const logsArray = Array.isArray(logs) ? logs : [logs];
    for (const log of logsArray) {
      const label = getAttribute(log, 'label') || '';
      const expr = getAttribute(log, 'expr') || '';
      actions.push('log');
    }
  }

  const assigns = getElements(actionsElement, 'assign');
  if (assigns) {
    const assignsArray = Array.isArray(assigns) ? assigns : [assigns];
    for (const assign of assignsArray) {
      const location = getAttribute(assign, 'location') || '';
      const expr = getAttribute(assign, 'expr') || '';
      // Store assign with location and expr in format: assign|location|expr
      // This preserves the data for editing while remaining backward compatible
      actions.push(`assign|${location}|${expr}`);
    }
  }

  // Handle send elements (for now, we'll ignore delays and just note them)
  const sends = getElements(actionsElement, 'send');
  if (sends) {
    const sendsArray = Array.isArray(sends) ? sends : [sends];
    for (const send of sendsArray) {
      const event = getAttribute(send, 'event') || '';
      const delay = getAttribute(send, 'delay') || '';
      // For now, we'll just add a simple send action
      // In a full implementation, this would handle delays properly
      actions.push('send');
    }
  }

  return actions;
}

/**
 * Extract actions text from action elements
 */
export function extractActionsText(
  actionsElement: any,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): string[] {
  const actions: string[] = [];

  if (Array.isArray(actionsElement)) {
    for (const element of actionsElement) {
      actions.push(...convertActions(element, getAttribute, getElements));
    }
  } else {
    actions.push(...convertActions(actionsElement, getAttribute, getElements));
  }

  return actions;
}

/**
 * Recursively collect all transitions from the SCXML document
 */
export function collectAllTransitions(
  parent: any,
  edges: Edge[],
  stateRegistry: Map<string, StateRegistryEntry>,
  parentMap: Map<string, string>,
  edgePairCounts: Map<string, number>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any,
  parentStateId?: string
): void {
  // Get the current element's state ID
  const currentStateId = getAttribute(parent, 'id') || parentStateId;

  // Process transitions in current element
  const transitions = getElements(parent, 'transition');
  if (transitions && currentStateId) {
    const transitionsArray = Array.isArray(transitions)
      ? transitions
      : [transitions];
    for (let i = 0; i < transitionsArray.length; i++) {
      const transition = transitionsArray[i];
      const edge = convertTransitionToEdge(
        transition,
        currentStateId,
        stateRegistry,
        parentMap,
        edgePairCounts,
        getAttribute,
        i // Pass transition index for deterministic ID generation
      );
      if (edge) {
        edges.push(edge);
      }
    }
  }

  // Recursively process child states
  const states = getElements(parent, 'state');
  if (states) {
    const statesArray = Array.isArray(states) ? states : [states];
    for (const state of statesArray) {
      collectAllTransitions(
        state,
        edges,
        stateRegistry,
        parentMap,
        edgePairCounts,
        getAttribute,
        getElements
      );
    }
  }

  // Recursively process parallel states
  const parallels = getElements(parent, 'parallel');
  if (parallels) {
    const parallelsArray = Array.isArray(parallels) ? parallels : [parallels];
    for (const parallel of parallelsArray) {
      collectAllTransitions(
        parallel,
        edges,
        stateRegistry,
        parentMap,
        edgePairCounts,
        getAttribute,
        getElements
      );
    }
  }

  // Process history states
  const histories = getElements(parent, 'history');
  if (histories) {
    const historiesArray = Array.isArray(histories) ? histories : [histories];
    for (const history of historiesArray) {
      collectAllTransitions(
        history,
        edges,
        stateRegistry,
        parentMap,
        edgePairCounts,
        getAttribute,
        getElements
      );
    }
  }

  // Process initial elements (they can contain transitions)
  const initials = getElements(parent, 'initial');
  if (initials) {
    const initialsArray = Array.isArray(initials) ? initials : [initials];
    for (const initial of initialsArray) {
      // Initial transitions should come from the parent state
      collectAllTransitions(
        initial,
        edges,
        stateRegistry,
        parentMap,
        edgePairCounts,
        getAttribute,
        getElements,
        currentStateId
      );
    }
  }
}
