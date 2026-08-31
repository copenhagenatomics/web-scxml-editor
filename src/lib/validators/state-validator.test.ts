import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateCompoundStates, findMainPrefixedDataIds, validateParallelRegions } from './state-validator';

describe('validateCompoundStates stateId attachment', () => {
  it('attaches the compound state id to a missing-initial error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', state: [{ '@_id': 'Child' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateCompoundStates(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('Parent');
  });

  it('reports no error for a compound state with an initial attribute', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', '@_initial': 'Child', state: [{ '@_id': 'Child' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateCompoundStates(scxml, errors);
    expect(errors).toEqual([]);
  });
});

describe('findMainPrefixedDataIds', () => {
  it('finds "main_" prefixed data ids at the root and in nested states', () => {
    const scxml: SCXMLElement = {
      datamodel: { data: [{ '@_id': 'main_asas', '@_expr': '0' }, { '@_id': 'this_ok' }] },
      state: [
        {
          '@_id': 'Parent',
          datamodel: { data: [{ '@_id': 'main_nested' }] },
        },
      ],
    } as any;

    expect(findMainPrefixedDataIds(scxml)).toEqual(['main_asas', 'main_nested']);
  });

  it('returns an empty array when no "main_" prefixed ids exist', () => {
    const scxml: SCXMLElement = {
      datamodel: { data: [{ '@_id': 'this_ok' }, { '@_id': 'conf_ok' }] },
    } as any;

    expect(findMainPrefixedDataIds(scxml)).toEqual([]);
  });
});

describe('validateParallelRegions', () => {
  it('flags a region with children but no initial attribute/element', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Airplane',
          '@_initial': 'Engines',
          parallel: [
            {
              '@_id': 'Engines',
              state: [
                { '@_id': 'Left', state: [{ '@_id': 'LeftOff' }, { '@_id': 'LeftOn' }] }, // no @_initial
                { '@_id': 'Right', '@_initial': 'RightOff', state: [{ '@_id': 'RightOff' }, { '@_id': 'RightOn' }] },
              ],
            },
          ],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Compound state 'Left'"))).toBe(true);
    expect(messages.some((m) => m.includes("Compound state 'Right'"))).toBe(false);
  });

  it('warns when a parallel state has fewer than 2 regions', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Airplane',
          '@_initial': 'Engines',
          parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }] }],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    expect(
      errors.some((e) => e.severity === 'warning' && e.message.includes("'Engines'") && e.message.includes('at least 2 regions'))
    ).toBe(true);
  });

  it('does not warn when a parallel state has 2+ regions', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Airplane',
          '@_initial': 'Engines',
          parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }, { '@_id': 'Right' }] }],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    expect(errors.some((e) => e.message.includes('at least 2 regions'))).toBe(false);
  });

  it('validates regions of a root-level parallel (no enclosing <state>)', () => {
    const scxml: SCXMLElement = {
      parallel: [{ '@_id': 'Engines', state: [{ '@_id': 'Left' }, { '@_id': 'Right' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    expect(errors.some((e) => e.message.includes('at least 2 regions'))).toBe(false);
  });

  it('recurses into a parallel nested inside a region (parallel-in-parallel)', () => {
    const scxml: SCXMLElement = {
      parallel: [
        {
          '@_id': 'Outer',
          state: [{ '@_id': 'A' }],
          parallel: [{ '@_id': 'Inner', state: [{ '@_id': 'X', state: [{ '@_id': 'X1' }] }] }],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateParallelRegions(scxml, errors);
    // Outer has 2 regions (A, Inner) so no region-count warning for Outer;
    // Inner has only 1 region (X) so it should warn; X has children but no initial so it should error.
    expect(errors.some((e) => e.message.includes("'Outer'") && e.message.includes('at least 2 regions'))).toBe(false);
    expect(errors.some((e) => e.message.includes("'Inner'") && e.message.includes('at least 2 regions'))).toBe(true);
    expect(errors.some((e) => e.message.includes("Compound state 'X'"))).toBe(true);
  });
});
