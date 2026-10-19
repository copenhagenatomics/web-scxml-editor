import { describe, it, expect } from 'vitest';
import type { TransitionElement, SCXMLDocument } from '@/types/scxml';
import {
  classifyTransitionSlot,
  findTransitionSlotConflict,
  checkNewConnectionSlotConflict,
  checkTransitionEditSlotConflict,
  checkReactionsDoneStateConflict,
  getDoneStateEvents,
} from './transition-slot-rules';

describe('classifyTransitionSlot', () => {
  it('classifies an event-only transition as the event slot', () => {
    const t: TransitionElement = { '@_event': 'click', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('event');
  });

  it('classifies a bare transition with neither event nor cond as the always slot', () => {
    const t: TransitionElement = { '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('always');
  });

  it('classifies a cond-only transition as the cond slot', () => {
    const t: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('cond');
  });

  it('classifies a transition with both event and cond as invalid-both', () => {
    const t: TransitionElement = { '@_event': 'click', '@_cond': 'x>1', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('invalid-both');
  });

  it('treats a whitespace-only event as absent (falls into cond slot)', () => {
    const t: TransitionElement = { '@_event': '   ', '@_cond': 'x>1', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('cond');
  });

  it('treats a whitespace-only cond as absent (falls into event slot)', () => {
    const t: TransitionElement = { '@_event': 'click', '@_cond': '  ', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('event');
  });

  it('classifies an auto-generated timer event as the timer slot, distinct from the event slot', () => {
    const t: TransitionElement = { '@_event': 'Idle_t_0_timeEvent_0', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('timer');
  });

  it('classifies a comma-merged list containing a timer token as the timer slot', () => {
    const t: TransitionElement = { '@_event': 'click, Idle_t_0_timeEvent_0', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('timer');
  });
});

describe('findTransitionSlotConflict', () => {
  it('does not block when there are no existing transitions', () => {
    const candidate: TransitionElement = { '@_event': 'click', '@_target': 'B' };
    expect(findTransitionSlotConflict([], candidate)).toEqual({ blocked: false });
  });

  it('blocks a second event-slot transition when one already exists', () => {
    const existing: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'e2', '@_target': 'B' };
    const result = findTransitionSlotConflict([existing], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one event-based transition/i);
  });

  it('blocks a second cond-slot transition when one already exists', () => {
    const existing: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_cond': 'x<0', '@_target': 'B' };
    const result = findTransitionSlotConflict([existing], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one condition-based transition/i);
  });

  it('does not block an event-slot candidate when only a cond-slot transition exists', () => {
    const existing: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('does not block a cond-slot candidate when only an event-slot transition exists', () => {
    const existing: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('blocks a second always-slot (eventless) transition when one already exists', () => {
    const existing: TransitionElement = { '@_target': 'B' };
    const candidate: TransitionElement = { '@_target': 'B' };
    const result = findTransitionSlotConflict([existing], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one eventless transition/i);
  });

  it('does not block an always-slot candidate when only event- and cond-slot transitions exist', () => {
    const existing: TransitionElement[] = [
      { '@_event': 'e1', '@_target': 'B' },
      { '@_cond': 'x>1', '@_target': 'B' },
    ];
    const candidate: TransitionElement = { '@_target': 'B' };
    expect(findTransitionSlotConflict(existing, candidate)).toEqual({ blocked: false });
  });

  it('does not block an event-slot candidate when only an always-slot (eventless) transition exists', () => {
    const existing: TransitionElement = { '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('blocks a candidate with both event and cond, even with no existing transitions', () => {
    const candidate: TransitionElement = { '@_event': 'e1', '@_cond': 'x>1', '@_target': 'B' };
    const result = findTransitionSlotConflict([], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/both an event and a condition/i);
  });

  it('blocks a second timer-slot transition when one already exists', () => {
    const existing: TransitionElement = { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'A_t_1_timeEvent_1', '@_target': 'B' };
    const result = findTransitionSlotConflict([existing], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one timer-based transition/i);
  });

  it('does not block a timer-slot candidate when only a plain event-slot transition exists', () => {
    const existing: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('does not block an event-slot candidate when only a timer-slot transition exists', () => {
    const existing: TransitionElement = { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('does not block a timer-slot candidate when only cond- and always-slot transitions exist', () => {
    const existing: TransitionElement[] = [
      { '@_cond': 'x>1', '@_target': 'B' },
      { '@_target': 'B' },
    ];
    const candidate: TransitionElement = { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' };
    expect(findTransitionSlotConflict(existing, candidate)).toEqual({ blocked: false });
  });
});

describe('checkNewConnectionSlotConflict', () => {
  // A freshly-drawn diagram connection is usually constructed as a bare/eventless candidate
  // (see onConnect in visual-diagram.tsx), so it only conflicts with an existing eventless
  // transition to the same target — event- and cond-slot transitions coexist. The
  // done.state.<id> exception is covered in its own describe below.
  it('blocks a new connection when an eventless transition to the same target already exists', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_target': 'B' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    const result = checkNewConnectionSlotConflict(doc, 'A', 'B');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one eventless transition/i);
  });

  it('does not block a new connection when only an event-slot transition to the target exists', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('does not block a new connection when only a cond-slot transition to the target exists', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_cond': 'x>1', '@_target': 'B' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('does not block a new connection when the source has no transitions at all', () => {
    const doc: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('does not block a new connection when the existing transition targets a different state', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'C' } },
          { '@_id': 'B' },
          { '@_id': 'C' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  describe('out of a compound state with a <final> inside a parallel region (done.state.<id> default)', () => {
    const doc = (transition?: object): SCXMLDocument =>
      ({
        scxml: {
          parallel: {
            '@_id': 'P',
            state: [
              {
                '@_id': 'R1',
                state: [
                  { '@_id': 'C', state: { '@_id': 'C1' }, final: { '@_id': 'CDone' }, transition },
                  { '@_id': 'B' },
                ],
              },
              { '@_id': 'R2', state: { '@_id': 'X' } },
            ],
          },
        },
      }) as any;

    it('checks the event slot: blocked by an existing done.state event transition, not by an eventless one', () => {
      expect(
        checkNewConnectionSlotConflict(doc({ '@_event': 'done.state.C', '@_target': 'B' }), 'C', 'B').reason
      ).toMatch(/only one event-based transition/i);
      expect(checkNewConnectionSlotConflict(doc({ '@_target': 'B' }), 'C', 'B')).toEqual({ blocked: false });
    });

    it('blocks a second done.state.<id> transition to a different target too', () => {
      const result = checkNewConnectionSlotConflict(
        doc({ '@_event': 'done.state.C', '@_target': 'B' }),
        'C',
        'C1'
      );
      expect(result.blocked).toBe(true);
      expect(result.reason).toMatch(/'C' already has a done\.state\.C transition \(to 'B'\)/);
    });

    it('checks the event slot out of a <parallel> whose regions all have a <final>', () => {
      const parallelDoc = (transition: object): SCXMLDocument =>
        ({
          scxml: {
            parallel: {
              '@_id': 'P',
              state: [
                { '@_id': 'R1', final: { '@_id': 'R1Done' } },
                { '@_id': 'R2', final: { '@_id': 'R2Done' } },
              ],
              transition,
            },
            state: { '@_id': 'Next' },
          },
        }) as any;
      expect(
        checkNewConnectionSlotConflict(parallelDoc({ '@_event': 'done.state.P', '@_target': 'Next' }), 'P', 'Next')
          .reason
      ).toMatch(/only one event-based transition/i);
      expect(checkNewConnectionSlotConflict(parallelDoc({ '@_target': 'Next' }), 'P', 'Next')).toEqual({
        blocked: false,
      });
    });
  });

  it('does not block a new (external) connection when the existing event-slot transition to the target is internal', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B', '@_type': 'internal' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });
});

describe('checkTransitionEditSlotConflict', () => {
  it('excludes the transition being edited from the conflict check (no self-conflict)', () => {
    const doc: SCXMLDocument = {
      scxml: {
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
      } as any,
    };
    // Re-saving transition index 0's own event should not conflict with itself.
    const candidate: TransitionElement = { '@_event': 'e2', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result).toEqual({ blocked: false });
  });

  it('blocks switching a transition into a slot already occupied by a sibling', () => {
    const doc: SCXMLDocument = {
      scxml: {
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
      } as any,
    };
    // Editing transition index 0 (currently event-slot) to a cond collides with index 1 (cond-slot).
    const candidate: TransitionElement = { '@_cond': 'y<0', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one condition-based transition/i);
  });

  it('blocks a candidate with both event and cond regardless of transitionIndex', () => {
    const doc: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } }, { '@_id': 'B' }] } as any,
    };
    const candidate: TransitionElement = { '@_event': 'e2', '@_cond': 'x>1', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/both an event and a condition/i);
  });

  it('does not exclude anything when transitionIndex is undefined (e.g. index could not be parsed)', () => {
    const doc: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } }, { '@_id': 'B' }] } as any,
    };
    const candidate: TransitionElement = { '@_event': 'e2', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', undefined, candidate);
    expect(result.blocked).toBe(true);
  });

  it('blocks clearing a transition to eventless when a sibling is already eventless', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'A',
            transition: [
              { '@_event': 'e1', '@_target': 'B' },
              { '@_target': 'B' },
            ],
          },
          { '@_id': 'B' },
        ],
      } as any,
    };
    // Clearing transition index 0 (currently event-slot) to eventless collides with index 1 (already eventless).
    const candidate: TransitionElement = { '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one eventless transition/i);
  });

  it('does not block clearing a transition to eventless when siblings are event/cond-slot', () => {
    const doc: SCXMLDocument = {
      scxml: {
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
      } as any,
    };
    const candidate: TransitionElement = { '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result).toEqual({ blocked: false });
  });

  it('blocks switching a transition into a timer slot already occupied by a sibling', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'A',
            transition: [
              { '@_event': 'e1', '@_target': 'B' },
              { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' },
            ],
          },
          { '@_id': 'B' },
        ],
      } as any,
    };
    // Editing transition index 0 (currently a plain event) into a timer event collides
    // with index 1's existing timer-slot transition.
    const candidate: TransitionElement = { '@_event': 'A_t_1_timeEvent_1', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one timer-based transition/i);
  });

  it('does not block switching a transition into a timer slot when the sibling is a plain event-slot transition', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'A',
            transition: [
              { '@_cond': 'x>1', '@_target': 'B' },
              { '@_event': 'e1', '@_target': 'B' },
            ],
          },
          { '@_id': 'B' },
        ],
      } as any,
    };
    const candidate: TransitionElement = { '@_event': 'A_t_0_timeEvent_0', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result).toEqual({ blocked: false });
  });
});

