/**
 * Live structural transform for the "multiple Initial State work trees"
 * feature: whenever a compound <state> has 2+ distinct Initial-marked work
 * trees among its direct children, that state itself becomes a real,
 * standards-conformant <parallel> — same object, same id, transitions,
 * onentry/onexit and viz: attributes; only the tag changes — with one region
 * per work tree. There is never a <state> wrapper left above it.
 *
 * - Each work tree is wrapped in its own region
 *   <state id="{initialId}_region" initial="{initialId}"> (decision
 *   scxml.md #11: a <parallel>'s direct children are never bare leaf
 *   states). Children that aren't part of any work tree (unassigned) get
 *   one more region of their own, so converting never drops them.
 * - A state with <final> children is never converted (<parallel> can't hold
 *   <final>) — initial-group-validator.ts reports it instead.
 * - Any <parallel> (converted or hand-authored — no marker attributes tell
 *   them apart) with fewer than 2 regions turns back into a <state>, its
 *   sole region (if any) becoming its `initial`. Regions are kept as they
 *   are, not unwrapped.
 * - The <scxml> root can't become a <parallel>, so 2+ root-level work trees
 *   go into one inserted `<parallel id="__root_parallel">` instead (see
 *   parallel-structure.ts) — the only element this feature ever inserts.
 *
 * Pure, operates on the parsed SCXMLDocument object model, recomputes
 * everything fresh on every call (nothing is persisted beyond the document
 * itself) — same style as initial-group-utils.ts, which this module reuses
 * for the underlying connected-component analysis.
 */
import type { SCXMLDocument, SCXMLElement, StateElement, ParallelElement } from '@/types/scxml';
import { getInitialIds, analyzeGroups } from './initial-group-utils';
import {
  ROOT_PARALLEL_ID,
  getChildEntries,
  getRegionDisplayEntries,
  isRootParallel,
  type ChildEntry,
} from './parallel-structure';

type Container = SCXMLElement | StateElement | ParallelElement;

/** Marker attributes written by older versions of this feature — stripped on sight. */
const LEGACY_MARKERS = ['@_viz:auto-parallel', '@_viz:auto-region', '@_viz:auto-converted'];

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** fast-xml-parser's child shape: absent, a single object, or an array. */
function setChildren(target: any, key: 'state' | 'parallel', items: any[]): void {
  if (items.length === 0) delete target[key];
  else target[key] = items.length === 1 ? items[0] : items;
}

/** Put entries under `target`, each under its own tag. */
function assignEntries(target: any, entries: ChildEntry[]): void {
  setChildren(target, 'state', entries.filter((e) => e.tag === 'state').map((e) => e.el));
  setChildren(target, 'parallel', entries.filter((e) => e.tag === 'parallel').map((e) => e.el));
}

/** Undirected sibling transition edges among an explicit list of states. */
function siblingEdgesFor(members: any[]): [string, string][] {
  const memberIds = new Set(members.map((m) => m['@_id']));
  const edges: [string, string][] = [];
  members.forEach((member) => {
    asArray<any>(member.transition).forEach((t) => {
      if (!t['@_target']) return;
      String(t['@_target'])
        .split(/\s+/)
        .filter(Boolean)
        .forEach((target) => {
          if (memberIds.has(target) && target !== member['@_id']) {
            edges.push([member['@_id'], target]);
          }
        });
    });
  });
  return edges;
}

/**
 * Split entries into Initial work trees (keyed by their Initial id, in
 * first-seen order) and the unassigned rest.
 */
function groupEntries(
  entries: ChildEntry[],
  initialIds: Set<string>,
): { groups: Map<string, ChildEntry[]>; unassigned: ChildEntry[] } {
  const ids = entries.map((e) => e.el['@_id']);
  const { groupsByState } = analyzeGroups(ids, initialIds, siblingEdgesFor(entries.map((e) => e.el)));
  const groups = new Map<string, ChildEntry[]>();
  const unassigned: ChildEntry[] = [];
  entries.forEach((entry) => {
    const root = groupsByState.get(entry.el['@_id']);
    if (!root) {
      unassigned.push(entry);
      return;
    }
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(entry);
  });
  return { groups, unassigned };
}

