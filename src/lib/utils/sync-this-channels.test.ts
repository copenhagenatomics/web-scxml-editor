import { describe, it, expect } from 'vitest';
import { changedItems, syncThisChannels, thisChannelRefsIn } from './sync-this-channels';
import { extractDatamodelVariables } from './datamodel-extractor';

const doc = (data: string, cond: string, extra = '') =>
  `<scxml xmlns="http://www.w3.org/2005/07/scxml" initial="A">${data}` +
  `<state id="A"><transition cond="${cond}" target="B"/></state><state id="B"/>${extra}</scxml>`;

const dataExpr = (xml: string, id: string) =>
  new DOMParser().parseFromString(xml, 'application/xml').querySelector(`data[id="${id}"]`)?.getAttribute('expr');

/** Syncs the channels a condition references, as applying that condition does. */
const applyCond = (xml: string, cond: string) => syncThisChannels(xml, thisChannelRefsIn([cond]));

describe('thisChannelRefsIn', () => {
  it('collects the this_ channels across conditions and action strings, once each', () => {
    expect(
      thisChannelRefsIn(['this_a == 2 && this_b', 'assign|this_c|this_a + 1', 'assign|plain|conf_x', undefined])
    ).toEqual(['this_a', 'this_b', 'this_c']);
  });
});

describe('changedItems', () => {
  it('returns only the rows an edit added or changed', () => {
    expect(changedItems(['a', 'b', 'c'], ['a', 'B', 'c', 'd'])).toEqual(['B', 'd']);
  });

  it('returns nothing for deletions, reordering or an unchanged list', () => {
    expect(changedItems(['a', 'b', 'c'], ['a', 'c'])).toEqual([]);
    expect(changedItems(['a', 'b'], ['b', 'a'])).toEqual([]);
    expect(changedItems(['a'], ['a'])).toEqual([]);
  });

  it('counts a second copy of an existing row as changed', () => {
    expect(changedItems(['a'], ['a', 'a'])).toEqual(['a']);
  });

  it('compares objects by the given key', () => {
    const key = (r: { location: string; expr: string }) => `${r.location}|${r.expr}`;
    const before = [{ location: 'this_a', expr: '1' }, { location: 'this_b', expr: '2' }];
    const after = [{ location: 'this_a', expr: '1' }, { location: 'this_b', expr: '3' }];
    expect(changedItems(before, after, key)).toEqual([{ location: 'this_b', expr: '3' }]);
  });
});

describe('syncThisChannels with an "after X" delay', () => {
  const timerDoc = (data: string, delayexpr: string) =>
    `<scxml xmlns="http://www.w3.org/2005/07/scxml" initial="A">${data}` +
    `<state id="A"><onentry><send event="A_t_0_timeEvent_0" delayexpr="${delayexpr}"/></onentry>` +
    `<onexit><cancel sendid="A_t_0_timeEvent_0"/></onexit>` +
    `<transition event="A_t_0_timeEvent_0" target="B"/></state><state id="B"/></scxml>`;

  // The reported case: "after this_sasas * 6 s" saved without declaring this_sasas.
  it('declares a new this_ channel used only in the delay, as a double', () => {
    const delayexpr = 'this_sasas * 6 * 1000';
    const synced = syncThisChannels(timerDoc('', delayexpr), thisChannelRefsIn([delayexpr]));
    expect(dataExpr(synced, 'this_sasas')).toBe('0.0');
  });

  it('declares a ternary test in the delay as a bool', () => {
    const delayexpr = '(this_on ? 5 : 0) * 1000';
    const synced = syncThisChannels(timerDoc('', delayexpr), thisChannelRefsIn([delayexpr]));
    expect(dataExpr(synced, 'this_on')).toBe('false');
  });

  it('re-types a generated bool channel to a number when it becomes a delay operand', () => {
    const delayexpr = 'this_t * 1000';
    const xml = timerDoc('<datamodel><data id="this_t" expr="false"/></datamodel>', delayexpr);
    expect(dataExpr(syncThisChannels(xml, thisChannelRefsIn([delayexpr])), 'this_t')).toBe('0.0');
  });
});

