import { describe, it, expect } from 'vitest';
import type { TransitionElement, StateElement } from '@/types/scxml';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import {
  combineConditions,
  isSameTransitionFamily,
  actionsAreEqual,
  findMergeGroups,
  mergeTransitionGroup,
  mergeDuplicateTransitionsInDocument,
  condsAreEqual,
  combineEvents,
  isSameTransitionFamilyByEvent,
  findMergeGroupsByEvent,
  mergeTransitionGroupByEvent,
  mergeDuplicateTransitionsByEventInDocument,
} from './transition-merge-utils';

describe('combineConditions', () => {
  it('joins two present conditions with OR, each wrapped in parentheses', () => {
    expect(combineConditions(['x>1', 'x<0'])).toBe('(x>1) || (x<0)');
  });

  it('joins three or more present conditions with OR', () => {
    expect(combineConditions(['a', 'b', 'c'])).toBe('(a) || (b) || (c)');
  });

  it('returns the single condition unwrapped-parens-still-applied when only one is given', () => {
    expect(combineConditions(['x>1'])).toBe('(x>1)');
  });

  it('drops the condition entirely if any transition in the group is unconditional', () => {
    expect(combineConditions(['x>1', undefined])).toBeUndefined();
  });

  it('treats a whitespace-only condition as unconditional', () => {
    expect(combineConditions(['x>1', '   '])).toBeUndefined();
  });

  it('trims whitespace around each condition before joining', () => {
    expect(combineConditions([' x>1 ', ' x<0 '])).toBe('(x>1) || (x<0)');
  });
});

describe('condsAreEqual', () => {
  it('treats two absent conds as equal', () => {
    expect(condsAreEqual(undefined, undefined)).toBe(true);
  });

  it('treats an absent cond and a whitespace-only cond as equal', () => {
    expect(condsAreEqual(undefined, '   ')).toBe(true);
  });

  it('treats two whitespace-only conds as equal', () => {
    expect(condsAreEqual('  ', '\t')).toBe(true);
  });

  it('treats equal trimmed strings as equal', () => {
    expect(condsAreEqual(' x>1 ', 'x>1')).toBe(true);
  });

  it('treats differing conds as not equal', () => {
    expect(condsAreEqual('x>1', 'x<0')).toBe(false);
  });

  it('treats a present cond and an absent cond as not equal', () => {
    expect(condsAreEqual('x>1', undefined)).toBe(false);
  });
});

describe('combineEvents', () => {
  it('joins two distinct events with a comma and single space', () => {
    expect(combineEvents(['e1', 'e2'])).toBe('e1, e2');
  });

  it('dedupes a token repeated verbatim across two inputs', () => {
    expect(combineEvents(['e1', 'e1'])).toBe('e1');
  });

  it('dedupes when one input is already comma-joined and shares a token with another', () => {
    expect(combineEvents(['a, b', 'c'])).toBe('a, b, c');
  });

  it('dedupes when one input is already comma-joined and repeats a token from another', () => {
    expect(combineEvents(['a, b', 'b'])).toBe('a, b');
  });

  it('flattens legacy space-separated input', () => {
    expect(combineEvents(['a b', 'c'])).toBe('a, b, c');
  });

  it('returns undefined when every input is undefined or empty', () => {
    expect(combineEvents([undefined, undefined])).toBeUndefined();
  });

  it('trims whitespace around tokens', () => {
    expect(combineEvents([' e1 ', ' e2 '])).toBe('e1, e2');
  });
});

