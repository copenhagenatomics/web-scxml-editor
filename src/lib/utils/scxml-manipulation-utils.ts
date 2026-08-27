// scxml-manipulation-utils.ts
import type {
  SCXMLDocument,
  StateElement,
  ParallelElement,
  TransitionElement,
  OnEntryElement,
  OnExitElement,
} from '@/types/scxml';

/**
 * Find a state element by its ID in the SCXML document
 */
export function findStateById(
  scxmlDoc: SCXMLDocument,
  stateId: string
): StateElement | null {
  function searchInStates(
    states: StateElement | StateElement[] | undefined
  ): StateElement | null {
    if (!states) return null;

    const stateArray = Array.isArray(states) ? states : [states];

    for (const state of stateArray) {
      if (state['@_id'] === stateId) {
        return state;
      }

      // Search in nested states
      const found = searchInStates(state.state);
      if (found) return found;
    }

    return null;
  }

  // Search in root states
  return searchInStates(scxmlDoc.scxml.state);
}

/**
 * Whether candidateId is nested anywhere inside ancestorId's subtree
 * (not counting ancestorId itself). Only walks <state> children, matching
 * findStateById/removeStateFromDocument's existing scope.
 */
export function isDescendantOf(
  scxmlDoc: SCXMLDocument,
  candidateId: string,
  ancestorId: string
): boolean {
  const ancestor = findStateById(scxmlDoc, ancestorId);
  if (!ancestor) return false;

  function search(states: StateElement | StateElement[] | undefined): boolean {
    if (!states) return false;
    const arr = Array.isArray(states) ? states : [states];
    for (const s of arr) {
      if (s['@_id'] === candidateId) return true;
      if (search(s.state)) return true;
    }
    return false;
  }

  return search(ancestor.state);
}

/**
 * Generate the next unused "eventN" name (event1, event2, ...) by scanning
 * every transition's @_event value in the whole document, so new transitions
 * never default to a name already in use elsewhere.
 */
export function getNextTransitionEventName(scxmlDoc: SCXMLDocument): string {
  const usedEvents = new Set<string>();

  const collect = (transitions: TransitionElement | TransitionElement[] | undefined) => {
    if (!transitions) return;
    const arr = Array.isArray(transitions) ? transitions : [transitions];
    for (const t of arr) {
      if (t['@_event']) {
        for (const token of t['@_event'].split(/[,\s]+/)) {
          if (token) usedEvents.add(token);
        }
      }
    }
  };

  const walkStates = (states: StateElement | StateElement[] | undefined) => {
    if (!states) return;
    const arr = Array.isArray(states) ? states : [states];
    for (const state of arr) {
      collect(state.transition);
      if (state.initial) collect(state.initial.transition);
      if (state.history) {
        const histories = Array.isArray(state.history) ? state.history : [state.history];
        histories.forEach((h) => collect(h.transition));
      }
      walkStates(state.state);
      walkParallels(state.parallel);
    }
  };

  const walkParallels = (parallels: ParallelElement | ParallelElement[] | undefined) => {
    if (!parallels) return;
    const arr = Array.isArray(parallels) ? parallels : [parallels];
    for (const p of arr) {
      collect(p.transition);
      walkStates(p.state);
      walkParallels(p.parallel);
    }
  };

  walkStates(scxmlDoc.scxml.state);
  walkParallels(scxmlDoc.scxml.parallel);

  let counter = 1;
  let name = `event${counter}`;
  while (usedEvents.has(name)) {
    counter++;
    name = `event${counter}`;
  }
  return name;
}

/**
 * Update all transition targets that reference the old state ID
 */
