/**
 * Graph analysis for the "multiple Initial States" feature.
 *
 * Groups are never persisted — every function here recomputes them fresh from
 * the current SCXML object model. Because transitions between states with
 * different parents are already rejected by validateCrossHierarchyTransitions
 * (src/lib/validators/transition-validator.ts), grouping only ever needs to be
 * evaluated among one parent container's direct children at a time — the
 * document root, or any single compound <state>.
 */
import type {
  SCXMLDocument,
  SCXMLElement,
  StateElement,
  InitialElement,
} from "@/types/scxml";
import { parseStateIdList } from "@/lib/validators/validator-utils";
import {
  getChildEntries,
  getLogicalChildStates,
  findTransparentParallel,
  isTransparentParallel,
  type ContainerKind,
} from "./parallel-structure";

export type { ContainerKind };

export type ContainerElement = SCXMLElement | StateElement;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Direct child states of a container (root scxml, a compound <state>, or a
 * <parallel>). A <parallel> child counts as a child state like any other;
 * the root-level `__root_parallel` is transparent, so its regions count as
 * the root's own children (see parallel-structure.ts).
 *
 * Always returns a fresh array — never container.state's own array — since
 * this is called many times per single check and callers may push onto it.
 */
export function getDirectChildStates(
  container: ContainerElement,
  kind: ContainerKind = "state",
): StateElement[] {
  return getLogicalChildStates(container, kind);
}

export interface ParentEntry {
  container: ContainerElement;
  kind: ContainerKind;
}

/**
 * Find the container that directly holds the given state id as one of its
 * children, and what kind of container it is (the <scxml> root, a <state>,
 * or a <parallel>). Returns null if the id doesn't exist in the document.
 */
export function findParentEntry(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): ParentEntry | null {
  function search(container: ContainerElement, kind: ContainerKind): ParentEntry | null {
    const children = getChildEntries(container, kind);
    if (children.some((c) => c.el["@_id"] === stateId)) return { container, kind };
    for (const child of children) {
      const found = search(child.el, child.tag);
      if (found) return found;
    }
    return null;
  }
  return search(scxmlDoc.scxml, "root");
}

/**
 * Find the container (the scxml root, a <state>, or a <parallel>) that
 * directly holds the given state id as one of its children. Returns null if
 * the id doesn't exist anywhere in the document.
 */
export function findParentContainer(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): ContainerElement | null {
  return findParentEntry(scxmlDoc, stateId)?.container ?? null;
}

/**
 * Whether stateId sits directly inside a <parallel> (including a
 * transparent `__root_parallel` / `{id}__parallel`) — i.e. it's a region, which is always active, so the
 * Initial State designation doesn't apply to it.
 */
export function isParallelRegion(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): boolean {
  const entry = findParentEntry(scxmlDoc, stateId);
  if (!entry) return false;
  if (entry.kind === "parallel") return true;
  const transparent = findTransparentParallel(entry.container, entry.kind);
  return (
    !!transparent &&
    getChildEntries(transparent).some((r) => r.el["@_id"] === stateId)
  );
  return false;
}

/**
 * Extract the target id(s) of a container's <initial> child element, the
 * older SCXML form for specifying a default child (equivalent to the
 * `initial` attribute, just expressed as `<initial><transition target="X"/></initial>`
 * instead). Returns an empty array if the container has no such element.
 */
function getInitialElementTargetIds(
  container: ContainerElement,
  childIds: Set<string>,
): string[] {
  const raw = (container as any).initial as
    | InitialElement
    | InitialElement[]
    | undefined;
  if (!raw) return [];
  const el = Array.isArray(raw) ? raw[0] : raw;
  if (!el?.transition) return [];
  const transition = Array.isArray(el.transition)
    ? el.transition[0]
    : el.transition;
  const target = transition?.["@_target"];
  if (typeof target !== "string" || !target) return [];
  return parseStateIdList(target, childIds);
}

