// scxml-manipulation-utils.ts
import type {
  SCXMLDocument,
  StateElement,
  ParallelElement,
  TransitionElement,
  OnEntryElement,
  OnExitElement,
} from '@/types/scxml';
import { collectStateIds } from '@/lib/validators/state-validator';
import { getChildEntries, type ChildEntry } from '@/lib/utils/parallel-structure';

/** Which tag an element is filed under in its parent: `.state`, `.parallel` or `.final`. */
export type StateTag = 'state' | 'parallel' | 'final';

const STATE_TAGS = ['state', 'parallel', 'final'] as const;

function asList<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Put `el` under `container[key]`, keeping fast-xml-parser's single-object/array shape. */
function appendChild(container: any, key: StateTag, el: any): void {
  const existing = container[key];
  if (!existing) container[key] = el;
  else if (Array.isArray(existing)) existing.push(el);
  else container[key] = [existing, el];
}

/**
 * Find a <state>, <parallel> or <final> by its ID anywhere in the document,
 * along with its tag — so callers that move or re-insert it (paste,
 * drag-to-nest) keep a <parallel> a <parallel> and a <final> a <final>.
 */
export function findElementById(
  scxmlDoc: SCXMLDocument,
  stateId: string
): { element: StateElement; tag: StateTag } | null {
  function search(container: any): { element: StateElement; tag: StateTag } | null {
    for (const tag of STATE_TAGS) {
      for (const child of asList<any>(container[tag])) {
        if (child['@_id'] === stateId) return { element: child, tag };
        const found = search(child);
        if (found) return found;
      }
    }
    return null;
  }
  return search(scxmlDoc.scxml);
}

/**
 * Every id already taken — each <state>/<parallel>/<final>/<history> anywhere
 * in the document, plus any extra ids (e.g. rendered diagram nodes such as
 * sticky notes). Use this, not just the rendered nodes, when minting a new
 * id: some elements are never rendered as nodes (the regions of a
 * <parallel> are drawn as columns, and `__root_parallel` is invisible), so
 * a node-only check could reuse one of their ids.
 */
export function collectExistingIds(
  scxmlDoc: SCXMLDocument,
  extraNodes: ReadonlyArray<{ id: string }> = []
): Set<string> {
  const ids = new Set<string>(extraNodes.map((n) => n.id));
  collectStateIds(scxmlDoc.scxml, ids);
  return ids;
}

/**
 * Find a state element by its ID in the SCXML document. Also searches
 * inside <parallel> elements and their region <state> children, at any
 * nesting depth, so ids that only exist inside a parallel's regions are
 * still found by every mutation helper that resolves ids through this. A
 * <parallel>'s own id matches too — a compound state converted into a
 * <parallel> (parallel-group-normalization.ts) is still the user's state.
 * Use findElementById when the tag matters.
 */
export function findStateById(
  scxmlDoc: SCXMLDocument,
  stateId: string
): StateElement | null {
  return findElementById(scxmlDoc, stateId)?.element ?? null;
}

/**
 * Whether `stateId` is a <final> element. A final state has no outgoing
 * transitions, so it can never be a transition source.
 */
export function isFinalState(scxmlDoc: SCXMLDocument, stateId: string): boolean {
  return findElementById(scxmlDoc, stateId)?.tag === 'final';
}

/**
 * Where the canvas "Add Final State" button puts a new <final>. Final states
 * are only added while viewing inside a <parallel> (`parallelId`), and a
 * <parallel> can't hold a <final> directly, so it goes into the region
 * (<state> child of the <parallel>) containing the selected state(s). Returns
 * that region's id, or a user-facing reason it can't be added.
 */
export function resolveFinalStateRegion(
  scxmlDoc: SCXMLDocument,
  parallelId: string | null | undefined,
  selectedIds: Iterable<string>
): { regionId: string } | { error: string } {
  const parallel = parallelId ? findElementById(scxmlDoc, parallelId) : null;
  if (!parallel || parallel.tag !== 'parallel') {
    return { error: 'Final states can only be added inside a parallel state.' };
  }

  const regions = getChildEntries(parallel.element);
  const chosen = new Set<ChildEntry>();
  for (const id of selectedIds) {
    const region = regions.find(
      (r) => r.el['@_id'] === id || isDescendantOf(scxmlDoc, id, r.el['@_id'])
    );
    if (region) chosen.add(region);
  }

  if (chosen.size === 0) {
    return { error: 'Select a state in the region where the final state should go.' };
  }
  if (chosen.size > 1) {
    return { error: 'Select states from a single region to add a final state.' };
  }
  const [region] = chosen;
  if (region.tag !== 'state') {
    return { error: 'A final state cannot be added directly inside a parallel state.' };
  }
  return { regionId: region.el['@_id'] };
}

