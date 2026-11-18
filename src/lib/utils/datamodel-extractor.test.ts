import { describe, it, expect } from 'vitest';
import {
  getConfigFieldUsage,
  inferChannelInitialExpr,
  inferChannelRetypes,
  inferThisChannelChanges,
} from './datamodel-extractor';

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

  it.each([['0'], ['42'], ['-5'], ['1 + 2']])('assigning %j declares an int channel: <data expr="0">', (input) => {
    expect(inferChannelInitialExpr(input)).toBe('0');
  });

  it.each([
    ['this_a'],
    ['this_a + 1'],
    ['this_a - this_b'],
    ['Math.floor(this_a)'],
    // Non-config string fields are rejected by the C# generator whichever type is declared
    ["'abc'"],
    [''],
    [undefined],
  ])('declares a double channel when the type of %j is unknown: <data expr="0.0">', (input) => {
    expect(inferChannelInitialExpr(input)).toBe('0.0');
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

  // Channels are doubles in the generated C#, so narrowing this_v to int fails with CS0266.
  it.each([['this_a - this_b'], ['this_a + 1'], ['this_a * 2']])(
    'never narrows a double channel to int: %j',
    (assigned) => {
      expect(inferChannelRetypes(doc('<data id="this_v" expr="0.0"/>', entry(assigned)))).toEqual([]);
    }
  );

  it('still widens an int channel to double', () => {
    const xml = doc('<data id="this_v" expr="0"/>', entry('1.5'));
    expect(inferChannelRetypes(xml)).toEqual([{ id: 'this_v', expr: '0.0' }]);
  });

  it('still retypes a double channel to bool', () => {
    const xml = doc('<data id="this_v" expr="0.0"/>', entry('this_a > 5'));
    expect(inferChannelRetypes(xml)).toEqual([{ id: 'this_v', expr: 'false' }]);
  });

  it.each([
    ['this_a'],
    ['Math.floor(this_a)'],
    ['this_a - this_b'],
    ['this_a + 1'],
    ['(this_a - this_b) || this_c'],
  ])(
    'leaves a channel alone when an assigned type cannot be determined: %j',
    (assigned) => {
      expect(inferChannelRetypes(doc('<data id="this_v" expr="false"/>', entry(assigned)))).toEqual([]);
    }
  );

  it.each([
    ['1 + 2', '0'],
    ['-5', '0'],
    ['this_a * 2.5', '0.0'],
  ])('still retypes when arithmetic has a known type: %j -> %j', (assigned, expected) => {
    const xml = doc('<data id="this_v" expr="false"/>', entry(assigned));
    expect(inferChannelRetypes(xml)).toEqual([{ id: 'this_v', expr: expected }]);
  });

  it('leaves a channel alone when only some assigned types can be determined', () => {
    const xml = doc('<data id="this_v" expr="false"/>', entry('this_a', '5'));
    expect(inferChannelRetypes(xml)).toEqual([]);
  });
});

