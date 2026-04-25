/**
 * State Registry Module for SCXML Converter
 *
 * Handles state registration, hierarchy building, and ancestor chain tracking.
 * Manages the state registry map and hierarchy relationships between states.
 */

export interface StateRegistryEntry {
  state: any;
  parentPath: string;
  children: string[];
  isContainer: boolean;
  depth: number;
  elementType: 'state' | 'parallel' | 'final' | 'history';
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
  getElements: (parent: any, elementName: string) => any
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

  // Register regular states
  const states = getElements(parent, 'state');
  if (states) {
    const statesArray = Array.isArray(states) ? states : [states];
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
          getElements
        );

        // After recursive call, collect children for this state
        // Only unclaimed states will be considered direct children
        if (hasChildren) {
          const childStates = collectDirectChildIds(
            state,
            claimedStates,
            getAttribute,
            getElements
          );
          registryEntry.children = childStates;
          hierarchyMap.set(stateId, childStates);

          // Mark these children as claimed so parent states won't claim them
          childStates.forEach((childId) => claimedStates.add(childId));
        }
      }
    }
  }

  // Register parallel states
  const parallels = getElements(parent, 'parallel');
  if (parallels) {
    const parallelsArray = Array.isArray(parallels) ? parallels : [parallels];
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
          getElements
        );

        // After recursive call, collect children for this parallel state
        // Only unclaimed states will be considered direct children
        const childStates = collectDirectChildIds(
          parallel,
          claimedStates,
          getAttribute,
          getElements
        );
        registryEntry.children = childStates;
        hierarchyMap.set(parallelId, childStates);

        // Mark these children as claimed
        childStates.forEach((childId) => claimedStates.add(childId));
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
  const childHistories = getElements(element, 'history');

  return !!(childStates || childParallels || childHistories);
}

/**
 * Collect direct child state IDs from an element
 * Only returns states that haven't been claimed by other parents
 */
export function collectDirectChildIds(
  element: any,
  claimedStates: Set<string>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): string[] {
  const childIds: string[] = [];

  // Collect child states - only those not already claimed
  const states = getElements(element, 'state');
  if (states) {
    const statesArray = Array.isArray(states) ? states : [states];

    for (const state of statesArray) {
      const stateId = getAttribute(state, 'id');
      if (!stateId) continue;

      // Only add if not already claimed by another parent
      if (!claimedStates.has(stateId)) {
        childIds.push(stateId);
      }
    }
  }

  // Collect child parallel states - only those not already claimed
  const parallels = getElements(element, 'parallel');
  if (parallels) {
    const parallelsArray = Array.isArray(parallels) ? parallels : [parallels];

    for (const parallel of parallelsArray) {
      const parallelId = getAttribute(parallel, 'id');
      if (!parallelId) continue;

      // Only add if not already claimed by another parent
      if (!claimedStates.has(parallelId)) {
        childIds.push(parallelId);
      }
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