describe('isSameTransitionFamily', () => {
  const base = (overrides: Partial<TransitionElement> = {}): TransitionElement => ({
    '@_target': 'B',
    ...overrides,
  });

  it('matches transitions with the same target, ignoring differing events', () => {
    expect(
      isSameTransitionFamily(base({ '@_event': 'click' }), base({ '@_event': 'hover' }))
    ).toBe(true);
  });

  it('matches two eventless transitions to the same target', () => {
    expect(isSameTransitionFamily(base(), base())).toBe(true);
  });

  it('does not match transitions with different targets', () => {
    expect(isSameTransitionFamily(base({ '@_target': 'B' }), base({ '@_target': 'C' }))).toBe(
      false
    );
  });

  it('does not match when one is internal and the other external/absent', () => {
    expect(isSameTransitionFamily(base({ '@_type': 'internal' }), base())).toBe(false);
  });

  it('treats explicit type="external" as equal to an absent type attribute', () => {
    expect(isSameTransitionFamily(base({ '@_type': 'external' }), base())).toBe(true);
  });

  it('does not match an eventless transition with an event-bearing transition to the same target', () => {
    expect(isSameTransitionFamily(base(), base({ '@_event': 'e1' }))).toBe(false);
  });

  it('does not match an eventless transition with a cond-bearing transition to the same target', () => {
    expect(isSameTransitionFamily(base(), base({ '@_cond': 'x>1' }))).toBe(false);
  });
});

describe('isSameTransitionFamilyByEvent', () => {
  const base = (overrides: Partial<TransitionElement> = {}): TransitionElement => ({
    '@_target': 'B',
    ...overrides,
  });

  it('matches transitions with the same target and identical cond, ignoring differing events', () => {
    expect(
      isSameTransitionFamilyByEvent(
        base({ '@_event': 'e1', '@_cond': 'x>1' }),
        base({ '@_event': 'e2', '@_cond': 'x>1' })
      )
    ).toBe(true);
  });

  it('matches two eventless, condless transitions to the same target', () => {
    expect(isSameTransitionFamilyByEvent(base(), base())).toBe(true);
  });

  it('does not match when conds differ, even with the same target', () => {
    expect(
      isSameTransitionFamilyByEvent(base({ '@_cond': 'x>1' }), base({ '@_cond': 'x<0' }))
    ).toBe(false);
  });

  it('does not match when one has a cond and the other is absent', () => {
    expect(isSameTransitionFamilyByEvent(base({ '@_cond': 'x>1' }), base())).toBe(false);
  });

  it('matches when one cond is whitespace-only and the other is absent', () => {
    expect(isSameTransitionFamilyByEvent(base({ '@_cond': '   ' }), base())).toBe(true);
  });

  it('does not match transitions with different targets', () => {
    expect(
      isSameTransitionFamilyByEvent(base({ '@_target': 'B' }), base({ '@_target': 'C' }))
    ).toBe(false);
  });

  it('does not match an eventless transition with an event-bearing transition sharing the same (absent) cond', () => {
    // Both have no cond (condsAreEqual holds), but only isSameTransitionFamilyByEvent's
    // eventless-parity check (inherited from isSameTransitionFamily) should block this pairing —
    // otherwise a bare transition would be silently folded into an event-only one on merge.
    expect(isSameTransitionFamilyByEvent(base(), base({ '@_event': 'e1' }))).toBe(false);
  });
});