/**
 * Recursively collect every `@_id` in the document, so a freshly minted
 * `{id}_region` / `__root_parallel` can be checked against every other id in
 * the document — otherwise a synthesized id could silently collide with an
 * unrelated, hand-authored element elsewhere that happens to share it.
 */
type IdSet = Set<string>;

function collectAllIds(container: Container, ids: IdSet = new Set()): IdSet {
  asArray<any>(container.state).forEach((s) => {
    if (s['@_id']) ids.add(s['@_id']);
    collectAllIds(s, ids);
  });
  asArray<any>((container as any).parallel).forEach((p) => {
    if (p['@_id']) ids.add(p['@_id']);
    collectAllIds(p, ids);
  });
  // <final>/<history> share the same document-wide id namespace.
  [...asArray<any>((container as any).final), ...asArray<any>((container as any).history)].forEach(
    (child) => {
      if (child['@_id']) ids.add(child['@_id']);
    },
  );
  return ids;
}

/**
 * Return `candidate` if it isn't already taken, otherwise the same id with
 * the smallest `_2`, `_3`, ... suffix that isn't. Claims the returned id.
 */
function claimId(candidate: string, usedIds: IdSet): string {
  let next = candidate;
  let n = 2;
  while (usedIds.has(next)) {
    next = `${candidate}_${n}`;
    n++;
  }
  usedIds.add(next);
  return next;
}

/** Wrap each work tree (and the unassigned rest, if any) into its own region <state>. */
function buildRegions(
  groups: Map<string, ChildEntry[]>,
  unassigned: ChildEntry[],
  usedIds: IdSet,
): ChildEntry[] {
  const regions: ChildEntry[] = [];
  const addRegion = (initialId: string, members: ChildEntry[]) => {
    const region: any = {
      '@_id': claimId(`${initialId}_region`, usedIds),
      '@_initial': initialId,
    };
    assignEntries(region, members);
    regions.push({ el: region, tag: 'state' });
  };
  groups.forEach((members, initialId) => addRegion(initialId, members));
  if (unassigned.length > 0) addRegion(unassigned[0].el['@_id'], unassigned);
  return regions;
}

interface Ctx {
  usedIds: IdSet;
  changed: boolean;
}

/**
 * Convert a compound <state> with 2+ Initial work trees into a <parallel>,
 * in place. Returns whether it converted (the caller re-files it under its
 * parent's `.parallel`).
 */
function convertStateIfNeeded(state: any, ctx: Ctx): boolean {
  if (asArray(state.final).length > 0) return false;
  const entries = getChildEntries(state);
  if (entries.length === 0) return false;

  const { groups, unassigned } = groupEntries(entries, getInitialIds(state, 'state'));
  if (groups.size < 2) return false;

  assignEntries(state, buildRegions(groups, unassigned, ctx.usedIds));
  delete state['@_initial'];
  delete state.initial;
  return true;
}

/**
 * Turn a <parallel> with fewer than 2 regions back into a <state>, in place.
 * Returns whether it reverted (the caller re-files it under `.state`).
 */
function revertParallelIfNeeded(parallel: any): boolean {
  const regions = getChildEntries(parallel);
  if (regions.length >= 2) return false;
  if (regions.length === 1) parallel['@_initial'] = regions[0].el['@_id'];
  else delete parallel['@_initial'];
  return true;
}

/**
 * Bottom-up: normalize every child of `el` (its descendants first, then the
 * child's own state <-> parallel decision), re-filing any child whose tag
 * changed. The root's `__root_parallel` is transparent — its regions are
 * normalized as children, but it's never itself converted here.
 */
