import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import type { SCXMLDocument } from '@/types/scxml';
import {
  addStateToDocument,
  detachStateFromParent,
  findStateById,
} from './scxml-manipulation-utils';
import {
  buildStateParentMap,
  describeRemovedTransitions,
  fixTransitionsAfterReparent,
} from './reparent-transition-fix';
import { SCXMLValidator } from '@/lib/validators/scxml-validator';

const HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

/**
 * Mirrors visual-diagram.tsx's handleReparent: capture the hierarchy, move each state
 * under the target parent (adopting the first one as initial if the parent had no
 * initial), then remove the transitions the move broke.
 */
function reparent(xml: string, stateIds: string[], targetParentId: string, { fix = true } = {}) {
  const parser = new SCXMLParser();
  const parsed = parser.parse(xml);
  if (!parsed.success || !parsed.data) throw new Error('parse failed');
  const doc = parsed.data as SCXMLDocument;

  const parentsBefore = buildStateParentMap(doc);
  const movedIds: string[] = [];
  for (const id of stateIds) {
    const detached = detachStateFromParent(doc, id);
    if (!detached) continue;
    addStateToDocument(doc, detached, targetParentId);
    movedIds.push(id);
    const parent = findStateById(doc, targetParentId);
    if (parent && !parent['@_initial'] && parent.state) {
      const children = Array.isArray(parent.state) ? parent.state : [parent.state];
      if (children.length === 1) parent['@_initial'] = children[0]['@_id'];
    }
  }

  const removed = fix ? fixTransitionsAfterReparent(doc, movedIds, parentsBefore) : [];
  return { content: parser.serialize(doc, true), removed, doc };
}

function transitionsOf(doc: SCXMLDocument, id: string) {
  const s = findStateById(doc, id);
  if (!s?.transition) return [];
  return Array.isArray(s.transition) ? s.transition : [s.transition];
}

function crossHierarchyErrors(content: string) {
  const parsed = new SCXMLParser().parse(content);
  if (!parsed.success || !parsed.data) throw new Error('parse failed');
  return new SCXMLValidator()
    .validate(parsed.data.scxml, content)
    .filter((e) => e.message.startsWith('Cross-hierarchy transition'));
}

