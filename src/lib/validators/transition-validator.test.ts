import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import {
  validateTransitionsInElement,
  validateInitialStates,
  validateTransitionSemantics,
  validateCrossHierarchyTransitions,
} from './transition-validator';

describe('validateTransitionSemantics event name validation', () => {
  it('reports no warnings for a comma-separated event list of valid identifiers', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': 'event1, event2', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors).toEqual([]);
  });

  it('treats a space-separated value as a single event name containing spaces (no longer split on whitespace)', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': 'event1 event2', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors).toEqual([]);
  });

  it('reports exactly one warning for a single invalid token inside a comma-separated list', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': 'event1, 1bad', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].message).toContain('1bad');
  });

  it('accepts wildcard tokens inside a comma-separated list', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': '*, foo.*', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors).toEqual([]);
  });
});

describe('validateTransitionsInElement stateId attachment', () => {
  it('attaches the source and missing target ids to a target-not-found error', () => {
    const element = {
      '@_id': 'A',
      transition: { '@_target': 'Ghost' },
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionsInElement(element, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
    expect(errors[0].targetStateId).toBe('Ghost');
  });
});

describe('validateInitialStates stateId attachment', () => {
  it('attaches the parent state id and the missing initial reference', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', '@_initial': 'Ghost' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStates(scxml, new Set(['Parent']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('Parent');
    expect(errors[0].targetStateId).toBe('Ghost');
  });
});

describe('validateTransitionSemantics stateId attachment', () => {
  it('attaches the source state id to an invalid transition type error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_type': 'bogus', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
  });

  it('attaches the source state id to an internal-transition-with-target error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_type': 'internal', '@_target': 'B' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A', 'B']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
  });

  it('attaches the source state id to an invalid event name warning', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': '1bad', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
  });
});

describe('validateCrossHierarchyTransitions stateId attachment', () => {
  it('attaches source and target ids to a cross-hierarchy transition error', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'P1', state: [{ '@_id': 'A', transition: { '@_target': 'B' } }] },
        { '@_id': 'P2', state: [{ '@_id': 'B' }] },
      ],
    } as any;
    const stateParentMap = new Map<string, string | null>([
      ['P1', null],
      ['P2', null],
      ['A', 'P1'],
      ['B', 'P2'],
    ]);
    const errors: ValidationError[] = [];
    validateCrossHierarchyTransitions(scxml, stateParentMap, undefined, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('A');
    expect(errors[0].targetStateId).toBe('B');
  });
});
