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

  it('reports one error per transition when two timer-event transitions target the same state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' },
            { '@_event': 'A_t_1_timeEvent_1', '@_target': 'B' },
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
      expect(e.message).toMatch(/only one timer-based transition/i);
    });
  });

  it('reports no errors for a timer event and a plain event transition to the same target (independent slots)', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' },
            { '@_event': 'e1', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors).toEqual([]);
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

describe('validateTransitionSlotConflicts — one transition per done.state.<id> event', () => {
  const run = (transition: object[]) => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'C', state: { '@_id': 'C1' }, final: { '@_id': 'CDone' }, transition },
        { '@_id': 'B' },
        { '@_id': 'D' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    return errors;
  };

  it('flags every done.state transition after the first, whatever their targets', () => {
    const errors = run([
      { '@_event': 'done.state.C', '@_target': 'B' },
      { '@_event': 'done.state.C', '@_target': 'D' },
      { '@_event': 'done.state.C' }, // targetless reactions shadow just the same
    ]);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toMatch(/'C' to 'D' on done\.state\.C can never fire.*\(to 'B'\)/);
    expect(errors[1].message).toMatch(/from 'C' on done\.state\.C can never fire/);
  });

  it('matches a done.state event inside a comma-separated event list', () => {
    expect(
      run([
        { '@_event': 'go, done.state.C', '@_target': 'B' },
        { '@_event': 'stop,done.state.C', '@_target': 'D' },
      ]).length
    ).toBe(1);
  });

  it('treats a space as part of the event name, not a separator (project rule 6.7)', () => {
    expect(
      run([
        { '@_event': 'done.state.Motor left', '@_target': 'B' },
        { '@_event': 'done.state.Motor right', '@_target': 'D' },
        { '@_event': 'stop done.state.C', '@_target': 'C1' },
        { '@_event': 'done.state.C', '@_target': 'CDone' },
      ])
    ).toEqual([]);
  });

  it('allows one transition per distinct done.state event, and ordinary duplicate events', () => {
    expect(
      run([
        { '@_event': 'done.state.C', '@_target': 'B' },
        { '@_event': 'done.state.C1', '@_target': 'D' },
        { '@_event': 'go', '@_target': 'C1' },
        { '@_event': 'go', '@_target': 'CDone' },
      ])
    ).toEqual([]);
  });

  it("doesn't double-report two done.state transitions to the same target (the event-slot check covers it)", () => {
    const errors = run([
      { '@_event': 'done.state.C', '@_target': 'B' },
      { '@_event': 'done.state.C', '@_target': 'B' },
    ]);
    expect(errors.every((e) => /only one event-based transition/i.test(e.message))).toBe(true);
  });

  it('flags a same-target done.state duplicate in a different slot (event vs timer), which the slot check misses', () => {
    // Same target and type, but 'event' vs 'timer' slots — the slot check accepts
    // the pair, so this check must not assume it was already reported.
    const errors = run([
      { '@_event': 'done.state.C', '@_target': 'B' },
      { '@_event': 'C_t_0_timeEvent_0, done.state.C', '@_target': 'B' },
    ]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/'C' to 'B' on done\.state\.C can never fire.*\(to 'B'\)/);
  });

  it('flags the shadowed transition in a real document, at its line', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="P">
  <parallel id="P">
    <state id="R1" initial="S2">
      <state id="S2" initial="S5">
        <state id="S5"><transition target="F1"/></state>
        <final id="F1"/>
        <transition target="F2" event="done.state.S2"/>
        <transition target="S7" event="done.state.S2"/>
      </state>
      <state id="S7"/>
      <final id="F2"/>
    </state>
    <state id="R2"/>
  </parallel>
</scxml>`;
    const parsed = new SCXMLParser().parse(xml);
    const errors = new SCXMLValidator()
      .validate(parsed.data!.scxml, xml)
      .filter((e) => /can never fire/.test(e.message));
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/'S2' to 'S7'/);
    expect(errors[0].line).toBe(8);
  });

  it('locates a shadowed targetless transition at its line (no target attribute to match)', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="P">
  <parallel id="P">
    <state id="R1" initial="S2">
      <state id="S2" initial="S5">
        <state id="S5"><transition target="F1"/></state>
        <final id="F1"/>
        <transition target="F2" event="done.state.S2"/>
        <transition event="done.state.S2"/>
      </state>
      <final id="F2"/>
    </state>
    <state id="R2"/>
  </parallel>
</scxml>`;
    const parsed = new SCXMLParser().parse(xml);
    const errors = new SCXMLValidator()
      .validate(parsed.data!.scxml, xml)
      .filter((e) => /can never fire/.test(e.message));
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/from 'S2' on done\.state\.S2/);
    expect(errors[0].line).toBe(8);
    expect(errors[0].column).toBe(9);
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
