/**
 * Live structural transform for the "multiple Initial State work trees"
 * feature: whenever a compound <state> has 2+ distinct Initial-marked work
 * trees among its direct children, and every child belongs to one of them,
 * that state itself becomes a real, standards-conformant <parallel> — same
 * object, same id, transitions, onentry/onexit and viz: attributes; only the
 * tag changes — with one region per work tree.
 *
 * - Each work tree is wrapped in its own region
 *   <state id="{initialId}_region" initial="{initialId}"> (decision
 *   scxml.md #11: a <parallel>'s direct children are never bare leaf
 *   states).
 * - Children that aren't part of any work tree (loose) are never put in a
 *   region of their own: the regions go into an inserted, transparent
 *   `<parallel id="{stateId}__parallel">` and the loose children stay beside
 *   it, unmarked. Connecting a loose child to a region member moves it into
 *   that region; once no loose child is left, the state itself becomes the
 *   <parallel> again.
 * - A state with <final> children is never converted (<parallel> can't hold
 *   <final>) — initial-group-validator.ts reports it instead.
 * - Any <parallel> (converted or hand-authored — no marker attributes tell
 *   them apart) with fewer than 2 regions turns back into a <state>, its
 *   sole region (if any) becoming its `initial`. Regions are kept as they
 *   are, not unwrapped.
 * - The <scxml> root can't become a <parallel>, so 2+ root-level work trees
 *   always go into an inserted `<parallel id="__root_parallel">`, loose
 *   siblings beside it, the same way (see parallel-structure.ts). These
 *   transparent parallels are the only elements this feature ever inserts.
 *
 * Pure, operates on the parsed SCXMLDocument object model, recomputes
 * everything fresh on every call (nothing is persisted beyond the document
 * itself) — same style as initial-group-utils.ts, which this module reuses
 * for the underlying connected-component analysis.
 */
