/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SCXMLDocument, TransitionElement } from '@/types/scxml';
import { collectExistingIds, type StateTag } from './scxml-manipulation-utils';
import {
  buildStateParentMap,
  fixTransitionsAfterReparent,
  type RemovedTransition,
} from './reparent-transition-fix';

/**
 * "Group into composite state" (Multi-Select Toolbar): wraps the selected
 * sibling states in a new compound <state> — the one-click version of adding a
 * state and dragging the selection into it, so it follows drag-to-nest's rules
 * (handleReparent in visual-diagram.tsx):
 *
 * - The new state takes the selection's place in its parent, and becomes the
 *   parent's Initial State if any selected state was.
 * - Its own `initial` is whichever selected states were Initial — else the
 *   first selected non-final state in document order.
 * - Transitions between the selected states stay as they are. A transition
 *   from a sibling into the new state's sole Initial child is re-pointed at the
 *   new state (entering it enters that child, so behavior is unchanged). Every
 *   other transition the move turns cross-level is removed and reported, as
 *   drag-to-nest does (fixTransitionsAfterReparent).
 *
 * Pure object-tree edit; parallel normalization runs afterwards on the store's
 * normal setContent path.
 */

export type GroupIntoCompositeResult =
  | {
      ok: true;
      compositeId: string;
      removedTransitions: RemovedTransition[];
      retargetedCount: number;
    }
  | { ok: false; error: string };

export interface GroupIntoCompositeOptions {
  /** Extra taken ids (e.g. rendered sticky notes) for minting the new id. */
  extraNodes?: ReadonlyArray<{ id: string }>;
}

const STATE_TAGS = ['state', 'parallel', 'final'] as const;

function asList<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function setList(container: any, key: string, items: any[]): void {
  if (items.length === 0) delete container[key];
  else container[key] = items.length === 1 ? items[0] : items;
}

interface Located {
  parent: any;
  parentTag: StateTag | 'scxml';
}

function locate(scxmlDoc: SCXMLDocument, id: string): Located | null {
  function search(container: any, containerTag: StateTag | 'scxml'): Located | null {
    for (const tag of STATE_TAGS) {
      for (const child of asList<any>(container[tag])) {
        if (child['@_id'] === id) return { parent: container, parentTag: containerTag };
        const found = search(child, tag);
        if (found) return found;
      }
    }
    return null;
  }
  return search(scxmlDoc.scxml, 'scxml');
}

function nextFreeStateId(taken: Set<string>): string {
  let n = 1;
  while (taken.has(`state_${n}`)) n++;
  return `state_${n}`;
}

