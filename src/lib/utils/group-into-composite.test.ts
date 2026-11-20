import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import type { SCXMLDocument } from '@/types/scxml';
import { findElementById } from './scxml-manipulation-utils';
import { groupStatesIntoComposite } from './group-into-composite';
import { normalizeParallelGroups } from './parallel-group-normalization';

const HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

function parse(xml: string): SCXMLDocument {
  const parsed = new SCXMLParser().parse(xml);
  if (!parsed.success || !parsed.data) throw new Error('parse failed');
  return parsed.data as SCXMLDocument;
}

function asList<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function childIds(container: any, tag = 'state'): string[] {
  return asList<any>(container?.[tag]).map((s) => s['@_id']);
}

function transitionsOf(doc: SCXMLDocument, id: string): any[] {
  return asList<any>(findElementById(doc, id)?.element.transition);
}

describe('groupStatesIntoComposite', () => {
  it('wraps the selected states in a new state, in the place of the first one', () => {
    const doc = parse(
      `${HEADER} initial="A"><state id="A"/><state id="B"/><state id="C"/><state id="D"/></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['C', 'B']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.compositeId).toBe('state_1');
    expect(childIds(doc.scxml)).toEqual(['A', 'state_1', 'D']);
    const composite = findElementById(doc, 'state_1')!.element;
    expect(childIds(composite)).toEqual(['B', 'C']);
    expect(composite['@_initial']).toBe('B');
    expect(doc.scxml['@_initial']).toBe('A');
  });

  it('mints an id not already taken, including by extra (note) nodes', () => {
    const doc = parse(`${HEADER}><state id="state_1"/><state id="X"/></scxml>`);
    const result = groupStatesIntoComposite(doc, ['X'], { extraNodes: [{ id: 'state_2' }] });
    expect(result.ok && result.compositeId).toBe('state_3');
  });

  it('makes the new state Initial in place of a selected Initial state, and keeps that child Initial inside', () => {
    const doc = parse(
      `${HEADER}><state id="P" initial="B"><state id="A"/><state id="B"/><state id="C"/></state></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['A', 'B']);
    if (!result.ok) throw new Error(result.error);
    const parent = findElementById(doc, 'P')!.element;
    expect(parent['@_initial']).toBe(result.compositeId);
    expect(findElementById(doc, result.compositeId)!.element['@_initial']).toBe('B');
  });

  it('keeps transitions between the grouped states', () => {
    const doc = parse(
      `${HEADER}><state id="A"><transition event="go" target="B"/></state><state id="B"/></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['A', 'B']);
    if (!result.ok) throw new Error(result.error);
    expect(result.removedTransitions).toEqual([]);
    expect(transitionsOf(doc, 'A')).toEqual([expect.objectContaining({ '@_target': 'B' })]);
  });

  it('re-points a sibling transition into the new Initial child at the new state', () => {
    const doc = parse(
      `${HEADER} initial="A"><state id="A"><transition event="go" target="B" viz:waypoints="1,1"/></state>` +
        `<state id="B"/><state id="C"/></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['B', 'C']);
    if (!result.ok) throw new Error(result.error);
    expect(result.retargetedCount).toBe(1);
    expect(result.removedTransitions).toEqual([]);
    const [t] = transitionsOf(doc, 'A');
    expect(t['@_target']).toBe(result.compositeId);
    expect(t['@_event']).toBe('go');
    expect(t['@_viz:waypoints']).toBeUndefined();
  });

  it('removes and reports the other transitions that would cross the new boundary', () => {
    const doc = parse(
      `${HEADER} initial="A"><state id="A"><transition event="toC" target="C"/></state>` +
        `<state id="B"/><state id="C"><transition event="out" target="A"/></state></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['B', 'C']);
    if (!result.ok) throw new Error(result.error);
    expect(result.retargetedCount).toBe(0);
    expect(result.removedTransitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'A', targetId: 'C', event: 'toC' }),
        expect.objectContaining({ sourceId: 'C', targetId: 'A', event: 'out' }),
      ])
    );
    expect(transitionsOf(doc, 'A')).toEqual([]);
    expect(transitionsOf(doc, 'C')).toEqual([]);
  });

  it('keeps a <parallel> a <parallel> and never makes a <final> the new state\'s Initial', () => {
    const doc = parse(
      `${HEADER}><state id="R"><state id="X"><parallel id="Par"><state id="r1"/><state id="r2"/></parallel>` +
        `<final id="F"/></state></state></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['F', 'Par']);
    if (!result.ok) throw new Error(result.error);
    const composite = findElementById(doc, result.compositeId)!.element as any;
    expect(childIds(composite, 'parallel')).toEqual(['Par']);
    expect(childIds(composite, 'final')).toEqual(['F']);
    expect(composite['@_initial']).toBe('Par');
  });

  it('refuses states at different levels', () => {
    const doc = parse(`${HEADER}><state id="A"><state id="A1"/></state><state id="B"/></scxml>`);
    const before = JSON.stringify(doc);
    const result = groupStatesIntoComposite(doc, ['A1', 'B']);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('refuses states in different regions of a parallel', () => {
    const doc = parse(
      `${HEADER}><parallel id="P"><state id="r1" initial="a"><state id="a"/></state>` +
        `<state id="r2" initial="b"><state id="b"/></state></parallel></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['a', 'b']);
    expect(result.ok).toBe(false);
  });

  it('refuses a region of a parallel itself', () => {
    const doc = parse(`${HEADER}><parallel id="P"><state id="r1"/><state id="r2"/></parallel></scxml>`);
    const result = groupStatesIntoComposite(doc, ['r1']);
    expect(result.ok).toBe(false);
  });

  it('groups states inside one region, the new state taking over as the region\'s Initial', () => {
    const doc = parse(
      `${HEADER}><parallel id="P"><state id="r1" initial="a"><state id="a"><transition target="b"/></state>` +
        `<state id="b"/></state><state id="r2" initial="c"><state id="c"/></state></parallel></scxml>`
    );
    const result = groupStatesIntoComposite(doc, ['a', 'b']);
    if (!result.ok) throw new Error(result.error);
    const region = findElementById(doc, 'r1')!.element;
    expect(childIds(region)).toEqual([result.compositeId]);
    expect(region['@_initial']).toBe(result.compositeId);
    // Normalization leaves the parallel intact.
    normalizeParallelGroups(doc);
    expect(findElementById(doc, 'P')!.tag).toBe('parallel');
    expect(findElementById(doc, result.compositeId)!.tag).toBe('state');
  });
});
