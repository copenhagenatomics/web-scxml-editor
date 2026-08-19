import { describe, it, expect } from 'vitest';
import type { TransitionElement, SCXMLDocument } from '@/types/scxml';
import {
  classifyTransitionSlot,
  findTransitionSlotConflict,
  checkNewConnectionSlotConflict,
  checkTransitionEditSlotConflict,
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
});

describe('checkNewConnectionSlotConflict', () => {
  // A freshly-drawn diagram connection is now constructed as a bare/eventless candidate
  // (see onConnect in visual-diagram.tsx), so it only ever conflicts with an existing
  // eventless transition to the same target — event- and cond-slot transitions coexist.
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
