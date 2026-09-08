/**
 * Live wrap/unwrap transform for the "multiple Initial State work trees"
 * feature: whenever a container (the <scxml> root, or any compound <state>)
 * has 2+ distinct Initial-marked work trees among its direct children, its
 * children are restructured into a real, standards-conformant <parallel>
 * element — one region per work tree — so the document itself (not just a
 * display/export view) reflects real SCXML <parallel> semantics.
 *
 * A work tree with a single member becomes a bare region (that member's own
 * <state> element, used directly as a region). A work tree with 2+ members
 * (connected via sibling transitions) is wrapped in a synthetic region
 * <state marked viz:auto-region="true">, since <parallel>'s direct children
 * must each be a single region, and flat mutually-exclusive siblings can't
 * sit directly inside <parallel> without changing their meaning to
 * "concurrently active."
 *
 * The synthetic <parallel>/region wrapper elements are marked with
 * viz:auto-parallel="true" / viz:auto-region="true" so this module (and the
 * diagram's flattening logic) can tell them apart from a hand-authored
 * <parallel> the user typed or pasted directly — those are never touched.
 *
 * Pure, operates on the parsed SCXMLDocument object model, recomputes
 * everything fresh on every call (nothing is persisted beyond the document
 * itself) — same style as initial-group-utils.ts, which this module reuses
 * for the underlying connected-component analysis.
 */
import type {
  SCXMLDocument,
  SCXMLElement,
  StateElement,
  ParallelElement,
} from '@/types/scxml';
import { getInitialIds, analyzeGroups } from './initial-group-utils';
import { AUTO_PARALLEL_MARKER, AUTO_REGION_MARKER } from './parallel-group-markers';

export { AUTO_PARALLEL_MARKER, AUTO_REGION_MARKER };

const ROOT_PARALLEL_ID = '__root_parallel';

type Container = SCXMLElement | StateElement;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function isAutoParallel(p: ParallelElement): boolean {
  return (p as any)[AUTO_PARALLEL_MARKER] === 'true';
}

function isAutoRegion(s: StateElement): boolean {
  return (s as any)[AUTO_REGION_MARKER] === 'true';
}

