import type { SCXMLDocument, TransitionElement } from '@/types/scxml';
import { buildStateHierarchy } from '@/lib/validators/state-validator';
import { findTimeEventToken } from './time-transition';

/**
 * Drag-to-nest (issue #81) moves `<state>` elements under a new parent. Any transition
 * between a moved state and a state left outside then spans two hierarchy levels, which
 * this product forbids (the "cross-hierarchy" rule — decisions/scxml.md #2): the canvas
 * hides it and validation flags it, but it stays in the document and reaches the runtime.
 *
 * fixTransitionsAfterReparent removes exactly the transitions the move broke, in both
 * directions (into and out of the moved states). Transitions between states moved
 * together stay; transitions that were already cross-level before the move are left
 * alone — not ours to change. A removed "after X" timer transition also takes its
 * onentry `<send>` / onexit `<cancel>` with it, unless another transition on the same
 * state still uses that timer.
 *
 * "Same parent" uses the validator's own hierarchy map (buildStateHierarchy), so this
 * removes precisely what validateCrossHierarchyTransitions would otherwise report.
 */

export type StateParentMap = Map<string, string | null>;

export interface RemovedTransition {
  sourceId: string;
  targetId: string;
  event?: string;
  cond?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Container = {
  '@_id'?: string;
  transition?: TransitionElement | TransitionElement[];
  onentry?: any;
  onexit?: any;
  state?: any;
  parallel?: any;
  final?: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function buildStateParentMap(scxmlDoc: SCXMLDocument): StateParentMap {
  const map: StateParentMap = new Map();
  buildStateHierarchy(scxmlDoc.scxml, map);
  return map;
}

/** Every <state>/<parallel>/<final> element by id. */
function collectContainers(scxmlDoc: SCXMLDocument): Map<string, Container> {
  const result = new Map<string, Container>();
  function walk(container: Container): void {
    for (const tag of ['state', 'parallel', 'final'] as const) {
      for (const child of toArray<Container>(container[tag])) {
        if (child && typeof child === 'object') {
          if (child['@_id']) result.set(child['@_id'], child);
          walk(child);
        }
      }
    }
  }
  walk(scxmlDoc.scxml as unknown as Container);
  return result;
}

function sameParent(map: StateParentMap, a: string, b: string): boolean {
  const pa = map.get(a);
  const pb = map.get(b);
  // Unknown ids (typos, history pseudo-states, …) aren't judged — same as the validator.
  if (pa === undefined || pb === undefined) return true;
  return pa === pb;
}

function targetsOf(t: TransitionElement): string[] {
  return (t['@_target'] ?? '').split(/\s+/).filter(Boolean);
}

/**
 * Removes the timer's onentry <send event=token> / onexit <cancel sendid=token> from a
 * state (object-tree shape from fast-xml-parser: each block holds `send`/`cancel` as an
 * object or array), dropping blocks left empty.
 */
function removeTimerActions(state: Container, token: string): void {
  const strip = (blockKey: 'onentry' | 'onexit', actionKey: 'send' | 'cancel', attr: string) => {
    const blocks = toArray(state[blockKey]);
    if (blocks.length === 0) return;
    const keptBlocks = blocks.filter((block) => {
      if (!block || typeof block !== 'object') return true;
      const actions = toArray(block[actionKey]);
      if (actions.length === 0) return true;
      const keptActions = actions.filter((a) => a?.[attr] !== token);
      if (keptActions.length === actions.length) return true;
      if (keptActions.length === 0) delete block[actionKey];
      else block[actionKey] = keptActions.length === 1 ? keptActions[0] : keptActions;
      return Object.keys(block).length > 0;
    });
    if (keptBlocks.length === 0) delete state[blockKey];
    else state[blockKey] = keptBlocks.length === 1 ? keptBlocks[0] : keptBlocks;
  };
  strip('onentry', 'send', '@_event');
  strip('onexit', 'cancel', '@_sendid');
}

/**
 * Call after the move, passing the hierarchy captured *before* it
 * (`buildStateParentMap(doc)` ahead of detaching anything). Mutates the document and
 * returns the removed transitions, for the user-facing notice.
 */
export function fixTransitionsAfterReparent(
  scxmlDoc: SCXMLDocument,
  movedIds: string[],
  parentsBefore: StateParentMap
): RemovedTransition[] {
  const moved = new Set(movedIds);
  const parentsAfter = buildStateParentMap(scxmlDoc);
  const removed: RemovedTransition[] = [];

  for (const [sourceId, element] of collectContainers(scxmlDoc)) {
    const transitions = toArray(element.transition);
    if (transitions.length === 0) continue;

    const kept: TransitionElement[] = [];
    const removedTimerTokens: string[] = [];

    for (const t of transitions) {
      const targets = targetsOf(t);
      const brokenByMove =
        (moved.has(sourceId) || targets.some((id) => moved.has(id))) &&
        targets.length > 0 &&
        targets.every((id) => sameParent(parentsBefore, sourceId, id)) &&
        !targets.every((id) => sameParent(parentsAfter, sourceId, id));

      if (!brokenByMove) {
        kept.push(t);
        continue;
      }

      removed.push({ sourceId, targetId: targets.join(' '), event: t['@_event'], cond: t['@_cond'] });
      const token = findTimeEventToken(t['@_event']);
      if (token) removedTimerTokens.push(token);
    }

    if (kept.length === transitions.length) continue;

    if (kept.length === 0) delete element.transition;
    else element.transition = kept.length === 1 ? kept[0] : kept;

    for (const token of removedTimerTokens) {
      const stillUsed = kept.some((t) => findTimeEventToken(t['@_event']) === token);
      if (!stillUsed) removeTimerActions(element, token);
    }
  }

  return removed;
}

function describe(t: RemovedTransition): string {
  const label = [t.event, t.cond && `[${t.cond}]`].filter(Boolean).join(' ');
  return `${t.sourceId} → ${t.targetId}${label ? ` (${label})` : ''}`;
}

const MAX_LISTED = 4;

/**
 * User-facing summary for the toast, or null when nothing was removed. Time-event
 * transitions show their raw event name here — acceptable for a one-off notice.
 */
export function describeRemovedTransitions(removed: RemovedTransition[]): string | null {
  if (removed.length === 0) return null;
  const shown = removed.slice(0, MAX_LISTED).map(describe).join(', ');
  const more = removed.length - MAX_LISTED;
  const list = more > 0 ? `${shown} and ${more} more` : shown;
  return (
    `Removed ${removed.length} transition${removed.length === 1 ? '' : 's'} that would cross ` +
    `hierarchy levels: ${list}. Undo to restore.`
  );
}