describe('actionsAreEqual', () => {
  // Real parsed transitions carry action child elements (assign/log/send/...) as direct,
  // non-'@_'-prefixed keys on the transition object itself (confirmed via fast-xml-parser
  // output) — not under a `.executable` field, which the SCXML parser never populates for
  // transitions. actionsAreEqual must compare the transitions' actual child-element content.
  it('treats two transitions with no action children as equal', () => {
    const a: TransitionElement = { '@_target': 'B' };
    const b: TransitionElement = { '@_target': 'B', '@_event': 'e2' };
    expect(actionsAreEqual(a, b)).toBe(true);
  });

  it('treats identical assign children as equal regardless of attribute key order', () => {
    const a: TransitionElement = { '@_target': 'B', assign: { '@_location': 'x', '@_expr': '1' } } as any;
    const b: TransitionElement = { '@_target': 'B', assign: { '@_expr': '1', '@_location': 'x' } } as any;
    expect(actionsAreEqual(a, b)).toBe(true);
  });

  it('treats differing assign children as not equal', () => {
    const a: TransitionElement = { '@_target': 'B', assign: { '@_location': 'x', '@_expr': '1' } } as any;
    const b: TransitionElement = { '@_target': 'B', assign: { '@_location': 'x', '@_expr': '2' } } as any;
    expect(actionsAreEqual(a, b)).toBe(false);
  });

  it('treats a transition with an assign child vs. one without as not equal', () => {
    const a: TransitionElement = { '@_target': 'B', assign: { '@_location': 'x', '@_expr': '1' } } as any;
    const b: TransitionElement = { '@_target': 'B' };
    expect(actionsAreEqual(a, b)).toBe(false);
  });

  it('ignores any other attribute (e.g. viz:sourceHandle/targetHandle from auto-layout) when comparing actions', () => {
    const a: TransitionElement = {
      '@_target': 'B',
      '@_event': 'e1',
      '@_viz:sourceHandle': 'bottom',
      '@_viz:targetHandle': 'top',
    } as any;
    const b: TransitionElement = { '@_target': 'B', '@_event': 'event1' };
    expect(actionsAreEqual(a, b)).toBe(true);
  });
});

describe('findMergeGroups', () => {
  it('groups two same-target, same-actions transitions and excludes a third that has different actions', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'click', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_event': 'hover', '@_cond': 'x<0' };
    const t3: TransitionElement = {
      '@_target': 'B',
      '@_event': 'press',
      '@_cond': 'x==5',
      assign: { '@_location': 'y', '@_expr': '1' },
    } as any;
    const groups = findMergeGroups([t1, t2, t3]);
    expect(groups).toEqual([[t1, t2]]);
  });

  it('omits singleton clusters (no other transition targets the same state)', () => {
    const t1: TransitionElement = { '@_target': 'B' };
    const t2: TransitionElement = { '@_target': 'C' };
    expect(findMergeGroups([t1, t2])).toEqual([]);
  });

  it('returns no groups for an empty array', () => {
    expect(findMergeGroups([])).toEqual([]);
  });
});

describe('findMergeGroupsByEvent', () => {
  it('groups two same-target, same-cond, same-actions transitions differing only by event', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'e1', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_event': 'e2', '@_cond': 'x>1' };
    expect(findMergeGroupsByEvent([t1, t2])).toEqual([[t1, t2]]);
  });

  it('excludes a same-target, same-actions transition that has a different cond', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'e1', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_event': 'e2', '@_cond': 'x>1' };
    const t3: TransitionElement = { '@_target': 'B', '@_event': 'e3', '@_cond': 'x<0' };
    expect(findMergeGroupsByEvent([t1, t2, t3])).toEqual([[t1, t2]]);
  });

  it('excludes a transition with different executable actions', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'e1', '@_cond': 'x>1' };
    const t2: TransitionElement = {
      '@_target': 'B',
      '@_event': 'e2',
      '@_cond': 'x>1',
      assign: { '@_location': 'y', '@_expr': '1' },
    } as any;
    expect(findMergeGroupsByEvent([t1, t2])).toEqual([]);
  });

  it('omits singleton clusters', () => {
    const t1: TransitionElement = { '@_target': 'B' };
    const t2: TransitionElement = { '@_target': 'C' };
    expect(findMergeGroupsByEvent([t1, t2])).toEqual([]);
  });

  it('returns no groups for an empty array', () => {
    expect(findMergeGroupsByEvent([])).toEqual([]);
  });
});

describe('mergeTransitionGroup', () => {
  it('keeps the first transition\'s event/type/target and OR-combines the conditions', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'click', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_event': 'hover', '@_cond': 'x<0' };
    const merged = mergeTransitionGroup([t1, t2]);
    expect(merged).toEqual({
      '@_target': 'B',
      '@_event': 'click',
      '@_cond': '(x>1) || (x<0)',
    });
  });

  it('drops @_cond entirely when any transition in the group is unconditional', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'click', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_event': 'hover' };
    const merged = mergeTransitionGroup([t1, t2]);
    expect(merged['@_cond']).toBeUndefined();
    expect(merged['@_event']).toBe('click');
  });
});