export function updateTransitionTargets(
  scxmlDoc: SCXMLDocument,
  oldStateId: string,
  newStateId: string
): void {
  function updateTransitionsInStates(
    states: StateElement | StateElement[] | undefined
  ) {
    if (!states) return;

    const stateArray = Array.isArray(states) ? states : [states];

    for (const state of stateArray) {
      // Update transitions in this state
      if (state.transition) {
        const transitions = Array.isArray(state.transition)
          ? state.transition
          : [state.transition];
        transitions.forEach((transition) => {
          if (transition['@_target'] === oldStateId) {
            transition['@_target'] = newStateId;
          }
        });
      }

      // Recursively update in nested states
      updateTransitionsInStates(state.state);
      updateTransitionsInStates(state.parallel);
    }
  }

  // Update transitions in all states
  updateTransitionsInStates(scxmlDoc.scxml.state);
  updateTransitionsInStates(scxmlDoc.scxml.parallel);

  // Update initial attribute if it references the old state — token-aware,
  // and checked at every nesting level (root and every compound state), not just root.
  function updateInitialAttr(container: { '@_initial'?: string }): void {
    if (!container['@_initial']) return;
    const tokens = container['@_initial'].split(/\s+/).filter(Boolean);
    if (tokens.includes(oldStateId)) {
      container['@_initial'] = tokens.map((t) => (t === oldStateId ? newStateId : t)).join(' ');
    }
  }

  function updateInitialInStates(states: StateElement | StateElement[] | undefined): void {
    if (!states) return;
    const stateArray = Array.isArray(states) ? states : [states];
    stateArray.forEach((state) => {
      updateInitialAttr(state);
      updateInitialInStates(state.state);
    });
  }

  updateInitialAttr(scxmlDoc.scxml);
  updateInitialInStates(scxmlDoc.scxml.state);
}

/**
 * Update entry or exit actions for a state
 */
export function updateStateActions(
  stateElement: StateElement,
  actionType: 'onentry' | 'onexit',
  actions: string[]
): void {
  if (actions.length === 0) {
    // Remove the action element if no actions
    if (actionType === 'onentry') {
      delete stateElement.onentry;
    } else {
      delete stateElement.onexit;
    }
    return;
  }

  // Create executable elements for the actions
  const executable = actions.map((action) => ({
    '@_label': 'Action',
    '@_expr': action,
  }));

  // Create the action element
  const actionElement = { executable };

  if (actionType === 'onentry') {
    stateElement.onentry = actionElement;
  } else {
    stateElement.onexit = actionElement;
  }
}

/**
 * Update state type (simple, compound, parallel, final)
 * Note: This is complex as it may require converting between element types
 * For now, we'll keep the state element and just ensure proper attributes
 */
export function updateStateType(
  stateElement: StateElement,
  newStateType: 'simple' | 'compound' | 'parallel' | 'final'
): void {
  // For final states, remove transitions since final states can't have outgoing transitions
  if (newStateType === 'final') {
    delete stateElement.transition;
    delete stateElement.state; // Final states can't have substates
    delete stateElement.parallel;
  }

  // For compound states, ensure they can have substates
  // (This is already supported by the StateElement structure)

  // For parallel states, this would require changing the element type entirely
  // which is complex, so we'll log a warning for now
  if (newStateType === 'parallel') {
    console.warn(
      'Converting to parallel state requires element type change - not fully implemented'
    );
  }
}

/**
 * Create a new state element
 */
export function createStateElement(
  id: string,
  stateType: 'simple' | 'compound' | 'parallel' | 'final' = 'simple',
  x?: number,
  y?: number,
  width?: number,
  height?: number
): StateElement {
  const element: StateElement = {
    '@_id': id,
  };

  // Add visual metadata if position provided
  if (x !== undefined && y !== undefined) {
    const w = width || 120; // Default width
    const h = height || 60; // Default height
    (element as any)['@_viz:xywh'] = `${x} ${y} ${w} ${h}`;
  }

  return element;
}

/**
 * Create a new transition element
 */
