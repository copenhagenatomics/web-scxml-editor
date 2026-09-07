/**
 * Live drag-to-connect guard for the "no transition may cross from one
 * region of a <parallel> into a sibling region" rule (W3C SCXML §3.4 — see
 * git show 801145d:docs/parallel-states-scxml-spec.md §1.4 for the LCCA
 * derivation). Standards-based, so it applies to a hand-authored <parallel>
 * exactly the same as an auto-wrapped one from
 * src/lib/utils/parallel-group-normalization.ts.
 *
 * The persistent (debounced) validator catches this too, indirectly, via
 * validateCrossHierarchyTransitions once two regions are real, separately-
 * parented <state> elements — but that only fires ~500ms after a drag
 * already created the edge. This is the synchronous check used for live
 * drag feedback and the authoritative pre-mutation gate, matching how
 * wouldMergeDistinctGroups (initial-group-utils.ts) already guards the
 * "different Initial State groups" case.
 */
import type { SCXMLDocument } from '@/types/scxml';

interface ChainEntry {
  element: any;
  kind: 'root' | 'state' | 'parallel';
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function findAncestorChain(
  node: any,
  kind: ChainEntry['kind'],
  targetId: string,
  path: ChainEntry[]
): ChainEntry[] | null {
  if (kind !== 'root' && node['@_id'] === targetId) return path;

  const nextPath = [...path, { element: node, kind }];

  for (const s of asArray(node.state)) {
    const found = findAncestorChain(s, 'state', targetId, nextPath);
    if (found) return found;
  }
  for (const p of asArray(node.parallel)) {
    const found = findAncestorChain(p, 'parallel', targetId, nextPath);
    if (found) return found;
  }
  return null;
}

export function wouldCrossParallelRegions(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  targetId: string
): { blocked: boolean; reason?: string } {
  const chainS = findAncestorChain(scxmlDoc.scxml, 'root', sourceId, []);
  const chainT = findAncestorChain(scxmlDoc.scxml, 'root', targetId, []);
  if (!chainS || !chainT) return { blocked: false };

  const parallelIndex = [...chainS].reverse().findIndex((e) => e.kind === 'parallel');
  if (parallelIndex === -1) return { blocked: false };

  const i = chainS.length - 1 - parallelIndex;
  const enclosingParallel = chainS[i].element;
  // A region is normally the intermediate ancestor entry right after the
  // parallel — but for a bare single-member region (see
  // parallel-group-normalization.ts), the member IS the region directly, so
  // the chain ends at the parallel itself with no intermediate entry.
  const sourceRegionId = i === chainS.length - 1 ? sourceId : chainS[i + 1].element['@_id'];

  const j = chainT.findIndex((e) => e.element === enclosingParallel);
  if (j === -1) {
    // Target isn't inside this parallel at all — legal (leaves the parallel).
    return { blocked: false };
  }
  const targetRegionId = j === chainT.length - 1 ? targetId : chainT[j + 1].element['@_id'];

  if (targetRegionId === sourceRegionId) {
    return { blocked: false };
  }

  return {
    blocked: true,
    reason: `Cannot connect states that belong to different regions of the same parallel state ('${enclosingParallel['@_id']}').`,
  };
}