/**
 * Parse the ids a container currently designates as Initial, from either
 * representation SCXML allows: the `initial` attribute (space-separated
 * list) and/or the `<initial>` child element (older, single-target form).
 * Both are unioned since either can independently mark a state Initial.
 *
 * Inside a <parallel> (`kind === "parallel"`) every child is a region and
 * always active, so every child counts as Initial. A transparent
 * `__root_parallel` / `{id}__parallel` id in `@_initial` stands for all of
 * its regions.
 */
export function getInitialIds(
  container: ContainerElement,
  kind: ContainerKind = "state",
): Set<string> {
  const childIds = new Set(
    getDirectChildStates(container, kind).map((c) => c["@_id"]),
  );
  if (kind === "parallel") return childIds;

  const transparentParallels = asArray<any>((container as any).parallel).filter((p) =>
    isTransparentParallel(p, kind),
  );
  const transparentParallelIds = new Set(transparentParallels.map((p) => p["@_id"]));
  const knownIds = new Set([...childIds, ...transparentParallelIds]);

  const result = new Set<string>();
  const add = (id: string) => {
    const transparent = transparentParallels.find((p) => p["@_id"] === id);
    if (transparent) {
      [...asArray<any>(transparent.state), ...asArray<any>(transparent.parallel)].forEach(
        (r) => result.add(r["@_id"]),
      );
    } else if (childIds.has(id)) {
      result.add(id);
    }
  };

  const raw = (container as any)["@_initial"] as string | undefined;
  if (typeof raw === "string" && raw) {
    parseStateIdList(raw, knownIds).forEach(add);
  }
  getInitialElementTargetIds(container, knownIds).forEach(add);

  return result;
}

/**
 * Undirected sibling edges: one entry per (source, target) pair where both
 * ends are direct children of `container` and a <transition> connects them.
 */
export function getSiblingEdges(
  container: ContainerElement,
  kind: ContainerKind = "state",
): [string, string][] {
  const children = getDirectChildStates(container, kind);
  const childIds = new Set(children.map((c) => c["@_id"]));
  const edges: [string, string][] = [];

  children.forEach((child) => {
    if (!child.transition) return;
    const transitions = Array.isArray(child.transition)
      ? child.transition
      : [child.transition];
    transitions.forEach((t) => {
      if (!t["@_target"]) return;
      t["@_target"]
        .split(/\s+/)
        .filter(Boolean)
        .forEach((target) => {
          if (childIds.has(target) && target !== child["@_id"]) {
            edges.push([child["@_id"], target]);
          }
        });
    });
  });

  return edges;
}

export interface GroupAnalysis {
  /** stateId -> the Initial-marked id whose component it belongs to, or null if unassigned */
  groupsByState: Map<string, string | null>;
  /** Each entry is a set of 2+ Initial-marked ids that ended up in the same component */
  conflictedGroups: string[][];
}

/** Union-find over childIds using edges as undirected connections. */
export function analyzeGroups(
  childIds: string[],
  initialIds: Set<string>,
  edges: [string, string][],
): GroupAnalysis {
  const parent = new Map<string, string>();
  childIds.forEach((id) => parent.set(id, id));

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  edges.forEach(([a, b]) => {
    if (parent.has(a) && parent.has(b)) union(a, b);
  });

  const componentInitials = new Map<string, string[]>();
  childIds.forEach((id) => {
    if (!initialIds.has(id)) return;
    const root = find(id);
    const list = componentInitials.get(root) ?? [];
    list.push(id);
    componentInitials.set(root, list);
  });

  const groupsByState = new Map<string, string | null>();
  childIds.forEach((id) => {
    const members = componentInitials.get(find(id)) ?? [];
    groupsByState.set(id, members.length > 0 ? members[0] : null);
  });

  const conflictedGroups: string[][] = [];
  componentInitials.forEach((members) => {
    if (members.length > 1) conflictedGroups.push(members);
  });

  return { groupsByState, conflictedGroups };
}

/**
 * The container kind to use for Initial-group analysis (union-find over
 * siblings). A transparent `__root_parallel` / `{id}__parallel` is analyzed
 * as ONE child — the way any other <parallel> child counts as one child
 * state — rather than seen through: its regions are always active, not
 * Initial groups, so a transition between two of them must not read as
 * merging two groups.
 */