export function createTransitionElement(
  source: string,
  target: string,
  event?: string,
  condition?: string,
  actions?: string[]
): TransitionElement {
  const transition: TransitionElement = {
    '@_target': target,
  };

  if (event) {
    transition['@_event'] = event;
  }

  if (condition) {
    transition['@_cond'] = condition;
  }

  // Actions would be added as child elements, but for now we'll keep it simple

  return transition;
}

/**
 * Add a state to the SCXML document
 */
export function addStateToDocument(
  scxmlDoc: SCXMLDocument,
  stateElement: StateElement,
  parentId?: string
): void {
  if (parentId) {
    // Add to parent state
    const parentState = findStateById(scxmlDoc, parentId);
    if (parentState) {
      if (!parentState.state) {
        parentState.state = stateElement;
      } else if (Array.isArray(parentState.state)) {
        parentState.state.push(stateElement);
      } else {
        parentState.state = [parentState.state, stateElement];
      }
    }
  } else {
    // Add to root level
    if (!scxmlDoc.scxml.state) {
      scxmlDoc.scxml.state = stateElement;
    } else if (Array.isArray(scxmlDoc.scxml.state)) {
      scxmlDoc.scxml.state.push(stateElement);
    } else {
      scxmlDoc.scxml.state = [scxmlDoc.scxml.state, stateElement];
    }
  }
}

/**
 * Remove a state from the SCXML document
 */
export function removeStateFromDocument(
  scxmlDoc: SCXMLDocument,
  stateId: string
): void {
  function removeFromStates(
    states: StateElement | StateElement[] | undefined
  ): StateElement | StateElement[] | undefined {
    if (!states) return undefined;

    if (Array.isArray(states)) {
      const filtered = states.filter((state) => state['@_id'] !== stateId);
      filtered.forEach((state) => {
        state.state = removeFromStates(state.state) as any;
      });
      return filtered.length > 0 ? filtered : undefined;
    } else {
      if (states['@_id'] === stateId) {
        return undefined;
      }
      states.state = removeFromStates(states.state) as any;
      return states;
    }
  }

  // Remove the state's token from whichever parent's initial list contains it,
  // at any nesting level. Nested compound states must always retain at least
  // one initial marker if they still have children (validateCompoundStates
  // requires it); the document root has no such requirement, so it's left
  // empty ("unassigned") rather than force-picking a replacement.
  function stripInitialToken(container: { '@_initial'?: string }): void {
    if (!container['@_initial']) return;
    const tokens = container['@_initial'].split(/\s+/).filter((t) => t && t !== stateId);
    if (tokens.length > 0) {
      container['@_initial'] = tokens.join(' ');
    } else {
      delete container['@_initial'];
    }
  }

  function stripInitialTokenRecursive(
    states: StateElement | StateElement[] | undefined
  ): void {
    if (!states) return;
    const stateArray = Array.isArray(states) ? states : [states];
    stateArray.forEach((state) => {
      stripInitialToken(state);
      if (!state['@_initial'] && !state.initial) {
        const children = Array.isArray(state.state)
          ? state.state
          : state.state
            ? [state.state]
            : [];
        if (children.length > 0) {
          state['@_initial'] = children[0]['@_id'];
        }
      }
      stripInitialTokenRecursive(state.state);
    });
  }

  // Remove from document
  scxmlDoc.scxml.state = removeFromStates(scxmlDoc.scxml.state) as any;

  // Remove transitions that target this state
  removeTransitionsTargeting(scxmlDoc, stateId);

  // Clean up any initial-attribute references to the removed state
  stripInitialToken(scxmlDoc.scxml);
  stripInitialTokenRecursive(scxmlDoc.scxml.state);
}

/**
 * Remove all transitions targeting a specific state
 */
