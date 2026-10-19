import { describe, it, expect } from 'vitest';
import { UpdateActionsCommand } from './update-actions-command';
import { ConditionEvaluator } from '@/lib/scxml/condition-evaluator';

const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

const BOOL_SCXML =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript">' +
  '<datamodel><data id="this_a" expr="false"/><data id="this_b" expr="false"/><data id="this_c" expr="false"/></datamodel>' +
  '<state id="S"/></scxml>';

/** Returns the expr attribute of each <assign> under the given onentry/onexit tag, as the generator reads it. */
function assignExprs(xml: string, tag: 'onentry' | 'onexit'): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName(tag)).flatMap((el) =>
    Array.from(el.getElementsByTagName('assign')).map((a) => a.getAttribute('expr') ?? '')
  );
}

describe('UpdateActionsCommand assign expressions containing "|"', () => {
  // Regression: actions are encoded as `assign|location|expr`, and the expr was read as
  // split('|')[2], truncating `this_b || this_c` to `this_b `.
  it.each([
    ['this_b || this_c'],
    ['this_b||this_c'],
    ['this_b || this_c || this_a'],
    ['(this_b || this_c) && !this_a'],
    ['this_b && (this_c || this_a)'],
    ['this_b > 5 || this_c <= 2'],
  ])('writes %j verbatim to onentry and onexit <assign expr>', (expr) => {
    const result = new UpdateActionsCommand('S', [`assign|this_a|${expr}`], [`assign|this_a|${expr}`]).execute(BOOL_SCXML);
    expect(result.success).toBe(true);
    expect(assignExprs(result.newContent, 'onentry')).toEqual([expr]);
    expect(assignExprs(result.newContent, 'onexit')).toEqual([expr]);
  });

  it('preserves existing && / comparison / arithmetic exprs unchanged', () => {
    const exprs = ['this_b && this_c', 'this_b == this_c', 'this_b != 0', 'this_b + 1', '!this_b'];
    const result = new UpdateActionsCommand('S', exprs.map((e) => `assign|this_a|${e}`), []).execute(BOOL_SCXML);
    expect(assignExprs(result.newContent, 'onentry')).toEqual(exprs);
  });

  it('round-trips an OR expr through undo (old actions re-extracted and re-encoded)', () => {
    const first = new UpdateActionsCommand('S', ['assign|this_a|this_b || this_c'], []).execute(BOOL_SCXML);
    const second = new UpdateActionsCommand('S', ['assign|this_a|1'], []);
    const changed = second.execute(first.newContent);
    const undone = second.undo(changed.newContent);
    expect(undone.success).toBe(true);
    expect(assignExprs(undone.newContent, 'onentry')).toEqual(['this_b || this_c']);
  });

  // The written expr must evaluate as logical OR under ECMAScript semantics (datamodel="ecmascript").
  // Before the fix the emitted `this_b ` evaluated to this_b alone, failing the (false, true) rows.
  it.each([
    [false, false, false, false],
    [false, true, false, true],
    [true, false, false, true],
    [true, true, false, true],
    [false, false, true, false], // (b || c) && !a
    [true, true, true, false],
  ])('emitted expr evaluates correctly for b=%s c=%s a=%s', (b, c, a, expected) => {
    const expr = a ? '(this_b || this_c) && !this_a' : 'this_b || this_c';
    const result = new UpdateActionsCommand('S', [`assign|this_a|${expr}`], []).execute(BOOL_SCXML);
    const [emitted] = assignExprs(result.newContent, 'onentry');
    expect(ConditionEvaluator.evaluateCondition(emitted, { this_a: a, this_b: b, this_c: c })).toBe(expected);
  });

  it.each([['this_b ||'], ['|| this_b'], ['this_b ||| this_c']])(
    'keeps malformed expr %j verbatim (not silently "repaired"), so it is still non-evaluable',
    (expr) => {
      const result = new UpdateActionsCommand('S', [`assign|this_a|${expr}`], []).execute(BOOL_SCXML);
      const [emitted] = assignExprs(result.newContent, 'onentry');
      expect(emitted).toBe(expr);
      expect(ConditionEvaluator.evaluateCondition(emitted, { this_a: false, this_b: false, this_c: false })).toBeNull();
    }
  );
});

describe('UpdateActionsCommand waypoint invalidation', () => {
  // Entry/exit action count changes the node's rendered height (see
  // NodeDimensionCalculator), so stale persisted viz:waypoints on
  // transitions touching it must be cleared, or the edge renders against
  // the pre-update size.
  it('clears viz:waypoints on the updated state\'s own outgoing transition', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
    const result = new UpdateActionsCommand('A', ['assign|x|1', 'assign|y|2'], []).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:waypoints');
  });

  it('clears viz:waypoints on a sibling\'s transition targeting the updated state', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
    const result = new UpdateActionsCommand('B', ['assign|x|1'], []).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:waypoints');
  });

  it('leaves unrelated transitions\' waypoints untouched', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1"/></state><state id="B"><transition target="C" viz:waypoints="2,2"/></state><state id="C"/></scxml>`;
    const result = new UpdateActionsCommand('A', ['assign|x|1'], []).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('viz:waypoints="2,2"');
  });
});