export function groupAnalysisKind(kind: ContainerKind): ContainerKind {
  return kind === "root" || kind === "state" ? "opaque" : kind;
}

/**
 * Check whether creating a transition sourceId -> targetId would merge two
 * different Initial State groups. Both states must share a direct parent —
 * if they don't (or either id can't be found), this defers to
 * validateCrossHierarchyTransitions and reports no block.
 */
export function wouldMergeDistinctGroups(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  targetId: string,
): { blocked: boolean; reason?: string } {
  const sourceEntry = findParentEntry(scxmlDoc, sourceId);
  const targetEntry = findParentEntry(scxmlDoc, targetId);
  if (!sourceEntry || !targetEntry || sourceEntry.container !== targetEntry.container) {
    return { blocked: false };
  }
  // Regions of a <parallel> (including the root's __root_parallel) aren't
  // Initial groups — a transition touching one is a cross-region (or
  // cross-hierarchy) transition, which wouldCrossParallelRegions /
  // validateCrossHierarchyTransitions report with their own message.
  if (isParallelRegion(scxmlDoc, sourceId) || isParallelRegion(scxmlDoc, targetId)) {
    return { blocked: false };
  }

  const { container } = sourceEntry;
  const kind = groupAnalysisKind(sourceEntry.kind);
  const childIds = getDirectChildStates(container, kind).map((c) => c["@_id"]);
  const initialIds = getInitialIds(container, kind);
  const edges = getSiblingEdges(container, kind);
  edges.push([sourceId, targetId]);

  const { conflictedGroups } = analyzeGroups(childIds, initialIds, edges);
  if (conflictedGroups.length > 0) {
    const [a, b] = conflictedGroups[0];
    return {
      blocked: true,
      reason: `Cannot connect states that belong to different Initial State groups (rooted at '${a}' and '${b}').`,
    };
  }
  return { blocked: false };
}

/**
 * Check whether marking stateId as an Initial State would conflict with an
 * already-Initial-marked sibling it's transitively connected to (directly or
 * indirectly, via existing transitions among its parent's direct children).
 * Marking it would merge two Initial State groups into one chain that has
 * two Initial markers, which the "no merged groups" invariant forbids.
 */
export function wouldConflictIfMarkedInitial(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): { blocked: boolean; reason?: string } {
  const entry = findParentEntry(scxmlDoc, stateId);
  if (!entry) return { blocked: false };
  if (isParallelRegion(scxmlDoc, stateId)) {
    return {
      blocked: true,
      reason: `'${stateId}' is a region of a parallel state, so it is always active — the Initial State designation doesn't apply to it.`,
    };
  }

  const { container } = entry;
  const kind = groupAnalysisKind(entry.kind);
  const childIds = getDirectChildStates(container, kind).map((c) => c["@_id"]);
  const initialIds = new Set(getInitialIds(container, kind));
  initialIds.add(stateId);
  const edges = getSiblingEdges(container, kind);

  const { conflictedGroups } = analyzeGroups(childIds, initialIds, edges);
  const conflict = conflictedGroups.find((members) =>
    members.includes(stateId),
  );
  if (conflict) {
    const other = conflict.find((m) => m !== stateId) ?? conflict[0];
    return {
      blocked: true,
      reason: `Cannot mark '${stateId}' as an Initial State: it is already connected (directly or indirectly) to Initial State '${other}', which would merge two Initial State groups.`,
    };
  }
  return { blocked: false };
}

/**
 * Whether stateId currently appears in its direct parent's `initial` list.
 * Always false for a region of a <parallel> — regions are always active, not
 * Initial-designated.
 */
export function isMarkedInitial(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): boolean {
  const entry = findParentEntry(scxmlDoc, stateId);
  if (!entry || isParallelRegion(scxmlDoc, stateId)) return false;
  return getInitialIds(entry.container, entry.kind).has(stateId);
}