describe('inferThisChannelChanges', () => {
  const doc = (data: string, body: string) =>
    `<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel>${data}</datamodel>${body}</scxml>`;
  const withCond = (cond: string) =>
    `<state id="A"><transition cond="${cond}" target="B"/></state><state id="B"/>`;
  const assignV = (expr: string) => `<state id="C"><onentry><assign location="this_v" expr="${expr}"/></onentry></state>`;

  describe('missing channels', () => {
    it.each([
      ['this_number == 2', 'this_number', '0.0'],
      ['this_temp &gt; 20.5', 'this_temp', '0.0'],
      ['2 &lt; this_x', 'this_x', '0.0'],
      ['this_flag', 'this_flag', 'false'],
      ['!this_door', 'this_door', 'false'],
      ['this_on == true', 'this_on', 'false'],
      ['(this_a)', 'this_a', 'false'],
    ])('declares the channel a condition %j references: %s = %s', (cond, id, expr) => {
      expect(inferThisChannelChanges(doc('', withCond(cond))).missing).toEqual([{ id, expr }]);
    });

    it('declares every this_ channel in a compound condition, typed by its own use', () => {
      const { missing } = inferThisChannelChanges(doc('', withCond('this_a &amp;&amp; this_b &gt;= 3')));
      expect(missing).toEqual([
        { id: 'this_a', expr: 'false' },
        { id: 'this_b', expr: '0.0' },
      ]);
    });

    it('falls back to a double when a referenced channel has no clear type', () => {
      const { missing } = inferThisChannelChanges(doc('', withCond('this_a + this_b &gt; 3')));
      expect(missing).toEqual([
        { id: 'this_a', expr: '0.0' },
        { id: 'this_b', expr: '0.0' },
      ]);
    });

    it('declares assign targets typed from the assigned value, and channels read in the expression', () => {
      const { missing } = inferThisChannelChanges(doc('', assignV('!this_ready')));
      expect(missing).toEqual([
        { id: 'this_ready', expr: 'false' },
        { id: 'this_v', expr: 'false' },
      ]);
    });

    it('ignores non-this_ names, property accesses and string contents', () => {
      const cond = "_event.data.this_x == 1 || other == 2 || name == 'this_y' || conf_z";
      expect(inferThisChannelChanges(doc('', withCond(cond))).missing).toEqual([]);
    });

    describe('typed from declared variables', () => {
      const declared =
        '<data id="conf_enabled" expr="true"/>' +
        '<data id="conf_limit" expr="12.5"/>' +
        '<data id="conf_gain" expr="2" confType="double"/>' +
        `<data id="conf_label" expr="'x'" confType="string"/>` +
        '<data id="this_a" expr="false"/>';

      it.each([
        ['conf_enabled', 'false'],
        ['this_a', 'false'],
        ['!conf_enabled', 'false'],
        ['conf_limit * 2', '0.0'],
        // confType wins over the literal: "2" alone would make an int
        ['conf_gain', '0.0'],
        // strings and undeclared names still have no type, so the double fallback applies
        ['conf_label', '0.0'],
        ['conf_unknown', '0.0'],
        ['_event.data', '0.0'],
      ])('assigning %j creates this_v as %s', (assigned, expr) => {
        const { missing } = inferThisChannelChanges(doc(declared, assignV(assigned)));
        expect(missing).toEqual([{ id: 'this_v', expr }]);
      });

      it.each([
        ['this_x == this_a', 'false'],
        ['this_x != conf_enabled', 'false'],
        ['this_x &gt; conf_limit', '0.0'],
        ['conf_limit &lt;= this_x', '0.0'],
      ])('condition %j creates this_x as %s', (cond, expr) => {
        const { missing } = inferThisChannelChanges(doc(declared, withCond(cond)));
        expect(missing).toEqual([{ id: 'this_x', expr }]);
      });
    });

    it('leaves already declared channels alone', () => {
      expect(inferThisChannelChanges(doc('<data id="this_n" expr="0"/>', withCond('this_n == 2'))).missing).toEqual([]);
    });
  });

  describe('retypes from conditions', () => {
    // Typing "this_number" first creates a bool; finishing the cond must turn it into a number.
    it('turns a generated bool into a double once a condition compares it to a number', () => {
      const { retypes } = inferThisChannelChanges(doc('<data id="this_number" expr="false"/>', withCond('this_number == 2')));
      expect(retypes).toEqual([{ id: 'this_number', expr: '0.0' }]);
    });

    it('turns a generated number into a bool once it is used as a boolean condition', () => {
      const { retypes } = inferThisChannelChanges(doc('<data id="this_flag" expr="0.0"/>', withCond('!this_flag')));
      expect(retypes).toEqual([{ id: 'this_flag', expr: 'false' }]);
    });

    it.each([['0'], ['0.0']])('keeps a %s channel that a condition compares to a number', (current) => {
      const xml = doc(`<data id="this_n" expr="${current}"/>`, withCond('this_n &gt; 5'));
      expect(inferThisChannelChanges(xml).retypes).toEqual([]);
    });

    it('leaves a hand-written initial value alone', () => {
      const xml = doc('<data id="this_n" expr="true"/>', withCond('this_n == 2'));
      expect(inferThisChannelChanges(xml).retypes).toEqual([]);
    });

    it('skips a channel whose condition and assign disagree', () => {
      const xml = doc('<data id="this_v" expr="0"/>', withCond('this_v') + assignV('5'));
      expect(inferThisChannelChanges(xml).retypes).toEqual([]);
    });

    it('re-types a generated channel assigned a declared variable of another type', () => {
      const xml = doc('<data id="conf_enabled" expr="true"/><data id="this_v" expr="0.0"/>', assignV('conf_enabled'));
      expect(inferThisChannelChanges(xml).retypes).toEqual([{ id: 'this_v', expr: 'false' }]);
    });

    it('still never narrows a double channel to int, even from declared int operands', () => {
      const xml = doc(
        '<data id="this_a" expr="0"/><data id="this_b" expr="0"/><data id="this_v" expr="0.0"/>',
        assignV('this_a - this_b')
      );
      expect(inferThisChannelChanges(xml).retypes).toEqual([]);
    });

    it('widens an int channel to double when it is assigned both int and double values', () => {
      const xml = doc(
        '<data id="this_v" expr="0"/>',
        `<state id="C"><onentry><assign location="this_v" expr="1"/><assign location="this_v" expr="1.5"/></onentry></state>`
      );
      expect(inferThisChannelChanges(xml).retypes).toEqual([{ id: 'this_v', expr: '0.0' }]);
    });
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
