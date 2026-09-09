import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { normalizeParallelGroups, collectAutoParallelGroups, hasAnyChildren } from './parallel-group-normalization';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';

function ids(states: any): string[] {
  if (!states) return [];
  const arr = Array.isArray(states) ? states : [states];
  return arr.map((s) => s['@_id']);
}

describe('normalizeParallelGroups', () => {
  it('reports no change for a document with zero initial-marked states', () => {
    const d: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any,
    };
    const before = JSON.stringify(d);
    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('reports no change for a document with a single initial group (classic single-initial usage)', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      } as any,
    };
    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(false);
    expect(d.scxml['@_initial']).toBe('A');
    expect(d.scxml.parallel).toBeUndefined();
  });

  it('wraps two single-member initial groups under the root into a <parallel> with bare regions', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      } as any,
    };
    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(true);
    expect(d.scxml.state).toBeUndefined();
    const parallel = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    expect((parallel as any)['@_viz:auto-parallel']).toBe('true');
    expect(d.scxml['@_initial']).toBe(parallel['@_id']);
    const regionIds = ids(parallel.state);
    expect(regionIds.sort()).toEqual(['A', 'B']);
    // Bare single-member regions are the original state elements, not wrapped.
    const regions = Array.isArray(parallel.state) ? parallel.state : [parallel.state];
    regions.forEach((r: any) => expect(r['@_viz:auto-region']).toBeUndefined());
  });

  it('wraps a multi-member group (connected via a transition) into a synthetic auto-region <state>', () => {
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
    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(true);
    const parallel = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    const regions = Array.isArray(parallel.state) ? parallel.state : [parallel.state];
    expect(regions.length).toBe(2);

    const mainRegionWrapper = regions.find((r: any) => ids(r.state).includes('main_region'));
    expect(mainRegionWrapper).toBeDefined();
    expect((mainRegionWrapper as any)['@_viz:auto-region']).toBe('true');
    expect((mainRegionWrapper as any)['@_initial']).toBe('main_region');
    expect(ids(mainRegionWrapper!.state).sort()).toEqual(['main_region', 'state_1']);

    const bareRegion = regions.find((r: any) => r['@_id'] === 'state_2');
    expect(bareRegion).toBeDefined();
    expect((bareRegion as any)['@_viz:auto-region']).toBeUndefined();
  });

  it('is idempotent: running twice produces no further change', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      } as any,
    };
    normalizeParallelGroups(d);
    const after1 = JSON.stringify(d);
    const result2 = normalizeParallelGroups(d);
    expect(result2.changed).toBe(false);
    expect(JSON.stringify(d)).toBe(after1);
  });

  it('reports no change for an already-wrapped document freshly parsed from XML (not just an in-memory rebuild)', () => {
    // Regression test: the previous test above only re-runs normalization on
    // the SAME in-memory object normalizeParallelGroups itself just rebuilt,
    // so both "before" and "after" snapshots share the exact same property
    // insertion order and the comparison can never catch an order mismatch.
    // Real editing always re-parses fresh XML text on every keystroke
    // (editor-store.ts's normalizeContent), and fast-xml-parser produces a
    // different property order (attributes/elements interleaved in source
    // order) than applyWrapDecision's rebuilt objects (id, initial, state,
    // then the marker attribute appended last) — even when the document is
    // already in the exact correct wrapped shape. That order mismatch used
    // to make plain JSON.stringify comparison report `changed: true` on
    // every single edit to an already-wrapped document, forcing a full
    // re-serialize (and, in the editor, a Monaco cursor jump) even when
    // nothing structural had changed at all.
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" initial="__root_parallel">
      <parallel id="__root_parallel" viz:auto-parallel="true">
        <state id="main_region_region" initial="main_region" viz:auto-region="true">
          <state id="state_1"/>
          <state id="main_region">
            <transition target="state_1"/>
          </state>
        </state>
        <state id="state_2_region" initial="state_2" viz:auto-region="true">
          <state id="state_3"/>
          <state id="state_2">
            <transition target="state_3"/>
          </state>
        </state>
      </parallel>
    </scxml>`;
    const parseResult = new SCXMLParser().parse(xml);
    expect(parseResult.success).toBe(true);
    const result = normalizeParallelGroups(parseResult.data!);
    expect(result.changed).toBe(false);
  });

  it('leaves a non-Initial-marked, disconnected sibling outside the wrapper', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'Unassigned' }],
      } as any,
    };
    normalizeParallelGroups(d);
    expect(ids(d.scxml.state)).toEqual(['Unassigned']);
    const parallel = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    expect(ids(parallel.state).sort()).toEqual(['A', 'B']);
  });

  it('unwraps back to flat siblings when only one region remains in an already-wrapped parallel', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      } as any,
    };
    normalizeParallelGroups(d);

    // Simulate some other mutation (e.g. a delete-state command) removing
    // region B's bare wrapper from the already-wrapped parallel, leaving a
    // <parallel> with a single region — no longer a valid multi-group wrap.
    const parallel: any = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    parallel.state = (Array.isArray(parallel.state) ? parallel.state : [parallel.state]).filter(
      (r: any) => r['@_id'] !== 'B'
    );
    if (Array.isArray(parallel.state) && parallel.state.length === 1) {
      parallel.state = parallel.state[0];
    }

    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(true);
    expect(d.scxml.parallel).toBeUndefined();
    expect(ids(d.scxml.state)).toEqual(['A']);
    expect(d.scxml['@_initial']).toBe('A');
  });

  it('un-wraps a bare region whose Initial marker was removed from @_initial while the <parallel> structure itself is untouched (reproduces the reported "uncheck does nothing" bug)', () => {
    // This is exactly the intermediate document shape
    // ToggleInitialStateCommand now produces: it recomputes the real Initial
    // id set and writes it straight onto the container's @_initial, without
    // itself touching the still-wrapped <parallel>/region DOM structure
    // (that restructuring is this function's job, run on the very next
    // normalization pass). A bare region's continued *physical* presence in
    // the <parallel> must NOT be treated as proof it's still Initial —
    // @_initial is the authoritative source once it already names real
    // tokens instead of the wrapper's own id.
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B C',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'C' }],
      } as any,
    };
    normalizeParallelGroups(d);
    const parallelId = (Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!)['@_id'];
    expect(d.scxml['@_initial']).toBe(parallelId);

    // Simulate ToggleInitialStateCommand unmarking C: write the real
    // remaining token list, leaving the <parallel>'s bare regions (still
    // including C) completely untouched.
    d.scxml['@_initial'] = 'A B';

    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(true);
    // C must end up outside the wrapper, flat and unassigned — not
    // re-recognized as its own Initial region just because it's still
    // physically a bare region at this point.
    expect(ids(d.scxml.state)).toEqual(['C']);
    const parallel: any = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    expect(ids(parallel.state).sort()).toEqual(['A', 'B']);
    expect(d.scxml['@_initial']).toBe(parallelId);
  });

  it('wraps nested groups under a compound state, independently of the root', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'Parent',
        state: [
          {
            '@_id': 'Parent',
            '@_initial': 'X Y',
            state: [{ '@_id': 'X' }, { '@_id': 'Y' }],
          },
        ],
      } as any,
    };
    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(true);
    const parent = (Array.isArray(d.scxml.state) ? d.scxml.state[0] : d.scxml.state)! as any;
    expect(parent.state).toBeUndefined();
    const parallel = Array.isArray(parent.parallel) ? parent.parallel[0] : parent.parallel;
    expect(ids(parallel.state).sort()).toEqual(['X', 'Y']);
    expect(parent['@_initial']).toBe(parallel['@_id']);
  });

  it('leaves a hand-authored <parallel> (no viz:auto-parallel marker) completely untouched', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'Manual',
          state: [{ '@_id': 'RegionA', '@_initial': 'A1', state: [{ '@_id': 'A1' }] }, { '@_id': 'RegionB', '@_initial': 'B1', state: [{ '@_id': 'B1' }] }],
        },
      } as any,
    };
    const before = JSON.stringify(d);
    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('keeps parallel and region ids stable when a 3rd group joins an already-wrapped root', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      } as any,
    };
    normalizeParallelGroups(d);
    const parallelBefore = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    const parallelId = parallelBefore['@_id'];

    // A third work tree, C, joins alongside A and B under the same root — as
    // if the user added a new state and marked it Initial. Since the
    // container is already wrapped, the new member must be reachable as a
    // flat root-level sibling for normalization to fold it in, mirroring
    // what addStateToDocument + ToggleInitialStateCommand would produce —
    // including writing the *full* real token list (A, B, and now C) onto
    // @_initial, not just the newly-added one: @_initial resolving to real
    // ids is authoritative once it does (see getInitialIds), exactly so a
    // command can correctly *remove* a token too (the "uncheck" case) — a
    // partial write here wouldn't match how the real command behaves.
    d.scxml.state = [{ '@_id': 'C' }];
    d.scxml['@_initial'] = 'A B C';

    const result = normalizeParallelGroups(d);
    expect(result.changed).toBe(true);
    const parallelAfter = Array.isArray(d.scxml.parallel) ? d.scxml.parallel[0] : d.scxml.parallel!;
    expect(parallelAfter['@_id']).toBe(parallelId);
    expect(ids(parallelAfter.state).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('collectAutoParallelGroups', () => {
  it('returns nothing for a document with no auto-wrapped parallel', () => {
    const d: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any,
    };
    expect(collectAutoParallelGroups(d)).toEqual([]);
  });

  it('reports bare single-member regions at the root', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
      } as any,
    };
    normalizeParallelGroups(d);
    const groups = collectAutoParallelGroups(d);
    expect(groups).toHaveLength(1);
    expect(groups[0].containerId).toBeNull();
    expect(groups[0].regions.map((r) => r.memberIds).sort()).toEqual([['A'], ['B']]);
  });

  it('reports a multi-member auto-region alongside a bare region', () => {
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
    const [group] = collectAutoParallelGroups(d);
    const multiMember = group.regions.find((r) => r.memberIds.length > 1)!;
    expect(multiMember.memberIds.sort()).toEqual(['main_region', 'state_1']);
  });

  it('reports a nested auto-wrapped group under a compound state, with its container id', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'Parent',
        state: [
          {
            '@_id': 'Parent',
            '@_initial': 'X Y',
            state: [{ '@_id': 'X' }, { '@_id': 'Y' }],
          },
        ],
      } as any,
    };
    normalizeParallelGroups(d);
    const groups = collectAutoParallelGroups(d);
    expect(groups).toHaveLength(1);
    expect(groups[0].containerId).toBe('Parent');
  });

  it('does not report a hand-authored <parallel> with no viz:auto-parallel marker', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'Manual',
          state: [{ '@_id': 'RegionA' }, { '@_id': 'RegionB' }],
        },
      } as any,
    };
    expect(collectAutoParallelGroups(d)).toEqual([]);
  });
});

describe('hasAnyChildren', () => {
  it('is false for a container with no state and no parallel children', () => {
    expect(hasAnyChildren({} as any)).toBe(false);
  });

  it('is true for a container with a plain flat <state> child', () => {
    expect(hasAnyChildren({ state: [{ '@_id': 'A' }] } as any)).toBe(true);
  });

  it('is true for a container whose only children are hidden inside an auto-wrapped <parallel> (the bug this guards against)', () => {
    const d: SCXMLDocument = {
      scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any,
    };
    normalizeParallelGroups(d);
    // After wrapping, scxml.state is empty/undefined even though the
    // container conceptually already has A and B as children.
    expect(d.scxml.state).toBeUndefined();
    expect(hasAnyChildren(d.scxml)).toBe(true);
  });

  it('is true for a container with a hand-authored <parallel> child (no marker)', () => {
    expect(
      hasAnyChildren({ parallel: { '@_id': 'Manual', state: [{ '@_id': 'A' }] } } as any)
    ).toBe(true);
  });
});