/**
 * Whether candidateId is nested anywhere inside ancestorId's subtree
 * (not counting ancestorId itself), through <state>, <parallel> and
 * <final> children (a <final> is a leaf, so it only ever matches itself).
 */
export function isDescendantOf(
  scxmlDoc: SCXMLDocument,
  candidateId: string,
  ancestorId: string
): boolean {
  const ancestor = findStateById(scxmlDoc, ancestorId);
  if (!ancestor) return false;

  function search(container: any): boolean {
    const children = STATE_TAGS.flatMap((tag) => asList<any>(container[tag]));
    for (const s of children) {
      if (s['@_id'] === candidateId) return true;
      if (search(s)) return true;
    }
    return false;
  }

  return search(ancestor);
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
 * Add a state to the SCXML document, under `parentId` (any <state> or
 * <parallel>) or at the root. `tag` says whether it goes in as a <state> or
 * a <parallel> — pass the tag it was found/copied with so a <parallel>
 * stays a <parallel>.
 */
export function addStateToDocument(
  scxmlDoc: SCXMLDocument,
  stateElement: StateElement,
  parentId?: string,
  tag: StateTag = 'state'
): void {
  const parent = parentId ? findStateById(scxmlDoc, parentId) : scxmlDoc.scxml;
  if (parent) appendChild(parent, tag, stateElement);
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
 * Removes a <state>, <parallel> or <final> from wherever it currently sits (root or
 * nested, including inside a <parallel>), fixing up the OLD parent's
 * @_initial bookkeeping the same way removeStateFromDocument does — but,
 * unlike removeStateFromDocument, this does NOT touch any transitions, since
 * reparenting must keep every transition targeting the moved state intact.
 * Returns the detached element and its tag for re-insertion elsewhere (see
 * addStateToDocument), or null if not found. A <parallel> parent never gets
 * an `initial` (its children are all active).
 */
export function detachElementFromParent(
  scxmlDoc: SCXMLDocument,
  stateId: string
): { element: StateElement; tag: StateTag } | null {
  function fixInitial(container: any, kind: 'root' | 'state' | 'parallel'): void {
    if (kind === 'parallel') return;
    if (container['@_initial']) {
      const tokens = String(container['@_initial'])
        .split(/\s+/)
        .filter((t) => t && t !== stateId);
      if (tokens.length > 0) {
        container['@_initial'] = tokens.join(' ');
        return;
      }
      delete container['@_initial'];
    }
    if (kind === 'state' && !container['@_initial']) {
      const remaining = [...asList<any>(container.state), ...asList<any>(container.parallel)];
      if (remaining.length > 0) {
        container['@_initial'] = remaining[0]['@_id'];
      }
    }
  }

  function detachFrom(
    container: any,
    kind: 'root' | 'state' | 'parallel'
  ): { element: StateElement; tag: StateTag } | null {
    for (const tag of STATE_TAGS) {
      const arr = asList<any>(container[tag]);
      const idx = arr.findIndex((s) => s['@_id'] === stateId);
      if (idx !== -1) {
        const remaining = arr.filter((_, i) => i !== idx);
        if (remaining.length === 0) delete container[tag];
        else container[tag] = remaining;
        fixInitial(container, kind);
        return { element: arr[idx], tag };
      }
    }
    for (const tag of ['state', 'parallel'] as const) {
      for (const child of asList<any>(container[tag])) {
        const found = detachFrom(child, tag);
        if (found) return found;
      }
    }
    return null;
  }

  return detachFrom(scxmlDoc.scxml, 'root');
}

/** detachElementFromParent, returning only the element. */
export function detachStateFromParent(
  scxmlDoc: SCXMLDocument,
  stateId: string
): StateElement | null {
  return detachElementFromParent(scxmlDoc, stateId)?.element ?? null;
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
    // If the original id is no longer taken (e.g. a cut removed it from the
    // document before this paste), reuse it as-is rather than manufacturing
    // a "_copy" suffix — that suffix only makes sense when the source state
    // still exists elsewhere and a paste needs a distinct id to avoid a
    // collision with it.
    if (!existingIds.has(oldId)) {
      existingIds.add(oldId);
      return oldId;
    }

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

    // <final> children need fresh ids (and offset positions) too — otherwise a
    // pasted copy duplicates their ids, and transitions into them are dropped
    // by rewriteOrDropTransitions since their old ids aren't in idMap. They
    // have no child states/initial/transitions, so the other walks skip them.
    [
      ...asList<any>(clone.state),
      ...asList<any>((clone as any).parallel),
      ...asList<any>((clone as any).final),
    ].forEach(assignIds);
  }

  function rewriteInitial(clone: StateElement): void {
    if (clone['@_initial']) {
      const tokens = clone['@_initial'].split(/\s+/).filter(Boolean);
      clone['@_initial'] = tokens.map((t) => idMap.get(t) || t).join(' ');
    }
    // Legacy <initial><transition target="X"/></initial> child-element form
    // (see decisions/scxml.md #4) isn't normalized away until the user
    // explicitly toggles that state's Initial flag — a document can still
    // carry it, and a clone must remap its target the same way @_initial is
    // remapped above, or the pasted copy's initial marking dangles, pointing
    // at an id that only exists in the original (un-copied) subtree.
    if (clone.initial) {
      const transitions = Array.isArray(clone.initial.transition)
        ? clone.initial.transition
        : [clone.initial.transition];
      transitions.forEach((t) => {
        if (t['@_target'] && idMap.has(t['@_target'])) {
          t['@_target'] = idMap.get(t['@_target'])!;
        }
      });
    }
    [...asList<any>(clone.state), ...asList<any>((clone as any).parallel)].forEach(rewriteInitial);
  }

  assignIds(rootClone);
  rewriteInitial(rootClone);

  return { clone: rootClone, idMap };
}

/**
 * "Initial" is a property of the *parent* container's own attribute, not of
 * the state element being copied (see initial-group-utils.ts's
 * isMarkedInitial) — so cloneStateSubtreeWithFreshIds, which only sees the
 * state being copied, has no way to carry it over on its own. This decides
 * whether a paste should apply it to the new parent: only when that parent
 * had no Initial marking of its own before the paste, mirroring the same
 * "an empty container adopts its first dropped member as Initial for free"
 * convention drag-to-reparent already uses (visual-diagram.tsx's
 * handleReparent) — pasting into a parent that already designates an
 * Initial state must not silently override or merge into it.
 *
 * Every formerly-Initial copied id is carried over, not just the first —
 * copying/cutting 2+ members of a Parallel State (each one is Initial in its
 * own region/work tree; that's exactly what made them a Parallel State in
 * the first place, see parallel-group-normalization.ts) needs all of them
 * reproduced as a multi-value `@_initial` on the new parent so the very same
 * "2+ distinct Initial work trees" auto-wrap normalization that originally
 * created the `<parallel>` element re-triggers on the pasted copy too —
 * carrying over only one would leave the rest as ordinary flat siblings,
 * silently dropping the parallel structure on paste.
 *
 * @param copied the original (pre-paste) clipboard states, each still
 *   carrying its old id
 * @param copiedInitialIds which of those old ids were Initial in their
 *   source parent at copy time
 * @param combinedIdMap old id -> new id, as produced by
 *   cloneStateSubtreeWithFreshIds for every top-level pasted state
 * @param targetHadNoInitial whether the paste's target container had zero
 *   Initial ids of its own, checked *before* the paste's clones were added
 * @returns the new ids that should become the target container's `@_initial`
 *   (space-separated when writing them onto the attribute), or an empty
 *   array if nothing should be carried over
 */
export function resolveCarriedOverInitialIds(
  copied: StateElement[],
  copiedInitialIds: Set<string>,
  combinedIdMap: Map<string, string>,
  targetHadNoInitial: boolean
): string[] {
  if (!targetHadNoInitial) return [];
  return copied
    .filter((state) => copiedInitialIds.has(state['@_id']))
    .map((state) => combinedIdMap.get(state['@_id']))
    .filter((id): id is string => Boolean(id));
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

    [...asList<any>(s.state), ...asList<any>((s as any).parallel)].forEach(walk);
  }

  walk(state);
}