describe('fixTransitionsAfterReparent (#81)', () => {
  it('the exact repro: moving A into P removes both transitions to/from A, leaving no cross-hierarchy errors', () => {
    const xml = `${HEADER} initial="Idle">
      <state id="Idle"><transition event="go" target="A"/></state>
      <state id="A"><transition event="next" target="B"/></state>
      <state id="B"><transition event="back" target="Idle"/></state>
      <state id="P"/>
    </scxml>`;

    // Before the move the machine is clean; moving without the fix is what #81 reports.
    expect(crossHierarchyErrors(xml)).toHaveLength(0);
    expect(crossHierarchyErrors(reparent(xml, ['A'], 'P', { fix: false }).content)).toHaveLength(2);

    const { content, removed, doc } = reparent(xml, ['A'], 'P');

    expect(crossHierarchyErrors(content)).toHaveLength(0);
    expect(transitionsOf(doc, 'Idle')).toEqual([]);
    expect(transitionsOf(doc, 'A')).toEqual([]);
    // B → Idle never involved a moved state.
    expect(transitionsOf(doc, 'B')).toEqual([{ '@_event': 'back', '@_target': 'Idle' }]);
    expect(removed).toEqual([
      { sourceId: 'Idle', targetId: 'A', event: 'go', cond: undefined },
      { sourceId: 'A', targetId: 'B', event: 'next', cond: undefined },
    ]);
  });

  it('keeps transitions between states moved together, and removes the ones to/from outside', () => {
    const xml = `${HEADER} initial="Idle">
      <state id="Idle"><transition event="go" target="B"/></state>
      <state id="A"><transition event="next" target="B"/></state>
      <state id="B"><transition event="done" target="Idle"/></state>
      <state id="P"/>
    </scxml>`;
    const { content, doc, removed } = reparent(xml, ['A', 'B'], 'P');

    expect(crossHierarchyErrors(content)).toHaveLength(0);
    expect(transitionsOf(doc, 'A')).toEqual([{ '@_event': 'next', '@_target': 'B' }]);
    expect(transitionsOf(doc, 'Idle')).toEqual([]);
    expect(transitionsOf(doc, 'B')).toEqual([]);
    expect(removed).toHaveLength(2);
  });

  it("keeps the source's other transitions when only some are removed", () => {
    const xml = `${HEADER} initial="Idle">
      <state id="Idle"><transition event="go" target="A"/><transition event="stay" target="B"/></state>
      <state id="A"/>
      <state id="B"/>
      <state id="P"/>
    </scxml>`;
    const { doc } = reparent(xml, ['A'], 'P');
    expect(transitionsOf(doc, 'Idle')).toEqual([{ '@_event': 'stay', '@_target': 'B' }]);
  });

  it('removes transitions between P and the state moved into it, in both directions', () => {
    const xml = `${HEADER} initial="P">
      <state id="P"><transition event="enter" target="A"/></state>
      <state id="A"><transition event="leave" target="P"/></state>
    </scxml>`;
    const { content, doc, removed } = reparent(xml, ['A'], 'P');
    expect(crossHierarchyErrors(content)).toHaveLength(0);
    expect(transitionsOf(doc, 'P')).toEqual([]);
    expect(transitionsOf(doc, 'A')).toEqual([]);
    expect(removed).toHaveLength(2);
  });

  it('leaves transitions that were already cross-level before the move untouched', () => {
    const xml = `${HEADER} initial="Outer">
      <state id="Outer" initial="Inner"><state id="Inner"><transition event="jump" target="A"/></state></state>
      <state id="A"/>
      <state id="P"/>
    </scxml>`;
    const { doc, removed } = reparent(xml, ['A'], 'P');
    expect(transitionsOf(doc, 'Inner')).toEqual([{ '@_event': 'jump', '@_target': 'A' }]);
    expect(removed).toEqual([]);
  });

  it("drops a removed time transition's send/cancel, keeping the state's other actions", () => {
    const xml = `${HEADER} initial="A">
      <state id="A">
        <onentry><assign location="x" expr="1"/><send event="A_t_0_timeEvent_0" delay="2s"/></onentry>
        <onexit><cancel sendid="A_t_0_timeEvent_0"/></onexit>
        <transition event="A_t_0_timeEvent_0" target="B"/>
      </state>
      <state id="B"/>
      <state id="P"/>
    </scxml>`;
    const { content, doc } = reparent(xml, ['A'], 'P');

    expect(transitionsOf(doc, 'A')).toEqual([]);
    expect(content).not.toContain('A_t_0_timeEvent_0');
    expect(content).toContain('<assign location="x" expr="1"');
    expect(content).not.toContain('<onexit');
  });

  it('changes nothing when the moved state has no transitions to outside states', () => {
    const xml = `${HEADER} initial="Idle">
      <state id="Idle"><transition event="go" target="P"/></state>
      <state id="A"/>
      <state id="P"/>
    </scxml>`;
    const { doc, removed } = reparent(xml, ['A'], 'P');
    expect(removed).toEqual([]);
    expect(transitionsOf(doc, 'Idle')).toEqual([{ '@_event': 'go', '@_target': 'P' }]);
  });
});

describe('describeRemovedTransitions', () => {
  it('returns null when nothing was removed', () => {
    expect(describeRemovedTransitions([])).toBeNull();
  });

  it('lists the removed transitions with their event or condition', () => {
    expect(
      describeRemovedTransitions([
        { sourceId: 'Idle', targetId: 'A', event: 'go' },
        { sourceId: 'A', targetId: 'C', cond: 'x > 1' },
      ])
    ).toBe(
      'Removed 2 transitions that would cross hierarchy levels: Idle → A (go), A → C ([x > 1]). Undo to restore.'
    );
  });

  it('uses the singular for one transition', () => {
    expect(describeRemovedTransitions([{ sourceId: 'A', targetId: 'B' }])).toBe(
      'Removed 1 transition that would cross hierarchy levels: A → B. Undo to restore.'
    );
  });

  it('truncates long lists', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ sourceId: 'A', targetId: `S${i}` }));
    expect(describeRemovedTransitions(many)).toContain('A → S3 and 2 more.');
  });
});