describe('slot conflict checks correctly reach into <parallel> regions', () => {
  it('checkNewConnectionSlotConflict blocks a duplicate eventless connection from a state inside a <parallel> region', () => {
    const doc: SCXMLDocument = {
      scxml: {
        parallel: [
          {
            '@_id': 'P',
            state: [
              { '@_id': 'A', transition: { '@_target': 'B' } },
              { '@_id': 'B' },
            ],
          },
        ],
      } as any,
    };
    const result = checkNewConnectionSlotConflict(doc, 'A', 'B');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one eventless transition/i);
  });

  it('checkTransitionEditSlotConflict blocks a sibling-slot collision for a source state inside a <parallel> region', () => {
    const doc: SCXMLDocument = {
      scxml: {
        parallel: [
          {
            '@_id': 'P',
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
          },
        ],
      } as any,
    };
    const candidate: TransitionElement = { '@_cond': 'y<0', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one condition-based transition/i);
  });

  it('checkNewConnectionSlotConflict does not block when a state inside a <parallel> region genuinely has no conflicting transitions', () => {
    const doc: SCXMLDocument = {
      scxml: {
        parallel: [
          { '@_id': 'P', state: [{ '@_id': 'A' }, { '@_id': 'B' }] },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('finds a source state nested in a <parallel> that is itself nested inside a plain <state>', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'Outer',
            parallel: [
              {
                '@_id': 'P',
                state: [
                  { '@_id': 'A', transition: { '@_target': 'B' } },
                  { '@_id': 'B' },
                ],
              },
            ],
          },
        ],
      } as any,
    };
    const result = checkNewConnectionSlotConflict(doc, 'A', 'B');
    expect(result.blocked).toBe(true);
  });
});