export function removeTransitionsTargeting(
  scxmlDoc: SCXMLDocument,
  targetStateId: string
): void {
  function removeTransitionsFromStates(
    states: StateElement | StateElement[] | undefined
  ) {
    if (!states) return;

    const stateArray = Array.isArray(states) ? states : [states];

    for (const state of stateArray) {
      // Remove transitions targeting the state
      if (state.transition) {
        if (Array.isArray(state.transition)) {
          state.transition = state.transition.filter(
            (t) => t['@_target'] !== targetStateId
          );
          if (state.transition.length === 0) {
            delete state.transition;
          }
        } else if (state.transition['@_target'] === targetStateId) {
          delete state.transition;
        }
      }

      // Recursively process nested states
      removeTransitionsFromStates(state.state);
      removeTransitionsFromStates(state.parallel);
    }
  }

  removeTransitionsFromStates(scxmlDoc.scxml.state);
  removeTransitionsFromStates(scxmlDoc.scxml.parallel);
}

/**
 * Find the first state element in the document
 */
export function findFirstState(scxmlDoc: SCXMLDocument): StateElement | null {
  function findInStates(
    states: StateElement | StateElement[] | undefined
  ): StateElement | null {
    if (!states) return null;

    if (Array.isArray(states)) {
      return states.length > 0 ? states[0] : null;
    } else {
      return states;
    }
  }

  return findInStates(scxmlDoc.scxml.state);
}

/**
 * Add a transition to a state element
 */
export function addTransitionToState(
  stateElement: StateElement,
  transition: TransitionElement
): void {
  if (!stateElement.transition) {
    stateElement.transition = transition;
  } else if (Array.isArray(stateElement.transition)) {
    stateElement.transition.push(transition);
  } else {
    stateElement.transition = [stateElement.transition, transition];
  }
}

/**
 * Remove a specific transition from a state element
 */
export function removeTransitionFromState(
  stateElement: StateElement,
  transitionIndex: number
): void {
  if (!stateElement.transition) return;

  if (Array.isArray(stateElement.transition)) {
    if (
      transitionIndex >= 0 &&
      transitionIndex < stateElement.transition.length
    ) {
      stateElement.transition.splice(transitionIndex, 1);
      if (stateElement.transition.length === 0) {
        delete stateElement.transition;
      } else if (stateElement.transition.length === 1) {
        stateElement.transition = stateElement.transition[0];
      }
    }
  } else if (transitionIndex === 0) {
    delete stateElement.transition;
  }
}

/**
 * Remove a specific transition by its edge ID
 * Edge ID format: "source-to-target-event[conditionHash]-idx{index}"
 */
