/**
 * State Registry Module for SCXML Converter
 *
 * Handles state registration, hierarchy building, and ancestor chain tracking.
 * Manages the state registry map and hierarchy relationships between states.
 */

import { getDisplayChildEntries, type ContainerKind } from '@/lib/utils/parallel-structure';

export interface StateRegistryEntry {
  state: any;
  parentPath: string;
  children: string[];
  isContainer: boolean;
  depth: number;
  elementType: 'state' | 'parallel' | 'final' | 'history';
}

/**
 * A <parallel>'s regions are drawn as columns, not nodes (see
 * getDisplayChildEntries): each region's contents register as the
 * <parallel>'s own children, and the region itself gets no registry entry —
 * unless it's empty or is itself a <parallel>, in which case it registers as
 * the node. The root-level `<parallel id="__root_parallel">` (inserted by
 * src/lib/utils/parallel-group-normalization.ts) is likewise never a node:
 * its regions' contents register at root level.
 *
 * Returns the effective "direct <state> / <parallel> / <final> children" of
 * an element.
 */
function collectEffectiveChildren(
  parent: any,
  kind: ContainerKind
): { states: any[]; parallels: any[]; finals: any[] } {
  const states: any[] = [];
  const parallels: any[] = [];
  const finals: any[] = [];
  getDisplayChildEntries(parent, kind).forEach((entry) => {
    if (entry.tag === 'state') states.push(entry.el);
    else if (entry.tag === 'parallel') parallels.push(entry.el);
    else finals.push(entry.el);
  });
  return { states, parallels, finals };
}


/**
 * Register all states in the SCXML document with their parent paths and hierarchy
 * Uses '#' as path separator to avoid conflicts with dots in state IDs
 */
export function registerAllStates(
  parent: any,
  parentPath: string,
  stateRegistry: Map<string, StateRegistryEntry>,
  hierarchyMap: Map<string, string[]>,
  parentMap: Map<string, string>,
  claimedStates: Set<string>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any,
  /** What `parent` is — a <parallel>'s regions are shown by their contents. */
  kind: ContainerKind = parentPath ? 'state' : 'root'
): void {
  const parentId =
    parentPath && typeof parentPath === 'string'
      ? parentPath.split('#').pop()
      : null;
  const depth =
    parentPath && typeof parentPath === 'string'
      ? parentPath.split('#').length
      : 0;

  // Initialize parent's children array if not exists
  if (parentId && !hierarchyMap.has(parentId)) {
    hierarchyMap.set(parentId, []);
  }

  // Register regular states (including the regions of the root's
  // __root_parallel — see collectEffectiveChildren)
  const states = collectEffectiveChildren(parent, kind).states;
  {
    const statesArray = states;
    for (const state of statesArray) {
      const stateId = getAttribute(state, 'id');
      if (stateId) {
        const fullPath = parentPath ? `${parentPath}#${stateId}` : stateId;

        // Check if this state has children (compound state)
        const hasChildren = hasChildStates(state, getElements);

        const registryEntry: StateRegistryEntry = {
          state,
          parentPath,
          children: [],
          isContainer: hasChildren,
          depth,
          elementType: 'state',
        };

        stateRegistry.set(stateId, registryEntry);

        // Update hierarchy maps
        if (parentId) {
          hierarchyMap.get(parentId)?.push(stateId);
          parentMap.set(stateId, parentId);
        }

        // Recursively register nested states FIRST (depth-first)
        // This ensures nested states are claimed before we collect children
        registerAllStates(
          state,
          fullPath,
          stateRegistry,
          hierarchyMap,
          parentMap,
          claimedStates,
          getAttribute,
          getElements,
          'state'
        );

        // After recursive call, collect children for this state
        // Only unclaimed states will be considered direct children
        if (hasChildren) {
          const childStates = collectDirectChildIds(
            state,
            claimedStates,
            getAttribute,
            getElements,
            'state'
          );
          registryEntry.children = childStates;
          hierarchyMap.set(stateId, childStates);

          // Mark these children as claimed so parent states won't claim them
          childStates.forEach((childId) => claimedStates.add(childId));
        }
      }
    }
  }

  // Register parallel states — the root's __root_parallel is skipped (its
  // regions were folded into the root level above); every other <parallel>
  // registers and recurses normally.
  const parallelsArray = collectEffectiveChildren(parent, kind).parallels;
  {
    for (const parallel of parallelsArray) {
      const parallelId = getAttribute(parallel, 'id');
      if (parallelId) {
        const fullPath = parentPath
          ? `${parentPath}#${parallelId}`
          : parallelId;

        const hasChildren = hasChildStates(parallel, getElements);

        const registryEntry: StateRegistryEntry = {
          state: parallel,
          parentPath,
          children: [],
          isContainer: true, // Parallel states are always containers
          depth,
          elementType: 'parallel',
        };

        stateRegistry.set(parallelId, registryEntry);

        // Update hierarchy maps
        if (parentId) {
          hierarchyMap.get(parentId)?.push(parallelId);
          parentMap.set(parallelId, parentId);
        }

        // Recursively register nested states within parallel FIRST
        registerAllStates(
          parallel,
          fullPath,
          stateRegistry,
          hierarchyMap,
          parentMap,
          claimedStates,
          getAttribute,
          getElements,
          'parallel'
        );

        // After recursive call, collect children for this parallel state
        // Only unclaimed states will be considered direct children
        const childStates = collectDirectChildIds(
          parallel,
          claimedStates,
          getAttribute,
          getElements,
          'parallel'
        );
        registryEntry.children = childStates;
        hierarchyMap.set(parallelId, childStates);

        // Mark these children as claimed
        childStates.forEach((childId) => claimedStates.add(childId));
      }
    }
  }

  // Register final states — always leaves (a <final> has no child states)
  for (const final of collectEffectiveChildren(parent, kind).finals) {
    const finalId = getAttribute(final, 'id');
    if (finalId) {
      stateRegistry.set(finalId, {
        state: final,
        parentPath,
        children: [],
        isContainer: false,
        depth,
        elementType: 'final',
      });

      if (parentId) {
        hierarchyMap.get(parentId)?.push(finalId);
        parentMap.set(finalId, parentId);
      }
    }
  }

  // Register history states
  const histories = getElements(parent, 'history');
  if (histories) {
    const historiesArray = Array.isArray(histories) ? histories : [histories];
    for (const history of historiesArray) {
      const historyId = getAttribute(history, 'id');
      if (historyId) {
        const fullPath = parentPath
          ? `${parentPath}#${historyId}`
          : historyId;

        const registryEntry: StateRegistryEntry = {
          state: history,
          parentPath,
          children: [],
          isContainer: false,
          depth,
          elementType: 'history',
        };

        stateRegistry.set(historyId, registryEntry);

        // Update hierarchy maps
        if (parentId) {
          hierarchyMap.get(parentId)?.push(historyId);
          parentMap.set(historyId, parentId);
        }
      }
    }
  }
}

