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
});
