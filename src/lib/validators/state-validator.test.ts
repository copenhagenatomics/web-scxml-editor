import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateCompoundStates, findMainPrefixedDataIds } from './state-validator';

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