function normalizeChildren(el: any, ctx: Ctx, isRoot = false): void {
  const holders = [el, ...(isRoot ? asArray<any>(el.parallel).filter(isRootParallel) : [])];
  holders.forEach((holder) => {
    const next: ChildEntry[] = [];
    let retagged = false;

    asArray<any>(holder.state).forEach((child) => {
      normalizeChildren(child, ctx);
      const converted = convertStateIfNeeded(child, ctx);
      if (converted) retagged = true;
      next.push({ el: child, tag: converted ? 'parallel' : 'state' });
    });
    asArray<any>(holder.parallel).forEach((child) => {
      if (isRoot && holder === el && isRootParallel(child)) {
        next.push({ el: child, tag: 'parallel' });
        return;
      }
      normalizeChildren(child, ctx);
      const reverted = revertParallelIfNeeded(child);
      if (reverted) retagged = true;
      next.push({ el: child, tag: reverted ? 'state' : 'parallel' });
    });

    if (retagged) {
      assignEntries(holder, next);
      ctx.changed = true;
    }
  });
}

/**
 * The root's equivalent of convertStateIfNeeded/revertParallelIfNeeded: 2+
 * root-level work trees live as regions of `__root_parallel`. New root-level
 * work trees join it as new regions; once it's down to fewer than 2 regions
 * it's removed and its regions move back to the root as they are.
 */
function normalizeRoot(scxml: any, ctx: Ctx): void {
  const parallels = asArray<any>(scxml.parallel);
  const rootParallel = parallels.find(isRootParallel);
  const outside: ChildEntry[] = [
    ...asArray<any>(scxml.state).map((el): ChildEntry => ({ el, tag: 'state' })),
    ...parallels.filter((p) => p !== rootParallel).map((el): ChildEntry => ({ el, tag: 'parallel' })),
  ];
  const existingRegions = rootParallel ? getChildEntries(rootParallel) : [];

  const initialIds = getInitialIds(scxml, 'root');
  const { groups, unassigned } = groupEntries(outside, initialIds);
  const total = existingRegions.length + groups.size;

  if (total < 2) {
    if (!rootParallel) return;
    // Unwrap: the remaining region(s) go back to the root as they are.
    assignEntries(scxml, [...outside, ...existingRegions]);
    if (total === 1) {
      scxml['@_initial'] = existingRegions[0]?.el['@_id'] ?? [...groups.keys()][0];
    } else {
      delete scxml['@_initial'];
    }
    delete scxml.initial;
    ctx.changed = true;
    return;
  }

  if (groups.size === 0 && rootParallel) {
    // Steady state — just make sure the root points at its <parallel>.
    if (scxml['@_initial'] !== rootParallel['@_id'] || scxml.initial) {
      scxml['@_initial'] = rootParallel['@_id'];
      delete scxml.initial;
      ctx.changed = true;
    }
    return;
  }

  const newRegions = buildRegions(groups, [], ctx.usedIds);
  const parallel: any = rootParallel ?? { '@_id': claimId(ROOT_PARALLEL_ID, ctx.usedIds) };
  assignEntries(parallel, [...existingRegions, ...newRegions]);

  // Everything outside a work tree (states and other parallels alike) stays
  // at the root, beside the <parallel>.
  assignEntries(scxml, [...unassigned, { el: parallel, tag: 'parallel' }]);
  scxml['@_initial'] = parallel['@_id'];
  delete scxml.initial;
  ctx.changed = true;
}

/**
 * Older versions of this feature tagged their structure with viz:auto-*
 * marker attributes, and nested the <parallel> inside the compound <state>
 * as `<state id="X" initial="X_parallel"><parallel id="X_parallel" ...>`.
 * Strip the markers, and collapse that nesting so X itself is the
 * <parallel> — no <state> wrapper above it.
 */