function splitIds(value: unknown): string[] {
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

/** Calls `fn` on every <state>/<parallel>/<final>, at any depth. */
function forEachStateElement(scxmlDoc: SCXMLDocument, fn: (el: any) => void): void {
  function walk(container: any): void {
    for (const tag of STATE_TAGS) {
      for (const child of asList<any>(container[tag])) {
        fn(child);
        walk(child);
      }
    }
  }
  walk(scxmlDoc.scxml);
}

export function groupStatesIntoComposite(
  scxmlDoc: SCXMLDocument,
  stateIds: Iterable<string>,
  options: GroupIntoCompositeOptions = {}
): GroupIntoCompositeResult {
  const ids = [...new Set(stateIds)];
  if (ids.length === 0) return { ok: false, error: 'Select one or more states to group.' };

  let parent: any = null;
  let parentTag: StateTag | 'scxml' = 'scxml';
  for (const id of ids) {
    const found = locate(scxmlDoc, id);
    if (!found) return { ok: false, error: `State '${id}' was not found.` };
    if (parent && found.parent !== parent) {
      return {
        ok: false,
        error: 'Only states at the same level (and in the same region) can be grouped together.',
      };
    }
    parent = found.parent;
    parentTag = found.parentTag;
  }
  if (parentTag === 'parallel') {
    return { ok: false, error: 'A region of a parallel state cannot be moved into a composite state.' };
  }

  const selected = new Set(ids);
  const parentsBefore = buildStateParentMap(scxmlDoc);
  const compositeId = nextFreeStateId(collectExistingIds(scxmlDoc, options.extraNodes));
  const composite: any = { '@_id': compositeId };

  // Move the selection under the new state, keeping document order and each
  // element's tag (a <parallel> stays a <parallel>, a <final> a <final>).
  let insertAt = -1;
  const movedInOrder: { el: any; tag: StateTag }[] = [];
  for (const tag of STATE_TAGS) {
    const children = asList<any>(parent[tag]);
    const kept: any[] = [];
    const moved: any[] = [];
    children.forEach((child) => {
      if (selected.has(child['@_id'])) {
        if (tag === 'state' && insertAt === -1) insertAt = kept.length;
        moved.push(child);
        movedInOrder.push({ el: child, tag });
      } else {
        kept.push(child);
      }
    });
    if (moved.length === 0) continue;
    setList(parent, tag, kept);
    setList(composite, tag, moved);
  }

  // Which selected states were where the parent starts — its `initial`
  // attribute, or the legacy <initial><transition target> child element.
  const parentInitialTokens = splitIds(parent['@_initial']);
  const legacyInitialTransitions = asList<TransitionElement>(parent.initial?.transition);
  const legacyTargets = legacyInitialTransitions.flatMap((t) => splitIds(t['@_target']));
  const wasInitial = [...parentInitialTokens, ...legacyTargets].filter(
    (id, i, all) => selected.has(id) && all.indexOf(id) === i
  );

  if (wasInitial.length > 0) {
    composite['@_initial'] = wasInitial.join(' ');
  } else {
    const firstNonFinal = movedInOrder.find((m) => m.tag !== 'final');
    if (firstNonFinal) composite['@_initial'] = firstNonFinal.el['@_id'];
  }

  // The new state replaces the selected ones in the parent's initial marking.
  const replaceTokens = (tokens: string[]): string[] => {
    const out: string[] = [];
    tokens.forEach((t) => {
      const next = selected.has(t) ? compositeId : t;
      if (!out.includes(next)) out.push(next);
    });
    return out;
  };
  if (parentInitialTokens.length > 0) {
    parent['@_initial'] = replaceTokens(parentInitialTokens).join(' ');
  }
  legacyInitialTransitions.forEach((t) => {
    const targets = splitIds(t['@_target']);
    if (targets.some((id) => selected.has(id))) t['@_target'] = replaceTokens(targets).join(' ');
  });

  // Insert the new state where the first selected <state> was.
  const parentStates = asList<any>(parent.state);
  parentStates.splice(insertAt === -1 ? parentStates.length : insertAt, 0, composite);
  setList(parent, 'state', parentStates);

  // A sibling's transition into the new state's sole Initial child means the
  // same thing aimed at the new state itself — keep it, re-pointed.
  let retargetedCount = 0;
  const entryIds = splitIds(composite['@_initial']);
  if (entryIds.length === 1) {
    const entryId = entryIds[0];
    const siblingParent = parentsBefore.get(entryId);
    forEachStateElement(scxmlDoc, (el) => {
      const sourceId = el['@_id'];
      if (!sourceId || selected.has(sourceId) || parentsBefore.get(sourceId) !== siblingParent) return;
      asList<TransitionElement>(el.transition).forEach((t: any) => {
        const targets = splitIds(t['@_target']);
        if (targets.length === 1 && targets[0] === entryId) {
          t['@_target'] = compositeId;
          // Its persisted route ended at the old target.
          delete t['@_viz:waypoints'];
          retargetedCount++;
        }
      });
    });
  }

  const removedTransitions = fixTransitionsAfterReparent(scxmlDoc, ids, parentsBefore);
  return { ok: true, compositeId, removedTransitions, retargetedCount };
}