describe('mergeTransitionGroupByEvent', () => {
  it('keeps the first transition\'s cond/type/target and comma-combines the events', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_event': 'e1', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_event': 'e2', '@_cond': 'x>1' };
    const merged = mergeTransitionGroupByEvent([t1, t2]);
    expect(merged).toEqual({
      '@_target': 'B',
      '@_event': 'e1, e2',
      '@_cond': 'x>1',
    });
  });

  it('drops @_event entirely when the whole group is eventless', () => {
    const t1: TransitionElement = { '@_target': 'B', '@_cond': 'x>1' };
    const t2: TransitionElement = { '@_target': 'B', '@_cond': 'x>1' };
    const merged = mergeTransitionGroupByEvent([t1, t2]);
    expect(merged['@_event']).toBeUndefined();
  });
});

describe('mergeDuplicateTransitionsInDocument', () => {
  function parseState(xml: string, id: string): StateElement {
    const parser = new SCXMLParser();
    const result = parser.parse(xml);
    expect(result.success).toBe(true);
    const states = result.data!.scxml.state;
    const arr = Array.isArray(states) ? states : [states!];
    const found = arr.find((s) => s['@_id'] === id);
    expect(found).toBeDefined();
    return found!;
  }

  it('merges two same-target transitions with different conditions into one with an OR-combined cond', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B" cond="x&lt;0"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(false);
    const t = a.transition as TransitionElement;
    expect(t['@_target']).toBe('B');
    expect(t['@_cond']).toBe('(x>1) || (x<0)');
  });

  it('drops the cond entirely when one of the merged pair is unconditional', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsInDocument(xml);
    const a = parseState(result, 'A');
    const t = a.transition as TransitionElement;
    expect(t['@_cond']).toBeUndefined();
  });

  it('leaves transitions with differing executable actions unmerged', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"><assign location="y" expr="1"/></transition>
        <transition event="e2" target="B" cond="x&lt;0"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(true);
    expect((a.transition as TransitionElement[]).length).toBe(2);
  });

  it('returns the exact same string when there are no duplicate transitions', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
      </state>
      <state id="B"/>
    </scxml>`;

    expect(mergeDuplicateTransitionsInDocument(xml)).toBe(xml);
  });

  it('preserves a later, unrelated transition\'s own attributes when an earlier pair merges (index-shift safety)', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B" cond="x&lt;0"/>
        <transition event="e3" target="C" cond="z==1"/>
      </state>
      <state id="B"/>
      <state id="C"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsInDocument(xml);
    const a = parseState(result, 'A');
    const transitions = Array.isArray(a.transition) ? a.transition : [a.transition as TransitionElement];
    expect(transitions.length).toBe(2);
    const toC = transitions.find((t) => t['@_target'] === 'C');
    expect(toC?.['@_cond']).toBe('z==1');
    expect(toC?.['@_event']).toBe('e3');
  });

  it('never folds a bare/eventless transition into an event-bearing transition to the same target', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition target="B"/>
        <transition event="e1" target="B"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(true);
    const transitions = a.transition as TransitionElement[];
    expect(transitions.length).toBe(2);
    expect(transitions.some((t) => !t['@_event'] && !t['@_cond'])).toBe(true);
    expect(transitions.some((t) => t['@_event'] === 'e1')).toBe(true);
  });
});

describe('mergeDuplicateTransitionsByEventInDocument', () => {
  function parseState(xml: string, id: string): StateElement {
    const parser = new SCXMLParser();
    const result = parser.parse(xml);
    expect(result.success).toBe(true);
    const states = result.data!.scxml.state;
    const arr = Array.isArray(states) ? states : [states!];
    const found = arr.find((s) => s['@_id'] === id);
    expect(found).toBeDefined();
    return found!;
  }

  it('merges two same-target, same-cond transitions differing by event into one with a combined event list', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B" cond="x&gt;1"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsByEventInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(false);
    const t = a.transition as TransitionElement;
    expect(t['@_target']).toBe('B');
    expect(t['@_event']).toBe('e1, e2');
    expect(t['@_cond']).toBe('x>1');
  });

  it('does not merge when conds differ, even with identical target and actions', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B" cond="x&lt;0"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsByEventInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(true);
    expect((a.transition as TransitionElement[]).length).toBe(2);
  });

  it('refuses to merge when executable actions differ', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"><assign location="y" expr="1"/></transition>
        <transition event="e2" target="B" cond="x&gt;1"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsByEventInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(true);
    expect((a.transition as TransitionElement[]).length).toBe(2);
  });

  it('returns the exact same string when there are no duplicate transitions', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
      </state>
      <state id="B"/>
    </scxml>`;

    expect(mergeDuplicateTransitionsByEventInDocument(xml)).toBe(xml);
  });

  it('preserves a later, unrelated transition\'s own attributes when an earlier pair merges (index-shift safety)', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B" cond="x&gt;1"/>
        <transition event="e3" target="C" cond="z==1"/>
      </state>
      <state id="B"/>
      <state id="C"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsByEventInDocument(xml);
    const a = parseState(result, 'A');
    const transitions = Array.isArray(a.transition) ? a.transition : [a.transition as TransitionElement];
    expect(transitions.length).toBe(2);
    const toC = transitions.find((t) => t['@_target'] === 'C');
    expect(toC?.['@_cond']).toBe('z==1');
    expect(toC?.['@_event']).toBe('e3');
  });

  it('dedupes a repeated event token through a full parse/serialize round trip', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="a, b" target="B" cond="x&gt;1"/>
        <transition event="b" target="B" cond="x&gt;1"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsByEventInDocument(xml);
    const a = parseState(result, 'A');
    const t = a.transition as TransitionElement;
    expect(t['@_event']).toBe('a, b');
  });

  it('never folds a bare/eventless transition into an event-bearing transition sharing the same (absent) cond', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition target="B"/>
        <transition event="e1" target="B"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const result = mergeDuplicateTransitionsByEventInDocument(xml);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(true);
    const transitions = a.transition as TransitionElement[];
    expect(transitions.length).toBe(2);
    expect(transitions.some((t) => !t['@_event'] && !t['@_cond'])).toBe(true);
    expect(transitions.some((t) => t['@_event'] === 'e1')).toBe(true);
  });
});