function migrateLegacyStructure(el: any, ctx: Ctx): void {
  // fast-xml-parser yields a string, not an object, for an empty element.
  if (!el || typeof el !== 'object') return;
  LEGACY_MARKERS.forEach((marker) => {
    if (marker in el) {
      delete el[marker];
      ctx.changed = true;
    }
  });

  const next: ChildEntry[] = [];
  let retagged = false;
  asArray<any>(el.state).forEach((child) => {
    const collapse = isLegacyNestedParallelWrapper(child);
    migrateLegacyStructure(child, ctx);
    if (collapse) {
      const inner = child.parallel;
      delete child.parallel;
      delete child['@_initial'];
      delete child.initial;
      assignEntries(child, getChildEntries(inner));
      [...asArray<any>(inner.history)].forEach((h) => {
        child.history = [...asArray<any>(child.history), h];
      });
      retagged = true;
    }
    next.push({ el: child, tag: collapse ? 'parallel' : 'state' });
  });
  asArray<any>(el.parallel).forEach((child) => {
    migrateLegacyStructure(child, ctx);
    next.push({ el: child, tag: 'parallel' });
  });
  if (retagged) {
    assignEntries(el, next);
    ctx.changed = true;
  }
}

/**
 * `<state id="X" initial="P"><parallel id="P" viz:auto-parallel="true">…</parallel></state>`
 * with nothing else under X that would stop X itself from being a <parallel>.
 */
function isLegacyNestedParallelWrapper(state: any): boolean {
  if (Array.isArray(state.parallel) || !state.parallel) return false;
  const inner = state.parallel;
  if (inner['@_viz:auto-parallel'] !== 'true' || inner['@_viz:auto-converted'] === 'true') return false;
  if (asArray(state.state).length > 0 || asArray(state.final).length > 0) return false;
  return state['@_initial'] === inner['@_id'];
}

export function normalizeParallelGroups(scxmlDoc: SCXMLDocument): { changed: boolean } {
  const scxml = scxmlDoc.scxml as any;
  if (!scxml || typeof scxml !== 'object') return { changed: false };
  const ctx: Ctx = { usedIds: new Set(), changed: false };
  migrateLegacyStructure(scxml, ctx);
  ctx.usedIds = collectAllIds(scxml);
  normalizeChildren(scxml, ctx, true);
  normalizeRoot(scxml, ctx);
  return { changed: ctx.changed };
}

/**
 * Whether a container already has any children, counting states under a
 * <parallel> child too — used to guard "auto-mark the first child Initial"
 * conveniences so they only fire for a genuinely empty container.
 */
export function hasAnyChildren(container: Container): boolean {
  if (asArray(container.state).length > 0) return true;
  return asArray((container as any).parallel).length > 0;
}

export interface ParallelGroupInfo {
  /** The diagram level the regions appear on: the <parallel>'s own id, or null for the root's `__root_parallel`. */
  containerId: string | null;
  /** Key for the group's wrapper node — distinct from the <parallel>'s own node id. */
  parallelId: string;
  /** One per region: the ids of the nodes drawn in its column. */
  regions: { memberIds: string[] }[];
}

/**
 * Read-only query for the diagram layer: every <parallel> in the document
 * (with 2+ regions), at any nesting depth — used for the region divider
 * lines, region separation and group drag. Regions are drawn
 * as columns, so a region's members are the nodes shown in its place (see
 * getRegionDisplayEntries in parallel-structure.ts).
 */
export function collectParallelGroups(scxmlDoc: SCXMLDocument): ParallelGroupInfo[] {
  const result: ParallelGroupInfo[] = [];

  function walk(el: any, isRoot = false): void {
    asArray<any>(el.state).forEach((child) => walk(child));
    asArray<any>(el.parallel).forEach((p) => {
      const regions = getChildEntries(p).map((r) => ({
        memberIds: getRegionDisplayEntries(r).map((m) => m.el['@_id'] as string),
      }));
      if (regions.length >= 2) {
        const root = isRoot && isRootParallel(p);
        result.push({
          containerId: root ? null : p['@_id'],
          parallelId: root ? p['@_id'] : `${p['@_id']}__parallel_group`,
          regions,
        });
      }
      walk(p);
    });
  }

  walk(scxmlDoc.scxml, true);
  return result;
}
