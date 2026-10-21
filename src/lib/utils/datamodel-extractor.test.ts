import { describe, it, expect } from 'vitest';
import { getConfigFieldUsage, inferChannelInitialExpr, inferChannelRetypes } from './datamodel-extractor';

describe('inferChannelInitialExpr (assigned value -> <data expr> for a new channel)', () => {
  it.each([
    ['true', 'false'],
    ['false', 'false'],
    [' true ', 'false'],
    ['this_a > 5', 'false'],
    ['this_a >= 5', 'false'],
    ['this_a == this_b', 'false'],
    ['this_a != 0', 'false'],
    ['this_a && this_b', 'false'],
    ['this_a || this_b', 'false'],
    ['!this_a', 'false'],
  ])('assigning %j declares a bool channel: <data expr=%j>', (input, expected) => {
    expect(inferChannelInitialExpr(input)).toBe(expected);
  });

  it.each([
    ['(this_a > 5)', 'false'],
    ['this_a > 5 ? true : false', 'false'],
    ['this_a > 0 && this_b < 3 || this_c', 'false'],
    ["this_a == 'x'", 'false'],
    ['!(this_a || this_b)', 'false'],
  ])('keeps comparisons/ternaries of bools as bool: %j -> <data expr=%j>', (input, expected) => {
    expect(inferChannelInitialExpr(input)).toBe(expected);
  });

  it.each([
    ['this_count > 0 ? 1 : 0', '0'],
    ['this_mask >> 1', '0'],
    ['this_mask << 2', '0'],
    ['this_a & this_b', '0'],
    ['0 || 1', '0'],
    ['this_a || 1', '0'],
    ['this_a && 5', '0'],
    ['this_a > 0 ? 1 : this_b', '0'],
    ['this_a > 0 ? 1 : false', '0'],
    ['!this_a + 1', '0'],
  ])('does not mistake numeric results for bool: %j -> <data expr=%j>', (input, expected) => {
    expect(inferChannelInitialExpr(input)).toBe(expected);
  });

  it.each([
    ['this_a > 0 ? 1.5 : 0', '0.0'],
    ['this_a || 0.5', '0.0'],
    ['(this_a + 1.5) * 2', '0.0'],
    ['this_a * 2.5', '0.0'],
  ])('infers double from numeric operands: %j -> <data expr=%j>', (input, expected) => {
    expect(inferChannelInitialExpr(input)).toBe(expected);
  });

  it.each([
    ['1.5', '0.0'],
    ['-0.25', '0.0'],
    ['.5', '0.0'],
  ])('assigning %j declares a double channel: <data expr=%j>', (input, expected) => {
    expect(inferChannelInitialExpr(input)).toBe(expected);
  });

  it.each([
    ['0'],
    ['42'],
    ['this_a + 1'],
    ['Math.floor(this_a)'],
    // Non-config string fields are rejected by the C# generator, so strings fall back to int
    ["'abc'"],
    [''],
    [undefined],
  ])('assigning %j declares an int channel: <data expr="0">', (input) => {
    expect(inferChannelInitialExpr(input)).toBe('0');
  });
});

describe('inferChannelRetypes', () => {
  const doc = (data: string, body: string) =>
    `<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel>${data}</datamodel>${body}</scxml>`;
  const entry = (...assigns: string[]) =>
    `<state id="A"><onentry>${assigns.map((a) => `<assign location="this_v" expr="${a}"/>`).join('')}</onentry></state>`;

  it('retypes a generated bool channel once its assign becomes numeric', () => {
    const xml = doc('<data id="this_v" expr="false"/>', entry('0 || 1'));
    expect(inferChannelRetypes(xml)).toEqual([{ id: 'this_v', expr: '0' }]);
  });

  it('returns nothing when the type already matches', () => {
    expect(inferChannelRetypes(doc('<data id="this_v" expr="0"/>', entry('1')))).toEqual([]);
  });

  it('skips channels whose assigns disagree on a type', () => {
    const xml = doc('<data id="this_v" expr="false"/>', entry('true', '5'));
    expect(inferChannelRetypes(xml)).toEqual([]);
  });

  it('leaves hand-written initial values and conf_ data alone', () => {
    const xml = doc('<data id="this_v" expr="5"/><data id="conf_v" expr="false"/>', entry('1.5'));
    expect(inferChannelRetypes(xml)).toEqual([]);
  });
});

describe('getConfigFieldUsage', () => {
  it('returns [] when the config value is not referenced anywhere', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual([]);
  });

  it('finds a reference in a transition cond, reported under the enclosing state id', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <transition cond="conf_threshold &gt; 3" target="S2"/>
        </state>
        <state id="S2"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('finds a reference in an assign expr', () => {
    const xml = `
      <scxml>
        <datamodel>
          <data id="conf_threshold" expr="5" confType="int"/>
          <data id="counter" expr="0"/>
        </datamodel>
        <state id="S1">
          <onentry><assign location="counter" expr="conf_threshold + 1"/></onentry>
        </state>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('finds a reference in a namelist', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <onentry><send event="e1" namelist="conf_threshold"/></onentry>
        </state>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('does not false-positive match a longer identifier with the same prefix', () => {
    const xml = `
      <scxml>
        <datamodel>
          <data id="conf_foo" expr="1" confType="int"/>
          <data id="conf_foobar" expr="2" confType="int"/>
        </datamodel>
        <state id="S1">
          <transition cond="conf_foobar &gt; 1" target="S2"/>
        </state>
        <state id="S2"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'foo')).toEqual([]);
  });

  it('does not count the field\'s own <data> declaration as a usage of itself', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="conf_threshold" confType="int"/></datamodel>
        <state id="S1"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual([]);
  });

  it('deduplicates when the same enclosing id references the field more than once', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <transition cond="conf_threshold &gt; 3" target="S2"/>
          <transition cond="conf_threshold &lt; 0" target="S3"/>
        </state>
        <state id="S2"/>
        <state id="S3"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });
});
