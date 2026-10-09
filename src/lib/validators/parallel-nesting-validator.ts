import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { findNestedParallels } from '@/lib/utils/parallel-nesting-rules';
import { isRootParallel } from '@/lib/utils/parallel-structure';

/**
 * Reports every <parallel> nested inside another <parallel> — the static
 * counterpart of the live gates in parallel-nesting-rules.ts, for nesting
 * the diagram can't prevent (hand-edited XML, loaded files, host API).
 */
export function validateParallelNesting(scxml: SCXMLElement, errors: ValidationError[]): void {
  findNestedParallels({ scxml }).forEach(({ stateId, outerParallelId }) => {
    const outer = isRootParallel({ '@_id': outerParallelId })
      ? 'the top-level parallel state'
      : `parallel state '${outerParallelId}'`;
    errors.push({
      message: `Parallel state '${stateId}' is nested inside ${outer}. Nested parallel states are not allowed — move it out of the parallel state, or keep a single Initial State in its container.`,
      severity: 'error',
      stateId,
    });
  });
}