describe('syncThisChannels', () => {
  // The reported case: editing one assign in a state must not re-type the state's other channels,
  // even though three of them are wrong (they're left to the Validation panel's warnings).
  it('changes only the channel of the edited action row', () => {
    const before = [
      'assign|this_a|conf_gain * 2',
      'assign|this_b|conf_count + 1',
      'assign|this_c|conf_count + 1',
      'assign|this_d|conf_enabled',
      'assign|this_e|conf_name',
    ];
    const after = ['assign|this_a|conf_gain * 3', ...before.slice(1)];
    const xml =
      `<scxml xmlns="http://www.w3.org/2005/07/scxml" initial="s1"><datamodel>` +
      `<data id="conf_gain" expr="1.5" confType="double"/><data id="conf_count" expr="10" confType="int"/>` +
      `<data id="conf_enabled" expr="true" confType="bool"/><data id="conf_name" expr="'pump'" confType="string"/>` +
      `<data id="this_a" expr="0"/><data id="this_b" expr="false"/><data id="this_c" expr="0.0"/>` +
      `<data id="this_d" expr="0.0"/><data id="this_e" expr="0"/>` +
      `</datamodel><state id="s1"><onentry>` +
      `<assign location="this_a" expr="conf_gain * 3"/><assign location="this_b" expr="conf_count + 1"/>` +
      `<assign location="this_c" expr="conf_count + 1"/><assign location="this_d" expr="conf_enabled"/>` +
      `<assign location="this_e" expr="conf_name"/>` +
      `</onentry></state></scxml>`;

    const result = syncThisChannels(xml, thisChannelRefsIn(changedItems(before, after)));

    expect(dataExpr(result, 'this_a')).toBe('0.0');
    expect(dataExpr(result, 'this_b')).toBe('false');
    expect(dataExpr(result, 'this_c')).toBe('0.0');
    expect(dataExpr(result, 'this_d')).toBe('0.0');
    expect(dataExpr(result, 'this_e')).toBe('0');
  });

  it('declares a this_ channel a condition compares to a number, as a double', () => {
    const result = applyCond(doc('', 'this_number == 2'), 'this_number == 2');
    expect(dataExpr(result, 'this_number')).toBe('0.0');
  });

  it('re-types the bool created from "this_number" once the condition becomes "this_number == 2"', () => {
    const typedFirst = applyCond(doc('', 'this_number'), 'this_number');
    expect(dataExpr(typedFirst, 'this_number')).toBe('false');

    const fixed = applyCond(typedFirst.replace('cond="this_number"', 'cond="this_number == 2"'), 'this_number == 2');
    expect(dataExpr(fixed, 'this_number')).toBe('0.0');
  });

  it('declares only the this_ identifiers, never the whole condition', () => {
    const result = applyCond(doc('', '!this_door &amp;&amp; other'), '!this_door && other');
    expect(extractDatamodelVariables(result)).toEqual(['this_door']);
    expect(dataExpr(result, 'this_door')).toBe('false');
  });

  it('leaves channels outside the applied condition alone, even when they need fixing', () => {
    // this_speed is used elsewhere and is wrong (a generated bool compared to a number), and
    // this_other is used elsewhere but undeclared: neither is in the condition being applied.
    const elsewhere =
      '<state id="C"><transition cond="this_speed &gt; 5 || this_other" target="B"/></state>';
    const xml = doc('<datamodel><data id="this_speed" expr="false"/></datamodel>', 'this_number == 2', elsewhere);

    const result = applyCond(xml, 'this_number == 2');
    expect(dataExpr(result, 'this_number')).toBe('0.0');
    expect(dataExpr(result, 'this_speed')).toBe('false');
    expect(extractDatamodelVariables(result)).not.toContain('this_other');
  });

  it('still types a channel in scope from every use in the document', () => {
    // A bool use elsewhere conflicts with the number comparison, so the channel isn't re-typed.
    const elsewhere = '<state id="C"><transition cond="!this_n" target="B"/></state>';
    const xml = doc('<datamodel><data id="this_n" expr="false"/></datamodel>', 'this_n == 2', elsewhere);
    expect(dataExpr(applyCond(xml, 'this_n == 2'), 'this_n')).toBe('false');
  });

  it('settles a chain of channels that are all in scope', () => {
    // this_c is read from this_b, which only gets its type from conf_enabled once declared.
    const actions = ['assign|this_c|this_b', 'assign|this_b|conf_enabled'];
    const xml =
      `<scxml xmlns="http://www.w3.org/2005/07/scxml" initial="A">` +
      `<datamodel><data id="conf_enabled" expr="true"/></datamodel>` +
      `<state id="A"><onentry>` +
      `<assign location="this_c" expr="this_b"/><assign location="this_b" expr="conf_enabled"/>` +
      `</onentry></state></scxml>`;
    const result = syncThisChannels(xml, thisChannelRefsIn(actions));
    expect(dataExpr(result, 'this_b')).toBe('false');
    expect(dataExpr(result, 'this_c')).toBe('false');
  });

  it('returns the content untouched when nothing needs changing, or nothing is in scope', () => {
    const xml = doc('<datamodel><data id="this_n" expr="0"/></datamodel>', 'this_n == 2');
    expect(applyCond(xml, 'this_n == 2')).toBe(xml);
    expect(syncThisChannels(doc('', 'this_x == 1'), [])).toBe(doc('', 'this_x == 1'));
  });
});
