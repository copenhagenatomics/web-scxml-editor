import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateCompoundStates } from './state-validator';

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
