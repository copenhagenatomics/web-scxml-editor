import { XMLParser } from 'fast-xml-parser';
import type {
  SCXMLElement,
  StateElement,
  ParallelElement,
  FinalElement,
  HistoryElement,
} from '@/types/scxml';

export interface StateIdInfo {
  id: string;
  type: 'state' | 'parallel' | 'final' | 'history';
  parent?: string;
  path: string[];
}

/**
 * Extract all state IDs from an SCXML document string
 */
export function extractStateIdsFromXML(xmlContent: string): StateIdInfo[] {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: false,
      trimValues: true,
      parseTagValue: true,
      allowBooleanAttributes: false,
    });

    const parsed = parser.parse(xmlContent);
    if (!parsed || !parsed.scxml) {
      return [];
    }

    const scxml = parsed.scxml as SCXMLElement;
    const stateIds: StateIdInfo[] = [];

    collectStateIds(scxml, stateIds, []);

    return stateIds;
  } catch (error) {
    console.warn('Failed to parse SCXML for state IDs:', error);
    return [];
  }
}

/**
 * Recursively collect all state IDs from an SCXML element
 */
function collectStateIds(
  scxml: SCXMLElement,
  stateIds: StateIdInfo[],
  parentPath: string[]
): void {
  // Collect state IDs
  if (scxml.state) {
    const states = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    states.forEach((state) => {
      collectStateIdsFromState(state, stateIds, parentPath);
    });
  }

  // Collect parallel state IDs
  if (scxml.parallel) {
    const parallels = Array.isArray(scxml.parallel)
      ? scxml.parallel
      : [scxml.parallel];
    parallels.forEach((parallel) => {
      collectStateIdsFromParallel(parallel, stateIds, parentPath);
    });
  }

  // Collect final state IDs
  if (scxml.final) {
    const finals = Array.isArray(scxml.final) ? scxml.final : [scxml.final];
    finals.forEach((final) => {
      if (final['@_id']) {
        stateIds.push({
          id: final['@_id'],
          type: 'final',
          parent: parentPath[parentPath.length - 1],
          path: [...parentPath, final['@_id']],
        });
      }
    });
  }
}

/**
 * Collect state IDs from a state element and its children
 */
function collectStateIdsFromState(
  state: StateElement,
  stateIds: StateIdInfo[],
  parentPath: string[]
): void {
  const stateId = state['@_id'];
  const currentPath = stateId ? [...parentPath, stateId] : parentPath;

  if (stateId) {
    stateIds.push({
      id: stateId,
      type: 'state',
      parent: parentPath[parentPath.length - 1],
      path: currentPath,
    });
  }

  // Recursively collect from nested states
  if (state.state) {
    const states = Array.isArray(state.state) ? state.state : [state.state];
    states.forEach((s) => {
      collectStateIdsFromState(s, stateIds, currentPath);
    });
  }

  // Collect from nested parallel states
  if (state.parallel) {
    const parallels = Array.isArray(state.parallel)
      ? state.parallel
      : [state.parallel];
    parallels.forEach((p) => {
      collectStateIdsFromParallel(p, stateIds, currentPath);
    });
  }

  // Collect from final states
  if (state.final) {
    const finals = Array.isArray(state.final) ? state.final : [state.final];
    finals.forEach((f) => {
      if (f['@_id']) {
        stateIds.push({
          id: f['@_id'],
          type: 'final',
          parent: currentPath[currentPath.length - 1],
          path: [...currentPath, f['@_id']],
        });
      }
    });
  }

  // Collect from history states
  if (state.history) {
    const histories = Array.isArray(state.history)
      ? state.history
      : [state.history];
    histories.forEach((h) => {
      if (h['@_id']) {
        stateIds.push({
          id: h['@_id'],
          type: 'history',
          parent: currentPath[currentPath.length - 1],
          path: [...currentPath, h['@_id']],
        });
      }
    });
  }
}

/**
 * Collect state IDs from a parallel element and its children
 */
function collectStateIdsFromParallel(
  parallel: ParallelElement,
  stateIds: StateIdInfo[],
  parentPath: string[]
): void {
  const parallelId = parallel['@_id'];
  const currentPath = parallelId ? [...parentPath, parallelId] : parentPath;

  if (parallelId) {
    stateIds.push({
      id: parallelId,
      type: 'parallel',
      parent: parentPath[parentPath.length - 1],
      path: currentPath,
    });
  }

  // Recursively collect from nested states
  if (parallel.state) {
    const states = Array.isArray(parallel.state)
      ? parallel.state
      : [parallel.state];
    states.forEach((s: StateElement) => {
      collectStateIdsFromState(s, stateIds, currentPath);
    });
  }

  // Collect from nested parallel states
  if (parallel.parallel) {
    const parallels = Array.isArray(parallel.parallel)
      ? parallel.parallel
      : [parallel.parallel];
    parallels.forEach((p: ParallelElement) => {
      collectStateIdsFromParallel(p, stateIds, currentPath);
    });
  }

  // Collect from history states
  if (parallel.history) {
    const histories = Array.isArray(parallel.history)
      ? parallel.history
      : [parallel.history];
    histories.forEach((h: HistoryElement) => {
      if (h['@_id']) {
        stateIds.push({
          id: h['@_id'],
          type: 'history',
          parent: currentPath[currentPath.length - 1],
          path: [...currentPath, h['@_id']],
        });
      }
    });
  }
}

/**
 * Get a simple list of state ID strings from XML content
 */
export function getStateIdList(xmlContent: string): string[] {
  return extractStateIdsFromXML(xmlContent).map(info => info.id);
}