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

export type ContainerKind = 'root' | 'state' | 'parallel';

export interface ChildEntry {
  el: any;
  tag: 'state' | 'parallel';
}

/**
 * The direct child states of a container, each with its tag. A <parallel>
 * child counts as a child state like any other. The root-level
 * `__root_parallel` is the one exception: when `kind` is 'root' (the
 * container is <scxml>), it's transparent, so its regions count as the
 * root's own children.
 */
export function getChildEntries(container: any, kind: ContainerKind = 'state'): ChildEntry[] {
  const result: ChildEntry[] = asArray<any>(container.state).map((el) => ({ el, tag: 'state' }));
  asArray<any>(container.parallel).forEach((p) => {
    if (kind === 'root' && isRootParallel(p)) {
      asArray<any>(p.state).forEach((el) => result.push({ el, tag: 'state' }));
      asArray<any>(p.parallel).forEach((el) => result.push({ el, tag: 'parallel' }));
    } else {
      result.push({ el: p, tag: 'parallel' });
    }
  });
  return result;
}

/** Always a fresh array — never container.state's own array. */
export function getLogicalChildStates(container: any, kind: ContainerKind = 'state'): any[] {
  return getChildEntries(container, kind).map((e) => e.el);
}

/**
 * What the diagram shows for one region of a <parallel>: the region itself
 * is drawn as a column, not a node, so its contents are shown in its place.
 * A region that is itself a <parallel>, or has no child states, is shown as
 * a node.
 */
export function getRegionDisplayEntries(region: ChildEntry): ChildEntry[] {
  if (region.tag === 'parallel') return [region];
  const inner = getChildEntries(region.el);
  return inner.length > 0 ? inner : [region];
}

/**
 * The children the diagram shows for a container: the same as
 * getChildEntries, except that every region of a <parallel> (including the
 * root's `__root_parallel`) is replaced by its contents — see
 * getRegionDisplayEntries.
 */
export function getDisplayChildEntries(container: any, kind: ContainerKind): ChildEntry[] {
  const result: ChildEntry[] = [];
  const add = (entry: ChildEntry) => {
    if (kind === 'parallel') result.push(...getRegionDisplayEntries(entry));
    else result.push(entry);
  };
  asArray<any>(container.state).forEach((el) => add({ el, tag: 'state' }));
  asArray<any>(container.parallel).forEach((p) => {
    if (kind === 'root' && isRootParallel(p)) {
      getChildEntries(p).forEach((region) => result.push(...getRegionDisplayEntries(region)));
    } else {
      add({ el: p, tag: 'parallel' });
    }
  });
  return result;
}