export function removeTransitionByEdgeId(
  scxmlDoc: SCXMLDocument,
  edgeId: string
): boolean {
  // Try to parse the transition index from the edge ID (new deterministic format)
  const indexMatch = edgeId.match(/-idx(\d+)$/);

  if (indexMatch) {
    // New deterministic format: use the index directly
    const transitionIndex = parseInt(indexMatch[1], 10);

    // Parse source from edge ID
    const toIndex = edgeId.indexOf('-to-');
    if (toIndex === -1) return false;

    const sourceId = edgeId.substring(0, toIndex);

    // Find the source state
    const sourceState = findStateById(scxmlDoc, sourceId);
    if (!sourceState || !sourceState.transition) return false;

    // Remove transition by index
    const transitions = Array.isArray(sourceState.transition)
      ? sourceState.transition
      : [sourceState.transition];

    if (transitionIndex >= 0 && transitionIndex < transitions.length) {
      removeTransitionFromState(sourceState, transitionIndex);
      return true;
    }

    return false;
  }

  // Fallback for old format (backward compatibility)
  // Parse edge ID: source-to-target-event[conditionHash]-randomSuffix
  const toIndex = edgeId.indexOf('-to-');
  if (toIndex === -1) return false;

  const sourceId = edgeId.substring(0, toIndex);
  const remaining = edgeId.substring(toIndex + 4); // Skip '-to-'

  // Find the next dash after the target ID
  // The target ID might contain dashes, so we need to find where the event part starts
  const parts = remaining.split('-');
  if (parts.length < 2) return false;

  // Try to find the target state by checking each possible split
  let targetId = '';
  let eventPart = '';

  for (let i = 1; i <= parts.length - 1; i++) {
    const possibleTargetId = parts.slice(0, i).join('-');
    const possibleEventPart = parts[i];

    // Check if this target exists in the document
    if (findStateById(scxmlDoc, possibleTargetId)) {
      targetId = possibleTargetId;
      eventPart = possibleEventPart;
      break;
    }
  }

  if (!targetId) {
    // Fallback: assume single-word target
    targetId = parts[0];
    eventPart = parts[1] || '';
  }

  // Find the source state
  const sourceState = findStateById(scxmlDoc, sourceId);
  if (!sourceState || !sourceState.transition) return false;

  // Find and remove the matching transition
  const transitions = Array.isArray(sourceState.transition)
    ? sourceState.transition
    : [sourceState.transition];

  let foundIndex = -1;
  for (let i = 0; i < transitions.length; i++) {
    const transition = transitions[i];

    // Match by target
    if (transition['@_target'] === targetId) {
      // If the transition has an event, check if it matches
      const transitionEvent = transition['@_event'] || 'always';

      // The event part in the edge ID might be "event[conditionHash]-randomSuffix"
      // We only need to match the event name part
      if (eventPart === 'always' && !transition['@_event']) {
        foundIndex = i;
        break;
      } else if (eventPart && eventPart.startsWith(transitionEvent)) {
        foundIndex = i;
        break;
      }
    }
  }

  if (foundIndex >= 0) {
    removeTransitionFromState(sourceState, foundIndex);
    return true;
  }

  return false;
}

/**
 * Update the visual position metadata for a state
 */
export function updateStatePosition(
  stateElement: StateElement,
  x: number,
  y: number,
  width?: number,
  height?: number
): void {
  // Extract existing dimensions if not provided
  const currentXywh = (stateElement as any)['@_viz:xywh'];
  let w = width || 120; // Default width
  let h = height || 60; // Default height

  if (currentXywh && !width && !height) {
    const parts = currentXywh.split(' ');
    if (parts.length >= 4) {
      w = parseInt(parts[2]) || 120;
      h = parseInt(parts[3]) || 60;
    }
  }

  // Add or update visual metadata attributes using the parser's attribute format
  (stateElement as any)['@_viz:xywh'] = `${x} ${y} ${w} ${h}`;
}

/**
 * Removes a state's element from wherever it currently sits (root or
 * nested), fixing up the OLD parent's @_initial bookkeeping the same way
 * removeStateFromDocument does — but, unlike removeStateFromDocument, this
 * does NOT touch any transitions, since reparenting must keep every
 * transition targeting the moved state intact. Returns the detached
 * StateElement for re-insertion elsewhere, or null if not found.
 */
export function detachStateFromParent(
  scxmlDoc: SCXMLDocument,
  stateId: string
): StateElement | null {
  function fixInitial(
    container: { '@_initial'?: string; state?: StateElement | StateElement[] },
    isRoot: boolean
  ): void {
    if (container['@_initial']) {
      const tokens = container['@_initial']
        .split(/\s+/)
        .filter((t) => t && t !== stateId);
      if (tokens.length > 0) {
        container['@_initial'] = tokens.join(' ');
        return;
      }
      delete container['@_initial'];
    }
    if (!isRoot && !container['@_initial'] && container.state) {
      const remaining = Array.isArray(container.state)
        ? container.state
        : [container.state];
      if (remaining.length > 0) {
        container['@_initial'] = remaining[0]['@_id'];
      }
    }
  }

  function detachFrom(
    container: { state?: StateElement | StateElement[]; '@_initial'?: string },
    isRoot: boolean
  ): StateElement | null {
    const states = container.state;
    if (!states) return null;
    const arr = Array.isArray(states) ? states : [states];
    const idx = arr.findIndex((s) => s['@_id'] === stateId);

    if (idx !== -1) {
      const [removed] = arr.splice(idx, 1);
      container.state = arr.length > 0 ? arr : undefined;
      fixInitial(container, isRoot);
      return removed;
    }

    for (const s of arr) {
      const found = detachFrom(s, false);
      if (found) return found;
    }
    return null;
  }

  return detachFrom(scxmlDoc.scxml as any, true);
}