describe('one transition per done.state.<id> event (checkTransitionEditSlotConflict)', () => {
  // C (compound, has a <final>) → B on done.state.C (index 0), → D eventless (index 1).
  const doc = (): SCXMLDocument =>
    ({
      scxml: {
        state: [
          {
            '@_id': 'C',
            final: { '@_id': 'CDone' },
            transition: [
              { '@_event': 'done.state.C', '@_target': 'B' },
              { '@_target': 'D' },
            ],
          },
          { '@_id': 'B' },
          { '@_id': 'D' },
          { '@_id': 'E', transition: { '@_event': 'done.state.C', '@_target': 'B' } },
        ],
      } as any,
    });

  it('blocks giving another transition on the state the same done.state event (Transition panel edit)', () => {
    const result = checkTransitionEditSlotConflict(doc(), 'C', 1, { '@_event': 'done.state.C', '@_target': 'D' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/already has a done\.state\.C transition \(to 'B'\)/);
  });

  it('also catches the done event inside a merged event list', () => {
    expect(
      checkTransitionEditSlotConflict(doc(), 'C', 1, { '@_event': 'go, done.state.C', '@_target': 'D' }).blocked
    ).toBe(true);
  });

  it("doesn't count the transition being edited against itself", () => {
    expect(
      checkTransitionEditSlotConflict(doc(), 'C', 0, { '@_event': 'done.state.C', '@_target': 'D' })
    ).toEqual({ blocked: false });
  });

  it('blocks moving a done.state transition onto a source that already has one (reconnect, no index)', () => {
    // E's own done.state.C transition is moved onto C: nothing on C is excluded.
    expect(
      checkTransitionEditSlotConflict(doc(), 'C', undefined, { '@_event': 'done.state.C', '@_target': 'D' })
        .blocked
    ).toBe(true);
  });

  it('allows other events, and a distinct done.state event', () => {
    expect(checkTransitionEditSlotConflict(doc(), 'C', 1, { '@_event': 'go', '@_target': 'D' })).toEqual({
      blocked: false,
    });
    expect(
      checkTransitionEditSlotConflict(doc(), 'C', 1, { '@_event': 'done.state.CDone', '@_target': 'D' })
    ).toEqual({ blocked: false });
  });
});

describe('checkReactionsDoneStateConflict (State Actions panel event reactions)', () => {
  // C (compound, has a <final>) → B on done.state.C, plus an existing go reaction.
  const doc = (): SCXMLDocument =>
    ({
      scxml: {
        state: [
          {
            '@_id': 'C',
            final: { '@_id': 'CDone' },
            transition: [
              { '@_event': 'go', '@_type': 'internal' },
              { '@_event': 'done.state.C', '@_target': 'B' },
            ],
          },
          { '@_id': 'B' },
        ],
      } as any,
    });

  it('blocks a reaction on a done.state event the state already has an edge for', () => {
    // The reaction would be inserted before C → B and silently shadow it.
    const result = checkReactionsDoneStateConflict(doc(), 'C', [
      { event: 'go', type: 'internal' },
      { event: 'done.state.C', type: 'internal' },
    ]);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/already has a done\.state\.C transition \(to 'B'\)/);
  });

  it('also catches the done event inside a merged reaction event list', () => {
    expect(
      checkReactionsDoneStateConflict(doc(), 'C', [{ event: 'go, done.state.C', type: 'external' }]).blocked
    ).toBe(true);
  });

  it('blocks two reactions that share a done.state event', () => {
    const noEdge = (): SCXMLDocument =>
      ({ scxml: { state: [{ '@_id': 'C', final: { '@_id': 'CDone' } }] } as any });
    expect(
      checkReactionsDoneStateConflict(noEdge(), 'C', [
        { event: 'done.state.C', type: 'internal' },
        { event: 'done.state.C, go', type: 'internal' },
      ]).blocked
    ).toBe(true);
  });

  it('allows ordinary reactions, and excludes the reactions being replaced', () => {
    expect(checkReactionsDoneStateConflict(doc(), 'C', [{ event: 'go', type: 'internal' }])).toEqual({
      blocked: false,
    });
    // An existing done.state.C reaction (no edge) can be kept/edited: the old
    // reactions are replaced wholesale, so it isn't compared against itself.
    const withReaction = (): SCXMLDocument =>
      ({
        scxml: {
          state: [
            {
              '@_id': 'C',
              final: { '@_id': 'CDone' },
              transition: { '@_event': 'done.state.C', '@_type': 'internal' },
            },
          ],
        } as any,
      });
    expect(
      checkReactionsDoneStateConflict(withReaction(), 'C', [{ event: 'done.state.C', type: 'internal' }])
    ).toEqual({ blocked: false });
  });
});

describe('getDoneStateEvents', () => {
  it('splits on commas only, keeping a space-containing state id whole (project rule 6.7)', () => {
    expect(getDoneStateEvents({ '@_event': 'done.state.Motor left' })).toEqual(['done.state.Motor left']);
    expect(getDoneStateEvents({ '@_event': 'go, done.state.Motor left ,done.state.B' })).toEqual([
      'done.state.Motor left',
      'done.state.B',
    ]);
  });

  it('does not treat done.state.Motor left and done.state.Motor right as the same event', () => {
    const doc = {
      scxml: {
        state: [
          {
            '@_id': 'S',
            transition: [
              { '@_event': 'done.state.Motor left', '@_target': 'A' },
              { '@_target': 'B' },
            ],
          },
          { '@_id': 'A' },
          { '@_id': 'B' },
        ],
      } as any,
    } as SCXMLDocument;
    expect(
      checkTransitionEditSlotConflict(doc, 'S', 1, { '@_event': 'done.state.Motor right', '@_target': 'B' })
    ).toEqual({ blocked: false });
  });
});