/**
 * Check if a state element has child states
 */
export function hasChildStates(
  element: any,
  getElements: (parent: any, elementName: string) => any
): boolean {
  const childStates = getElements(element, 'state');
  const childParallels = getElements(element, 'parallel');
  const childFinals = getElements(element, 'final');
  const childHistories = getElements(element, 'history');

  return !!(childStates || childParallels || childFinals || childHistories);
}

/**
 * Collect direct child state IDs from an element
 * Only returns states that haven't been claimed by other parents
 */
export function collectDirectChildIds(
  element: any,
  claimedStates: Set<string>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any,
  kind: ContainerKind = 'state'
): string[] {
  const childIds: string[] = [];

  // Collect child states - only those not already claimed. Includes the
  // regions of the root's __root_parallel.
  const { states, parallels: parallelsArray, finals } = collectEffectiveChildren(element, kind);
  for (const state of states) {
    const stateId = getAttribute(state, 'id');
    if (!stateId) continue;

    // Only add if not already claimed by another parent
    if (!claimedStates.has(stateId)) {
      childIds.push(stateId);
    }
  }

  // Collect child parallel states - only those not already claimed. The
  // root's __root_parallel is never a "child" in its own right (folded above).
  {
    for (const parallel of parallelsArray) {
      const parallelId = getAttribute(parallel, 'id');
      if (!parallelId) continue;

      // Only add if not already claimed by another parent
      if (!claimedStates.has(parallelId)) {
        childIds.push(parallelId);
      }
    }
  }

  for (const final of finals) {
    const finalId = getAttribute(final, 'id');
    if (finalId && !claimedStates.has(finalId)) {
      childIds.push(finalId);
    }
  }

  // Collect child history states - only those not already claimed
  const histories = getElements(element, 'history');
  if (histories) {
    const historiesArray = Array.isArray(histories) ? histories : [histories];

    for (const history of historiesArray) {
      const historyId = getAttribute(history, 'id');
      if (!historyId) continue;

      // Only add if not already claimed by another parent
      if (!claimedStates.has(historyId)) {
        childIds.push(historyId);
      }
    }
  }

  return childIds;
}

/**
 * Get the chain of ancestors from root to the given state
 */
export function getAncestorChain(
  stateId: string,
  stateRegistry: Map<string, StateRegistryEntry>
): string[] {
  const chain: string[] = [];
  const entry = stateRegistry.get(stateId);
  if (!entry) return chain;

  // Build chain from parent path
  if (entry.parentPath && typeof entry.parentPath === 'string') {
    const pathParts = entry.parentPath.split('#');
    chain.push(...pathParts);
  }

  return chain;
}