describe('event-merge and cond-merge pipeline ordering', () => {
  function parseState(xml: string, id: string): StateElement {
    const parser = new SCXMLParser();
    const result = parser.parse(xml);
    expect(result.success).toBe(true);
    const states = result.data!.scxml.state;
    const arr = Array.isArray(states) ? states : [states!];
    const found = arr.find((s) => s['@_id'] === id);
    expect(found).toBeDefined();
    return found!;
  }

  it('running event-merge before cond-merge preserves both merged events and the OR-combined cond', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
      <state id="A">
        <transition event="e1" target="B" cond="x&gt;1"/>
        <transition event="e2" target="B" cond="x&gt;1"/>
        <transition event="e3" target="B" cond="x&lt;0"/>
      </state>
      <state id="B"/>
    </scxml>`;

    const afterEventMerge = mergeDuplicateTransitionsByEventInDocument(xml);
    const result = mergeDuplicateTransitionsInDocument(afterEventMerge);
    const a = parseState(result, 'A');
    expect(Array.isArray(a.transition)).toBe(false);
    const t = a.transition as TransitionElement;
    expect(t['@_target']).toBe('B');
    expect(t['@_event']).toBe('e1, e2');
    expect(t['@_cond']).toBe('(x>1) || (x<0)');
  });
});
