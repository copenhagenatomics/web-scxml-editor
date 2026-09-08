import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { wouldCrossParallelRegions } from './parallel-region-connection-validation';
import { normalizeParallelGroups } from './parallel-group-normalization';

describe('wouldCrossParallelRegions', () => {
  it('blocks a transition between two different bare regions of the same auto-wrapped parallel', () => {
    const d: SCXMLDocument = {
      scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any,
    };
    normalizeParallelGroups(d);
    const result = wouldCrossParallelRegions(d, 'A', 'B');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/region/i);
  });

  it('allows a transition within the same multi-member auto-region', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'main_region state_2',
        state: [
          { '@_id': 'main_region', transition: { '@_event': 'event', '@_target': 'state_1' } },
          { '@_id': 'state_1' },
          { '@_id': 'state_2' },
        ],
      } as any,
    };
    normalizeParallelGroups(d);
    expect(wouldCrossParallelRegions(d, 'main_region', 'state_1').blocked).toBe(false);
  });

  it('allows a transition that leaves the parallel entirely (targets a state outside it)', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'Outside' }],
      } as any,
    };
    normalizeParallelGroups(d);
    expect(wouldCrossParallelRegions(d, 'A', 'Outside').blocked).toBe(false);
  });

  it('allows a transition between two states that are not inside any parallel', () => {
    const d: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any,
    };
    expect(wouldCrossParallelRegions(d, 'A', 'B').blocked).toBe(false);
  });

  it('blocks across sibling regions of a hand-authored <parallel> too (standards-based, not auto-wrap-specific)', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'Manual',
          state: [
            { '@_id': 'RegionA', state: [{ '@_id': 'A1' }] },
            { '@_id': 'RegionB', state: [{ '@_id': 'B1' }] },
          ],
        },
      } as any,
    };
    expect(wouldCrossParallelRegions(d, 'A1', 'B1').blocked).toBe(true);
  });

  it('blocks across sibling regions of an outer parallel when the source is nested inside an inner parallel that does not itself contain the target', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'Outer',
          state: [
            {
              '@_id': 'RegionA',
              parallel: {
                '@_id': 'Inner',
                state: [{ '@_id': 'IA1', state: [{ '@_id': 'Src' }] }, { '@_id': 'IA2' }],
              },
            },
            { '@_id': 'RegionB', state: [{ '@_id': 'Tgt' }] },
          ],
        },
      } as any,
    };
    const result = wouldCrossParallelRegions(d, 'Src', 'Tgt');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/Outer/);
  });

  it('returns not blocked when either id does not exist in the document', () => {
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }] } as any };
    expect(wouldCrossParallelRegions(d, 'A', 'Missing').blocked).toBe(false);
  });
});