/** Undirected sibling transition edges among an explicit list of states. */
function siblingEdgesFor(members: StateElement[]): [string, string][] {
  const memberIds = new Set(members.map((m) => m['@_id']));
  const edges: [string, string][] = [];
  members.forEach((member) => {
    asArray(member.transition).forEach((t) => {
      if (!t['@_target']) return;
      t['@_target']
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
 * Reconstruct the container's logical flat child list, reversing one level
 * of our own prior auto-wrap if present, plus the set of ids that should be
 * treated as Initial roots for this pass (recovered from the wrapper's own
 * region @_initial / bare-region identity when wrapped, or read directly
 * from the container's own initial marker(s) when not).
 */
function buildLogicalView(container: Container): {
  flat: StateElement[];
  initialIds: Set<string>;
  autoParallel: ParallelElement | undefined;
  otherParallels: ParallelElement[];
} {
  const parallels = asArray(container.parallel);
  const autoParallel = parallels.find(isAutoParallel);
  const otherParallels = parallels.filter((p) => p !== autoParallel);

  const flat: StateElement[] = [...asArray(container.state)];
  // getInitialIds is itself auto-wrap-aware (falling back to reading the
  // wrapper's own structure only when @_initial doesn't already resolve to
  // real ids) — it is the single source of truth for which flattened
  // members are still genuinely Initial. In particular, a bare region's
  // mere physical presence in the <parallel> must NOT be treated as proof
  // it's still Initial: ToggleInitialStateCommand writes a real,
  // already-correct token list onto @_initial without itself restructuring
  // the still-wrapped <parallel> (that's this function's job, on this very
  // pass) — unconditionally re-adding every bare region's id here would
  // silently undo that command's effect the moment this pass runs.
  const initialIds = new Set<string>(getInitialIds(container as any));

  if (autoParallel) {
    asArray(autoParallel.state).forEach((region) => {
      if (isAutoRegion(region)) {
        asArray(region.state).forEach((member) => flat.push(member));
      } else {
        flat.push(region);
      }
    });
  }

  return { flat, initialIds, autoParallel, otherParallels };
}

function autoRegionId(initialId: string): string {
  return `${initialId}_region`;
}

function autoParallelIdFor(containerId: string | null): string {
  return containerId === null ? ROOT_PARALLEL_ID : `${containerId}_parallel`;
}

/**
 * Apply this container's own wrap/unwrap decision (not recursive — callers
 * recurse separately). Returns whether the container's own shape changed.
 */
function applyWrapDecision(container: Container, containerId: string | null): boolean {
  const { flat, initialIds, autoParallel, otherParallels } = buildLogicalView(container);
  const flatIds = flat.map((s) => s['@_id']);
  const edges = siblingEdgesFor(flat);
  const { groupsByState } = analyzeGroups(flatIds, initialIds, edges);

  const groups = new Map<string, StateElement[]>();
  const unassigned: StateElement[] = [];
  flat.forEach((member) => {
    const root = groupsByState.get(member['@_id']);
    if (!root) {
      unassigned.push(member);
      return;
    }
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(member);
  });

  // Nothing to do: fewer than 2 groups, and not currently auto-wrapped by
  // this feature — leave the container's shape completely untouched (don't
  // even canonicalize array-vs-single-object child shape) so hand-authored
  // content this feature has no opinion about is never rewritten.
  if (groups.size < 2 && !autoParallel) {
    return false;
  }

  const before = JSON.stringify({
    initial: (container as any)['@_initial'],
    hasInitialEl: !!(container as any).initial,
    state: container.state,
    parallel: container.parallel,
  });

  if (groups.size >= 2) {
    const parallelId = autoParallelIdFor(containerId);
    const regions: StateElement[] = [];
    groups.forEach((members, initialId) => {
      if (members.length === 1) {
        regions.push(members[0]);
      } else {
        const region: StateElement = {
          '@_id': autoRegionId(initialId),
          '@_initial': initialId,
          state: members,
        } as StateElement;
        (region as any)[AUTO_REGION_MARKER] = 'true';
        regions.push(region);
      }
    });

    const parallelEl: ParallelElement = {
      '@_id': parallelId,
      state: regions.length === 1 ? regions[0] : regions,
    } as ParallelElement;
    (parallelEl as any)[AUTO_PARALLEL_MARKER] = 'true';

    container.state = unassigned.length === 0 ? undefined : unassigned.length === 1 ? unassigned[0] : unassigned;
    const allParallels = [...otherParallels, parallelEl];
    container.parallel = allParallels.length === 1 ? allParallels[0] : allParallels;
    (container as any)['@_initial'] = parallelId;
    delete (container as any).initial;
  } else {
    container.state = flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat;
    container.parallel = otherParallels.length === 0 ? undefined : otherParallels.length === 1 ? otherParallels[0] : otherParallels;
    if (groups.size === 1) {
      const [soleInitialId] = [...groups.keys()];
      (container as any)['@_initial'] = soleInitialId;
    } else {
      delete (container as any)['@_initial'];
    }
    delete (container as any).initial;
  }

  const after = JSON.stringify({
    initial: (container as any)['@_initial'],
    hasInitialEl: !!(container as any).initial,
    state: container.state,
    parallel: container.parallel,
  });

  return before !== after;
}

/**
 * Recursively normalize a container: its own state-child containers first
 * (bottom-up), then the content of each region under any of its <parallel>
 * children (auto-wrapped or hand-authored — a region can independently grow
 * its own 2+ work trees), then this container's own wrap/unwrap decision.
 */
function normalizeContainer(container: Container, containerId: string | null): boolean {
  let changed = false;

  asArray(container.state).forEach((child) => {
    if (normalizeContainer(child, child['@_id'])) changed = true;
  });

  asArray(container.parallel).forEach((parallel) => {
    asArray(parallel.state).forEach((region) => {
      if (normalizeContainer(region, region['@_id'])) changed = true;
    });
  });

  // This container's own wrap/unwrap decision (a no-op, including for a
  // hand-authored <parallel> child with no viz:auto-parallel marker, bails
  // out immediately inside applyWrapDecision without touching anything).
  if (applyWrapDecision(container, containerId)) changed = true;

  return changed;
}

export function normalizeParallelGroups(scxmlDoc: SCXMLDocument): { changed: boolean } {
  const changed = normalizeContainer(scxmlDoc.scxml, null);
  return { changed };
}

/**
 * Whether a container already has any children, counting members hidden
 * inside an auto-wrapped <parallel> — plain `!container.state` is NOT
 * enough once wrapping is in play, since a wrapped container's own `.state`
 * only holds unassigned siblings (often none at all), which would otherwise
 * make a fully-populated wrapped container look empty. Used to guard
 * "auto-mark the first child Initial" conveniences so they only ever fire
 * for a genuinely empty container, not one whose existing children are
 * simply hidden inside its <parallel>.
 */
export function hasAnyChildren(container: Container): boolean {
  if (asArray(container.state).length > 0) return true;
  return asArray(container.parallel).length > 0;
}

export interface AutoParallelGroupInfo {
  /** The container the <parallel> is nested under; null for the document root. */
  containerId: string | null;
  parallelId: string;
  regions: { memberIds: string[] }[];
}

/**
 * Read-only query for the diagram layer: every auto-wrapped
 * (viz:auto-parallel="true") <parallel> currently in the document, at any
 * nesting depth, with each region's flattened member ids. A hand-authored
 * <parallel> (no marker) is never reported — its content is recursed into
 * only in case it contains its own, independently auto-wrapped nested group.
 */
export function collectAutoParallelGroups(scxmlDoc: SCXMLDocument): AutoParallelGroupInfo[] {
  const result: AutoParallelGroupInfo[] = [];

  function walk(container: Container, containerId: string | null): void {
    asArray(container.state).forEach((child) => walk(child, child['@_id']));

    asArray(container.parallel).forEach((parallel) => {
      if (isAutoParallel(parallel)) {
        const regions = asArray(parallel.state).map((region) => ({
          memberIds: isAutoRegion(region)
            ? asArray(region.state).map((m) => m['@_id'])
            : [region['@_id']],
        }));
        result.push({ containerId, parallelId: parallel['@_id'], regions });
      } else {
        asArray(parallel.state).forEach((region) => walk(region, region['@_id']));
      }
    });
  }

  walk(scxmlDoc.scxml, null);
  return result;
}
