import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateInitialStateGroups } from './initial-group-validator';

describe('validateInitialStateGroups', () => {
  it('reports no errors for a document with a single Initial State', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'B', transition: { '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toEqual([]);
  });

  it('reports no errors when two Initial States exist but are never connected', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A B',
      state: [{ '@_id': 'A' }, { '@_id': 'B' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toEqual([]);
  });

  it('reports an error when a transition connects two different root-level Initial State groups', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A B',
      state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('error');
    expect(errors[0].message).toContain('A');
    expect(errors[0].message).toContain('B');
    expect(errors[0].stateId).toBe('A');
    expect(errors[0].targetStateId).toBe('B');
  });

  it('reports an error for a merged group inside a nested compound state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Parent',
          '@_initial': 'ChildA ChildB',
          state: [
            { '@_id': 'ChildA', transition: { '@_target': 'ChildB' } },
            { '@_id': 'ChildB' },
          ],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
  });

  it('does not let a conflict in one parent leak into an unrelated parent', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'P1', '@_initial': 'A B', state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }] },
        { '@_id': 'P2', '@_initial': 'C', state: [{ '@_id': 'C' }] },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
  });

  it('reports a compound state with 2+ Initial States that cannot become a <parallel> because it has <final> children', () => {
    const scxml: SCXMLElement = {
      state: {
        '@_id': 'P',
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }],
        final: { '@_id': 'Done' },
      },
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0].stateId).toBe('P');
    expect(errors[0].message).toContain('<final>');
  });

  it('does not treat the regions of a <parallel> as conflicting Initial State groups', () => {
    const scxml: SCXMLElement = {
      parallel: {
        '@_id': 'P',
        state: [{ '@_id': 'R1', transition: { '@_target': 'R2' } }, { '@_id': 'R2' }],
      },
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toEqual([]);
  });

  it('still checks Initial State groups inside a region of a <parallel>', () => {
    const scxml: SCXMLElement = {
      parallel: {
        '@_id': 'P',
        state: [
          {
            '@_id': 'R1',
            '@_initial': 'X Y',
            state: [{ '@_id': 'X', transition: { '@_target': 'Y' } }, { '@_id': 'Y' }],
          },
          { '@_id': 'R2' },
        ],
      },
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0].stateId).toBe('X');
  });

  it('does not report a transition between two regions of __root_parallel as merging Initial State groups', () => {
    const scxml: SCXMLElement = {
      '@_initial': '__root_parallel',
      parallel: {
        '@_id': '__root_parallel',
        state: [
          { '@_id': 'R1', '@_initial': 'X', state: { '@_id': 'X' }, transition: { '@_target': 'R2' } },
          { '@_id': 'R2', '@_initial': 'Y', state: { '@_id': 'Y' } },
        ],
      },
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toEqual([]);
  });

  it('still reports merged Initial State groups among ordinary root siblings next to __root_parallel', () => {
    const scxml: SCXMLElement = {
      '@_initial': '__root_parallel C D',
      state: [{ '@_id': 'C', transition: { '@_target': 'D' } }, { '@_id': 'D' }],
      parallel: { '@_id': '__root_parallel', state: [{ '@_id': 'R1' }, { '@_id': 'R2' }] },
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toHaveLength(1);
    expect([errors[0].stateId, errors[0].targetStateId].sort()).toEqual(['C', 'D']);
  });
});
