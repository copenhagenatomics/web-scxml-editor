/**
 * "No nested parallel states" rule: a <parallel> (including the transparent
 * `__root_parallel` / `{id}__parallel` the editor inserts) may never sit
 * anywhere inside another <parallel>.
 *
 * Nesting is rarely created directly — it comes out of
 * normalizeParallelGroups (parallel-group-normalization.ts), which turns a
 * container with 2+ Initial work trees into a <parallel>. That container
 * may already be inside a parallel's region, or one of its work trees may
 * already hold a parallel. Rather than re-deriving the normalizer's rules,
 * the live checks here apply the edit to a copy of the document, normalize
 * it, and look for a nested parallel that wasn't there before.
 *
 * Shared by the live gates (ToggleInitialStateCommand — whose refusal the
 * canvas shows as a warning when the Initial checkbox is clicked —
 * onConnect/isValidConnection, paste, drag-to-nest) and the static
 * validator (parallel-nesting-validator.ts), so both sides stay in step.
 */
import type { SCXMLDocument } from '@/types/scxml';
import { normalizeParallelGroups } from './parallel-group-normalization';
import { findParentEntry, getInitialIds, isParallelRegion } from './initial-group-utils';
import { findElementById } from './scxml-manipulation-utils';
import { isTransparentParallel, type ContainerKind } from './parallel-structure';

export const NESTED_PARALLEL_MESSAGE =
  'Parallel states cannot be nested: this would put a parallel state inside another parallel state.';

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export interface NestedParallel {
  /** The nested <parallel>'s own id. */
  parallelId: string;
  /**
   * The id to point the user at: the nested <parallel> itself, or — for a
   * transparent `{id}__parallel`, which is never drawn — its host state.
   */
  stateId: string;
  /** The nearest enclosing <parallel>'s id. */
  outerParallelId: string;
}

/** Every <parallel> that has another <parallel> among its ancestors. */
export function findNestedParallels(scxmlDoc: SCXMLDocument): NestedParallel[] {
  const result: NestedParallel[] = [];

  function walk(el: any, kind: ContainerKind, outer: string | null): void {
    if (!el || typeof el !== 'object') return;
    asArray<any>(el.state).forEach((child) => walk(child, 'state', outer));
    asArray<any>(el.parallel).forEach((p) => {
      const id = p['@_id'] as string;
      if (outer !== null) {
        result.push({
          parallelId: id,
          stateId: isTransparentParallel(p, kind) ? el['@_id'] : id,
          outerParallelId: outer,
        });
      }
      walk(p, 'parallel', id);
    });
  }

  walk(scxmlDoc.scxml, 'root', null);
  return result;
}

function cloneDoc(scxmlDoc: SCXMLDocument): SCXMLDocument {
  return JSON.parse(JSON.stringify(scxmlDoc));
}

function nestedIdsAfterNormalizing(scxmlDoc: SCXMLDocument): Set<string> {
  const copy = cloneDoc(scxmlDoc);
  normalizeParallelGroups(copy);
  return new Set(findNestedParallels(copy).map((n) => n.parallelId));
}

export interface NestingCheck {
  blocked: boolean;
  reason?: string;
}

/**
 * Whether `after` (an edited copy of `before`, not yet normalized) ends up,
 * once normalized, with a nested <parallel> that `before` didn't have.
 * Nesting `before` already had (hand-written XML) is left to the validator,
 * so it doesn't block unrelated edits.
 */
export function introducesNestedParallel(
  before: SCXMLDocument,
  after: SCXMLDocument,
): NestingCheck {
  const existing = nestedIdsAfterNormalizing(before);
  const created = [...nestedIdsAfterNormalizing(after)].some((id) => !existing.has(id));
  return created ? { blocked: true, reason: NESTED_PARALLEL_MESSAGE } : { blocked: false };
}

/**
 * Whether marking stateId as an Initial State would nest a <parallel> —
 * e.g. a second Initial work tree inside a parallel's region, or next to a
 * work tree that already contains a parallel state.
 */
export function wouldNestParallelIfMarkedInitial(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): NestingCheck {
  const entry = findParentEntry(scxmlDoc, stateId);
  if (!entry || entry.kind === 'parallel' || isParallelRegion(scxmlDoc, stateId)) {
    return { blocked: false };
  }
  const current = getInitialIds(entry.container, entry.kind);
  if (current.has(stateId)) return { blocked: false };

  // Mirror ToggleInitialStateCommand: write the expanded id list back.
  const after = cloneDoc(scxmlDoc);
  const containerId = (entry.container as any)['@_id'] as string | undefined;
  const container: any = containerId
    ? findElementById(after, containerId)?.element
    : after.scxml;
  if (!container) return { blocked: false };
  container['@_initial'] = [...current, stateId].join(' ');
  delete container.initial;
  return introducesNestedParallel(scxmlDoc, after);
}

/**
 * Whether adding a transition sourceId -> targetId would nest a <parallel> —
 * connecting a loose state to a region member moves it into that region
 * (absorbLooseIntoRegions), so a loose state holding a parallel would end
 * up nested.
 */
export function wouldNestParallelIfConnected(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  targetId: string,
): NestingCheck {
  const after = cloneDoc(scxmlDoc);
  const source: any = findElementById(after, sourceId)?.element;
  if (!source || !findElementById(after, targetId)) return { blocked: false };
  source.transition = [...asArray<any>(source.transition), { '@_target': targetId }];
  return introducesNestedParallel(scxmlDoc, after);
}
