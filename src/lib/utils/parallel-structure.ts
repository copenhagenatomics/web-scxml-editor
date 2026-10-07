/**
 * Shared structural helpers for the "multiple Initial State work trees"
 * feature (see parallel-group-normalization.ts). Split out into their own
 * module (rather than living in parallel-group-normalization.ts, which
 * imports FROM initial-group-utils.ts) so initial-group-utils.ts can use
 * them too without creating a circular import between the two.
 *
 * No marker attributes are involved: every <parallel> is an ordinary state
 * (whether the editor converted it from a <state> or the user wrote it),
 * except the one element the editor inserts itself — the root-level
 * `__root_parallel`, recognized by its reserved id — since the <scxml> root
 * can't itself become a <parallel>.
 */

export const ROOT_PARALLEL_ID = '__root_parallel';

const ROOT_PARALLEL_ID_PATTERN = /^__root_parallel(_\d+)?$/;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Whether `el`'s id is the one the editor gives the <parallel> it inserts
 * under <scxml> (possibly with a `_2`... clash suffix). Only meaningful for a
 * direct child of <scxml> — callers must check that themselves; a nested
 * <parallel> that happens to share the id is an ordinary <parallel>.
 */
export function isRootParallel(el: any): boolean {
  return !!el && typeof el['@_id'] === 'string' && ROOT_PARALLEL_ID_PATTERN.test(el['@_id']);
}

/**
 * A compound <state> holding 2+ Initial work trees plus loose (unassigned)
 * children can't itself become a <parallel> (its loose children would each
 * become a region), so its work trees go into an inner
 * `<parallel id="{stateId}__parallel">` beside them instead — the compound
 * equivalent of the root's `__root_parallel`.
 */
const INNER_PARALLEL_ID_PATTERN = /__parallel(_\d+)?$/;

export function innerParallelIdFor(stateId: string): string {
  return `${stateId}__parallel`;
}

/**
 * Whether `el`'s id is the one the editor gives the inner <parallel> it
 * inserts under a compound <state>. Only meaningful for a direct child of a
 * <state> — see isTransparentParallel.
 */
export function isInnerParallel(el: any): boolean {
  return !!el && typeof el['@_id'] === 'string' && INNER_PARALLEL_ID_PATTERN.test(el['@_id']);
}

/**
 * What a container is, for walking its children: the <scxml> root, a
 * <state> or a <parallel>. 'opaque' is a <state> or the root with its
 * editor-inserted <parallel> counted as one ordinary child instead of seen
 * through (see initial-group-utils.ts's groupAnalysisKind).
 */
export type ContainerKind = 'root' | 'state' | 'parallel' | 'opaque';

/**
 * Whether `el`, a direct <parallel> child of a container of `kind`, is the
 * editor-inserted one (`__root_parallel` under <scxml>, `{id}__parallel`
 * under a <state>) — transparent: its regions count as the container's own
 * children, and it's never drawn as a node.
 */
export function isTransparentParallel(el: any, kind: ContainerKind): boolean {
  if (kind === 'root') return isRootParallel(el);
  if (kind === 'state') return isInnerParallel(el);
  return false;
}

/** The container's transparent <parallel> child (see isTransparentParallel), if any. */
export function findTransparentParallel(container: any, kind: ContainerKind): any | undefined {
  return asArray<any>(container?.parallel).find((p) => isTransparentParallel(p, kind));
}

export interface ChildEntry {
  el: any;
  tag: 'state' | 'parallel';
}

/**
 * The direct child states of a container, each with its tag. A <parallel>
 * child counts as a child state like any other. The editor-inserted
 * `__root_parallel` / `{id}__parallel` is the one exception: it's
 * transparent (isTransparentParallel), so its regions count as the
 * container's own children.
 */
export function getChildEntries(container: any, kind: ContainerKind = 'state'): ChildEntry[] {
  const result: ChildEntry[] = asArray<any>(container.state).map((el) => ({ el, tag: 'state' }));
  asArray<any>(container.parallel).forEach((p) => {
    if (isTransparentParallel(p, kind)) {
      asArray<any>(p.state).forEach((el) => result.push({ el, tag: 'state' }));
      asArray<any>(p.parallel).forEach((el) => result.push({ el, tag: 'parallel' }));
    } else {
      result.push({ el: p, tag: 'parallel' });
    }
  });
  return result;
}

/**
 * An entry the diagram draws as a node. Unlike ChildEntry (the structural
 * view used by normalization), this also covers <final> children.
 */
export interface DisplayEntry {
  el: any;
  tag: 'state' | 'parallel' | 'final';
}

function finalEntries(container: any): DisplayEntry[] {
  return asArray<any>(container.final).map((el) => ({ el, tag: 'final' }));
}

/** Always a fresh array — never container.state's own array. */
export function getLogicalChildStates(container: any, kind: ContainerKind = 'state'): any[] {
  return getChildEntries(container, kind).map((e) => e.el);
}

/**
 * What the diagram shows for one region of a <parallel>: the region itself
 * is drawn as a column, not a node, so its contents are shown in its place.
 * A region that is itself a <parallel>, or has no child states (<state>,
 * <parallel> or <final>), is shown as a node.
 */
export function getRegionDisplayEntries(region: ChildEntry): DisplayEntry[] {
  if (region.tag === 'parallel') return [region];
  const inner: DisplayEntry[] = [...getChildEntries(region.el), ...finalEntries(region.el)];
  return inner.length > 0 ? inner : [region];
}

/**
 * The children the diagram shows for a container: the same as
 * getChildEntries plus the container's <final> children, except that every
 * region of a <parallel> (including a transparent `__root_parallel` /
 * `{id}__parallel`) is replaced by its contents — see getRegionDisplayEntries.
 */
export function getDisplayChildEntries(container: any, kind: ContainerKind): DisplayEntry[] {
  const result: DisplayEntry[] = [];
  const add = (entry: ChildEntry) => {
    if (kind === 'parallel') result.push(...getRegionDisplayEntries(entry));
    else result.push(entry);
  };
  asArray<any>(container.state).forEach((el) => add({ el, tag: 'state' }));
  asArray<any>(container.parallel).forEach((p) => {
    if (isTransparentParallel(p, kind)) {
      getChildEntries(p).forEach((region) => result.push(...getRegionDisplayEntries(region)));
    } else {
      add({ el: p, tag: 'parallel' });
    }
  });
  // A <parallel>'s direct children are its regions; <final> isn't valid there.
  if (kind !== 'parallel') result.push(...finalEntries(container));
  return result;
}
