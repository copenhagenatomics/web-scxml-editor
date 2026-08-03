import type { Node } from 'reactflow';
import type { SCXMLStateNodeData } from '@/components/diagram/nodes/scxml-state-node';

export interface InitialChildInfo {
  label: string;
  entryActions: string[];
}

/** Sentinel key for top-level nodes (no parentId), representing the document root. */
export const HIERARCHY_ROOT_KEY = '__root__';

/**
 * Groups every node marked isInitial by its parentId (root-level nodes use
 * HIERARCHY_ROOT_KEY), so a hierarchy layer's default child/children —
 * including all Initial State groups, per the multiple-initial-groups
 * feature — can be looked up by that layer's own state id.
 */
export function buildInitialChildByParent(
  nodes: Node<SCXMLStateNodeData>[]
): Map<string, InitialChildInfo[]> {
  const map = new Map<string, InitialChildInfo[]>();
  for (const node of nodes) {
    if (!node.data?.isInitial) continue;
    const key = node.parentId ?? HIERARCHY_ROOT_KEY;
    const info: InitialChildInfo = {
      label: node.data.label ?? node.id,
      entryActions: node.data.entryActions ?? [],
    };
    const existing = map.get(key);
    if (existing) existing.push(info);
    else map.set(key, [info]);
  }
  return map;
}

/** Renders initial-child info as multi-line text for a native `title` tooltip. */
export function formatInitialTooltip(
  entries: InitialChildInfo[] | undefined
): string | undefined {
  if (!entries || entries.length === 0) return undefined;
  const header = entries.length > 1 ? 'Initial states' : 'Initial state';
  const lines = entries.map((e) =>
    e.entryActions.length > 0
      ? `${e.label} — on entry: ${e.entryActions.join(', ')}`
      : e.label
  );
  return `${header}:\n${lines.map((l) => `  ${l}`).join('\n')}`;
}
