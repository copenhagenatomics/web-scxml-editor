import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { normalizeParallelGroups } from './parallel-group-normalization';
import {
  NESTED_PARALLEL_MESSAGE,
  findNestedParallels,
  introducesNestedParallel,
  wouldNestParallelIfConnected,
  wouldNestParallelIfMarkedInitial,
} from './parallel-nesting-rules';
import { addStateToDocument } from './scxml-manipulation-utils';

const HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

/** Parse and normalize, the way the editor store holds every document. */
function doc(body: string, rootAttrs = ''): SCXMLDocument {
  const d = new SCXMLParser().parse(`${HEADER}${rootAttrs}>${body}</scxml>`).data!;
  normalizeParallelGroups(d);
  return d;
}

const INNER_PARALLEL = '<parallel id="P"><state id="P1"/><state id="P2"/></parallel>';

describe('findNestedParallels', () => {
  it('finds nothing in a flat parallel', () => {
    expect(findNestedParallels(doc(INNER_PARALLEL))).toEqual([]);
  });

  it('finds a <parallel> inside a region of another <parallel>, at any depth', () => {
    const d = doc(
      `<parallel id="Outer"><state id="R1" initial="C"><state id="C" initial="P">${INNER_PARALLEL}</state></state><state id="R2"/></parallel>`,
    );
    expect(findNestedParallels(d)).toEqual([
      { parallelId: 'P', stateId: 'P', outerParallelId: 'Outer' },
    ]);
  });

  it("points at a transparent {id}__parallel's host state", () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'Outer',
          state: [
            {
              '@_id': 'R1',
              '@_initial': 'R1__parallel',
              state: { '@_id': 'Loose' },
              parallel: { '@_id': 'R1__parallel', state: [{ '@_id': 'a' }, { '@_id': 'b' }] },
            },
            { '@_id': 'R2' },
          ],
        },
      } as any,
    };
    expect(findNestedParallels(d)).toEqual([
      { parallelId: 'R1__parallel', stateId: 'R1', outerParallelId: 'Outer' },
    ]);
  });
});

describe('wouldNestParallelIfMarkedInitial', () => {
  it('blocks a second Initial work tree inside a region of a parallel state', () => {
    const d = doc(
      '<parallel id="Outer"><state id="R1" initial="A"><state id="A"/><state id="B"/></state><state id="R2"/></parallel>',
    );
    expect(wouldNestParallelIfMarkedInitial(d, 'B')).toEqual({
      blocked: true,
      reason: NESTED_PARALLEL_MESSAGE,
    });
  });

  it('blocks a second Initial work tree next to a state that already holds a parallel', () => {
    const d = doc(`<state id="C" initial="P">${INNER_PARALLEL}</state><state id="D"/>`, ' initial="C"');
    expect(wouldNestParallelIfMarkedInitial(d, 'D').blocked).toBe(true);
  });

  it('allows a second Initial work tree when no parallel ends up nested', () => {
    const d = doc('<state id="C" initial="A"><state id="A"/><state id="B"/></state>', ' initial="C"');
    expect(wouldNestParallelIfMarkedInitial(d, 'B').blocked).toBe(false);
  });

  it('allows a single Initial inside a region', () => {
    const d = doc(
      '<parallel id="Outer"><state id="R1"><state id="A"/></state><state id="R2"/></parallel>',
    );
    expect(wouldNestParallelIfMarkedInitial(d, 'A').blocked).toBe(false);
  });
});

describe('wouldNestParallelIfConnected', () => {
  // Root: two Initial work trees (A, B) wrapped into __root_parallel, plus
  // loose states beside it — C holds a parallel, D doesn't.
  const rootWithLoose = () =>
    doc(
      `<state id="A"/><state id="B"/><state id="C" initial="P">${INNER_PARALLEL}</state><state id="D"/>`,
      ' initial="A B"',
    );

  it('blocks connecting a loose state that holds a parallel into a region', () => {
    const d = rootWithLoose();
    expect(findNestedParallels(d)).toEqual([]);
    expect(wouldNestParallelIfConnected(d, 'A', 'C').blocked).toBe(true);
    expect(wouldNestParallelIfConnected(d, 'C', 'A').blocked).toBe(true);
  });

  it('allows connecting a plain loose state into a region', () => {
    expect(wouldNestParallelIfConnected(rootWithLoose(), 'A', 'D').blocked).toBe(false);
  });
});

describe('introducesNestedParallel', () => {
  it('blocks pasting a parallel into a region', () => {
    const before = doc(
      '<parallel id="Outer"><state id="R1" initial="A"><state id="A"/></state><state id="R2"/></parallel>',
    );
    const after = JSON.parse(JSON.stringify(before));
    addStateToDocument(
      after,
      { '@_id': 'Q', state: [{ '@_id': 'q1' }, { '@_id': 'q2' }] } as any,
      'R1',
      'parallel',
    );
    expect(introducesNestedParallel(before, after).blocked).toBe(true);
  });

  it("doesn't block edits to a document that was already nested", () => {
    const before = doc(
      `<parallel id="Outer"><state id="R1" initial="P">${INNER_PARALLEL}</state><state id="R2"/></parallel>`,
    );
    const after = JSON.parse(JSON.stringify(before));
    addStateToDocument(after, { '@_id': 'New' } as any, 'R2', 'state');
    expect(introducesNestedParallel(before, after).blocked).toBe(false);
  });
});