import type { SCXMLDocument, SCXMLElement, StateElement, ParallelElement } from '@/types/scxml';
import { getInitialIds, analyzeGroups } from './initial-group-utils';
import { parseStateIdList } from '@/lib/validators/validator-utils';
import {
  ROOT_PARALLEL_ID,
  findTransparentParallel,
  getChildEntries,
  getRegionDisplayEntries,
  innerParallelIdFor,
  isTransparentParallel,
  type ChildEntry,
  type ContainerKind,
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

/** Wrap each work tree into its own region <state>. */
function buildRegions(groups: Map<string, ChildEntry[]>, usedIds: IdSet): ChildEntry[] {
  const regions: ChildEntry[] = [];
  groups.forEach((members, initialId) => {
    const region: any = {
      '@_id': claimId(`${initialId}_region`, usedIds),
      '@_initial': initialId,
    };
    assignEntries(region, members);
    regions.push({ el: region, tag: 'state' });
  });
  return regions;
}

interface Ctx {
  usedIds: IdSet;
  changed: boolean;
}

/**
 * Loose children (not part of any work tree) that a transition connects —
 * directly, or through other loose children — to a direct member of exactly
 * one region join that region: drawing state_3 -> state_4 makes state_4 part
 * of state_3's work tree. A loose component touching 2+ regions stays loose
 * (that would be a cross-region transition). Returns the absorbed entries.
 */
function absorbLooseIntoRegions(
  loose: ChildEntry[],
  regions: ChildEntry[],
  allIds: IdSet,
): Set<ChildEntry> {
  const absorbed = new Set<ChildEntry>();
  const stateRegions = regions.filter((r) => r.tag === 'state');
  if (loose.length === 0 || stateRegions.length === 0) return absorbed;

  // Each region is one node; its direct members (as drawn) map onto it.
  const nodeOf = new Map<string, string>();
  loose.forEach((e) => nodeOf.set(e.el['@_id'], e.el['@_id']));
  const memberEls: any[] = [];
  stateRegions.forEach((r) => {
    const regionId = r.el['@_id'];
    getChildEntries(r.el, 'opaque').forEach((m) => {
      nodeOf.set(m.el['@_id'], regionId);
      memberEls.push(m.el);
    });
    asArray<any>(r.el.final).forEach((f) => nodeOf.set(f['@_id'], regionId));
  });

  // Loose-to-loose edges, and which regions each loose state touches.
  const looseIds = loose.map((e) => e.el['@_id'] as string);
  const looseIdSet = new Set(looseIds);
  const looseEdges: [string, string][] = [];
  const touches = new Map<string, Set<string>>();
  const link = (looseId: string, regionId: string) => {
    if (!touches.has(looseId)) touches.set(looseId, new Set());
    touches.get(looseId)!.add(regionId);
  };
  [...loose.map((e) => e.el), ...memberEls].forEach((el) => {
    asArray<any>(el.transition).forEach((t) => {
      // Matched against every id in the document, since ids may contain spaces.
      parseStateIdList(String(t['@_target'] ?? ''), allIds).forEach((target) => {
        const a = nodeOf.get(el['@_id']);
        const b = nodeOf.get(target);
        if (!a || !b || a === b) return;
        if (looseIdSet.has(a) && looseIdSet.has(b)) looseEdges.push([a, b]);
        else if (looseIdSet.has(a)) link(a, b);
        else if (looseIdSet.has(b)) link(b, a);
      });
    });
  });
  if (touches.size === 0) return absorbed;

  // Connected loose components (every loose id is its own "Initial", so each
  // component is keyed by its first member), and the regions each touches.
  const { groupsByState } = analyzeGroups(looseIds, looseIdSet, looseEdges);
  const componentRegions = new Map<string, Set<string>>();
  looseIds.forEach((id) => {
    const key = groupsByState.get(id)!;
    if (!componentRegions.has(key)) componentRegions.set(key, new Set());
    touches.get(id)?.forEach((r) => componentRegions.get(key)!.add(r));
  });

  loose.forEach((entry) => {
    const regionIds = componentRegions.get(groupsByState.get(entry.el['@_id'])!)!;
    if (regionIds.size !== 1) return;
    const [regionId] = regionIds;
    const region = stateRegions.find((r) => r.el['@_id'] === regionId)!;
    assignEntries(region.el, [...getChildEntries(region.el, 'opaque'), entry]);
    absorbed.add(entry);
  });
  return absorbed;
}

/**
 * Normalize a host — the <scxml> root (kind 'root') or a compound <state>
 * (kind 'state') — whose 2+ Initial work trees become regions:
 *
 * - With no loose children left, a <state> host itself becomes the
 *   <parallel> (the caller re-files it under `.parallel`; returns
 *   'parallel'). A host with <final> children never does.
 * - Otherwise the regions go into a transparent <parallel> child —
 *   `__root_parallel` at the root, `{id}__parallel` in a <state> — and the
 *   loose children stay beside it, unmarked, so they can be connected later
 *   (absorbLooseIntoRegions). New work trees join it as new regions; once
 *   it's down to fewer than 2 regions it's removed and its regions move back
 *   to the host as they are.
 */
function normalizeHost(host: any, kind: 'root' | 'state', ctx: Ctx): 'state' | 'parallel' {
  const parallels = asArray<any>(host.parallel);
  const inner = parallels.find((p) => isTransparentParallel(p, kind));
  const outside: ChildEntry[] = [
    ...asArray<any>(host.state).map((el): ChildEntry => ({ el, tag: 'state' })),
    ...parallels.filter((p) => p !== inner).map((el): ChildEntry => ({ el, tag: 'parallel' })),
  ];
  const hasFinals = asArray(host.final).length > 0;
  if (kind === 'state' && !inner && hasFinals) return 'state';

  const existingRegions = inner ? getChildEntries(inner) : [];
  const { groups, unassigned } = groupEntries(outside, getInitialIds(host, kind));
  const total = existingRegions.length + groups.size;

  if (total < 2) {
    if (!inner) return 'state';
    // Unwrap: the remaining region(s) go back to the host as they are.
    assignEntries(host, [...outside, ...existingRegions]);
    if (total === 1) {
      host['@_initial'] = existingRegions[0]?.el['@_id'] ?? [...groups.keys()][0];
    } else {
      delete host['@_initial'];
    }
    delete host.initial;
    ctx.changed = true;
    return 'state';
  }

  const absorbed = absorbLooseIntoRegions(unassigned, existingRegions, ctx.usedIds);
  const loose = unassigned.filter((e) => !absorbed.has(e));
  const newRegions = buildRegions(groups, ctx.usedIds);

  if (kind === 'state' && loose.length === 0 && !hasFinals) {
    assignEntries(host, [...existingRegions, ...newRegions]);
    delete host['@_initial'];
    delete host.initial;
    ctx.changed = true;
    return 'parallel';
  }

  if (inner && groups.size === 0 && absorbed.size === 0) {
    // Steady state — just make sure the host points at its <parallel>.
    if (host['@_initial'] !== inner['@_id'] || host.initial) {
      host['@_initial'] = inner['@_id'];
      delete host.initial;
      ctx.changed = true;
    }
    return 'state';
  }

  const parallel: any = inner ?? {
    '@_id': claimId(kind === 'root' ? ROOT_PARALLEL_ID : innerParallelIdFor(host['@_id']), ctx.usedIds),
  };
  assignEntries(parallel, [...existingRegions, ...newRegions]);
  assignEntries(host, [...loose, { el: parallel, tag: 'parallel' }]);
  host['@_initial'] = parallel['@_id'];
  delete host.initial;
  ctx.changed = true;
  return 'state';
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
 * changed. A transparent `__root_parallel` / `{id}__parallel` is never
 * itself converted here — its regions are normalized as children, and
 * normalizeHost handles the parallel itself.
 */
function normalizeChildren(el: any, kind: ContainerKind, ctx: Ctx): void {
  const inner = findTransparentParallel(el, kind);
  const holders = [el, ...(inner ? [inner] : [])];
  holders.forEach((holder) => {
    const next: ChildEntry[] = [];
    let retagged = false;

    asArray<any>(holder.state).forEach((child) => {
      normalizeChildren(child, 'state', ctx);
      const tag = normalizeHost(child, 'state', ctx);
      if (tag === 'parallel') retagged = true;
      next.push({ el: child, tag });
    });
    asArray<any>(holder.parallel).forEach((child) => {
      if (child === inner) {
        next.push({ el: child, tag: 'parallel' });
        return;
      }
      normalizeChildren(child, 'parallel', ctx);
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
  normalizeChildren(scxml, 'root', ctx);
  normalizeHost(scxml, 'root', ctx);
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
  /**
   * The diagram level the regions appear on: the <parallel>'s own id, or —
   * for a transparent `__root_parallel` / `{id}__parallel` — its host's id
   * (null at the root).
   */
  containerId: string | null;
  /**
   * Key for the group's wrapper node — `{id}__parallel_group` (with a `_2`…
   * suffix if a state already uses that id), or a transparent parallel's own id.
   */
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
  // Wrapper keys share the canvas's node-id space with every state, so a
  // derived `{id}__parallel_group` must be claimed against the document's ids
  // (and against wrappers already generated) — a state may legitimately be
  // named that. A transparent parallel's key is its own id, already unique
  // and never a node.
  const wrapperIds = collectAllIds(scxmlDoc.scxml as any);

  function walk(el: any, kind: ContainerKind): void {
    asArray<any>(el.state).forEach((child) => walk(child, 'state'));
    asArray<any>(el.parallel).forEach((p) => {
      const regions = getChildEntries(p).map((r) => ({
        memberIds: getRegionDisplayEntries(r).map((m) => m.el['@_id'] as string),
      }));
      if (regions.length >= 2) {
        // A transparent parallel's regions are drawn on its host's level.
        const transparent = isTransparentParallel(p, kind);
        result.push({
          containerId: transparent ? (kind === 'root' ? null : el['@_id']) : p['@_id'],
          parallelId: transparent ? p['@_id'] : claimId(`${p['@_id']}__parallel_group`, wrapperIds),
          regions,
        });
      }
      walk(p, 'parallel');
    });
  }

  walk(scxmlDoc.scxml, 'root');
  return result;
}