/**
 * Deep-clones a state (and its whole descendant subtree) with a fresh
 * unique id for every state in the clone, offsetting each cloned state's
 * viz:xywh position and rewriting each cloned compound state's own
 * @_initial to match. Descendant transitions are left as-is here — see
 * rewriteOrDropTransitions, applied separately once the full paste-wide id
 * map (across every top-level copied state) is known.
 *
 * existingIds is mutated as ids are claimed, so calling this once per
 * top-level copied state in a multi-state paste avoids id collisions
 * between the pasted states themselves.
 */
export function cloneStateSubtreeWithFreshIds(
  state: StateElement,
  existingIds: Set<string>,
  offsetX: number,
  offsetY: number
): { clone: StateElement; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const rootClone: StateElement = JSON.parse(JSON.stringify(state));

  function freshId(oldId: string): string {
    let candidate = `${oldId}_copy`;
    let n = 2;
    while (existingIds.has(candidate)) {
      candidate = `${oldId}_copy${n}`;
      n++;
    }
    existingIds.add(candidate);
    return candidate;
  }

  function offsetPosition(clone: StateElement): void {
    const xywh = (clone as any)['@_viz:xywh'];
    if (typeof xywh !== 'string') return;
    const parts = xywh.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length < 4) return;
    const [x, y, w, h] = parts;
    (clone as any)['@_viz:xywh'] = `${x + offsetX},${y + offsetY},${w},${h}`;
  }

  function assignIds(clone: StateElement): void {
    const oldId = clone['@_id'];
    clone['@_id'] = freshId(oldId);
    idMap.set(oldId, clone['@_id']);
    offsetPosition(clone);

    if (clone.state) {
      const children = Array.isArray(clone.state) ? clone.state : [clone.state];
      children.forEach(assignIds);
    }
  }

  function rewriteInitial(clone: StateElement): void {
    if (clone['@_initial']) {
      const tokens = clone['@_initial'].split(/\s+/).filter(Boolean);
      clone['@_initial'] = tokens.map((t) => idMap.get(t) || t).join(' ');
    }
    if (clone.state) {
      const children = Array.isArray(clone.state) ? clone.state : [clone.state];
      children.forEach(rewriteInitial);
    }
  }

  assignIds(rootClone);
  rewriteInitial(rootClone);

  return { clone: rootClone, idMap };
}

/**
 * Walks an already-cloned subtree's transitions at every depth: a
 * transition whose @_target is in idMap is rewritten to the mapped id; one
 * whose @_target is present but NOT in idMap (points outside the copied
 * set) is dropped entirely; a targetless transition is always kept.
 * Mutates the given clone in place.
 */
export function rewriteOrDropTransitions(
  state: StateElement,
  idMap: Map<string, string>
): void {
  function walk(s: StateElement): void {
    if (s.transition) {
      const arr = Array.isArray(s.transition) ? s.transition : [s.transition];
      const kept = arr
        .filter((t) => !t['@_target'] || idMap.has(t['@_target']))
        .map((t) =>
          t['@_target'] && idMap.has(t['@_target'])
            ? { ...t, '@_target': idMap.get(t['@_target'])! }
            : t
        );
      s.transition = kept.length === 0 ? undefined : kept.length === 1 ? kept[0] : kept;
    }

    if (s.state) {
      const children = Array.isArray(s.state) ? s.state : [s.state];
      children.forEach(walk);
    }
  }

  walk(state);
}
