import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateTransitionSlotConflicts } from './transition-slot-validator';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { SCXMLValidator } from './scxml-validator';

describe('validateTransitionSlotConflicts', () => {
  it('reports no errors for one event-slot and one cond-slot transition to the same target (the allowed case)', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'e1', '@_target': 'B' },
            { '@_cond': 'x>1', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors).toEqual([]);
  });

  it('reports an error for a transition with both event and cond set', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'A', transition: { '@_event': 'e1', '@_cond': 'x>1', '@_target': 'B' } },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('error');
    expect(errors[0].message).toMatch(/both an event and a condition/i);
  });

  it('reports one error per transition when two event-slot transitions target the same state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'e1', '@_target': 'B' },
            { '@_event': 'e2', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
    errors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.message).toMatch(/only one event-based transition/i);
    });
  });

  it('reports one error per transition when two cond-slot transitions target the same state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_cond': 'x>1', '@_target': 'B' },
            { '@_cond': 'x<0', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
    errors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.message).toMatch(/only one condition-based transition/i);
    });
  });

  it('reports one error per transition when two eventless (bare) transitions target the same state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_target': 'B' },
            { '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
    errors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.message).toMatch(/only one eventless transition/i);
    });
  });

  it('reports no errors for an eventless, an event-slot, and a cond-slot transition all to the same target (three independent slots)', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_target': 'B' },
            { '@_event': 'e1', '@_target': 'B' },
            { '@_cond': 'x>1', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors).toEqual([]);
  });

  it('reports no errors for clean, non-conflicting transitions across multiple states', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } },
        { '@_id': 'B', transition: { '@_cond': 'x>1', '@_target': 'A' } },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors).toEqual([]);
  });

  it('recurses into nested state and parallel elements', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Parent',
          state: [
            {
              '@_id': 'A',
              transition: [
                { '@_event': 'e1', '@_target': 'B' },
                { '@_event': 'e2', '@_target': 'B' },
              ],
            },
            { '@_id': 'B' },
          ],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
  });
});

describe('validateTransitionSlotConflicts via the full SCXMLValidator pipeline', () => {
  it('reports a distinct squiggle-position error for EACH transition in an exact-duplicate pasted pair, surviving deduplication', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
  <state id="A">
    <transition event="e1" target="B"/>
    <transition event="e1" target="B"/>
  </state>
  <state id="B"/>
</scxml>`;
    const parser = new SCXMLParser();
    const parseResult = parser.parse(xml);
    expect(parseResult.success).toBe(true);
    const validator = new SCXMLValidator();
    const errors = validator.validate(parseResult.data!.scxml, xml);
    const slotErrors = errors.filter((e) => /only one event-based transition/i.test(e.message));
    expect(slotErrors.length).toBe(2);
    expect(slotErrors[0].line).not.toBe(slotErrors[1].line);
    expect(slotErrors.map((e) => e.line).sort()).toEqual([3, 4]);
  });

  it('reports invalid-both and slot-conflict errors independently within the same group without interference', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'e1', '@_cond': 'x>1', '@_target': 'B' },
            { '@_event': 'e2', '@_target': 'B' },
            { '@_event': 'e3', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(3);
    const bothErrors = errors.filter((e) => /both an event and a condition/i.test(e.message));
    const slotErrors = errors.filter((e) => /only one event-based transition/i.test(e.message));
    expect(bothErrors.length).toBe(1);
    expect(slotErrors.length).toBe(2);
  });
});
