import { describe, it, expect } from 'vitest';
import { SCXMLParser } from './scxml-parser';

const parseErrors = (xml: string) =>
  new SCXMLParser().parse(xml).errors.filter((e) => e.severity === 'error');

describe('SCXMLParser syntax diagnostics', () => {
  it('reports no errors for a well-formed document', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A"><transition event="go" target="A"/></state>
</scxml>`;
    expect(parseErrors(xml)).toEqual([]);
  });

  it('reports a misspelled closing tag once, without cascading errors', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
  <state id="A">
    <transition event="go" target="A"/>
  </stat>
</scxml>`;
    const errors = parseErrors(xml);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      line: 4,
      column: 3,
      endLine: 4,
      endColumn: 3 + '</stat>'.length,
    });
    expect(errors[0].message).toBe(
      "Mismatched closing tag '</stat>' - expected '</state>' to close <state> opened on line 2"
    );
  });

  it('reports a forgotten closing tag at the tag that was left open', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
  <state id="A">
    <onentry>
  </state>
</scxml>`;
    const errors = parseErrors(xml);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 3, column: 5 });
    expect(errors[0].message).toContain("Unclosed tag '<onentry>'");
    expect(errors[0].message).toContain("before '</state>' on line 4");
  });

  it('reports an unquoted attribute value with its location and a fix', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">
  <datamodel>
    <data id="this_x" expr=false/>
  </datamodel>
</scxml>`;
    const quoteError = parseErrors(xml).find((e) => e.message.includes('must be quoted'));
    expect(quoteError).toMatchObject({ line: 3, column: 23 });
    expect(quoteError!.message).toBe(`Attribute 'expr' value must be quoted, e.g. expr="false"`);
  });

  it('does not report attribute typos as syntax errors (left to the validator)', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <datamodel><data expre="false" id="this_something_info"/></datamodel>
  <state id="A"/>
</scxml>`;
    const result = new SCXMLParser().parse(xml);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('SCXMLParser.serialize empty elements', () => {
  // Regression: a whole-document rewrite (e.g. load/GitHub-pull transition merging)
  // used to expand every self-closing element into an explicit end tag.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <datamodel>
    <data id="x" expr="0"/>
  </datamodel>
  <state id="a">
    <onentry>
      <assign location="x" expr="1"/>
      <send event="t" delay="1s"/>
    </onentry>
    <onexit>
      <cancel sendid="t" />
    </onexit>
    <transition event="go" target="b">
    </transition>
  </state>
  <final id="b"/>
</scxml>`;

  it.each([true, false])('keeps empty elements self-closing (includeVisualMetadata=%s)', (withMetadata) => {
    const parser = new SCXMLParser();
    const result = parser.parse(xml);
    expect(result.success).toBe(true);
    const out = parser.serialize(result.data!, withMetadata);

    expect(out).not.toMatch(/><\/(data|assign|send|cancel|transition|final)>/);
    expect(out).toContain('<data id="x" expr="0"/>');
    expect(out).toContain('<assign location="x" expr="1"/>');
    expect(out).toContain('<cancel sendid="t"/>');
    expect(out).toContain('<transition event="go" target="b"/>');
    expect(out).toContain('<final id="b"/>');
  });

  it('still writes child content and text normally', () => {
    const parser = new SCXMLParser();
    const result = parser.parse(xml);
    const out = parser.serialize(result.data!, true);
    expect(out).toMatch(/<onentry>\s*<assign/);
    expect(out).toMatch(/<\/onentry>/);
    expect(new SCXMLParser().parse(out).success).toBe(true);
  });
});
