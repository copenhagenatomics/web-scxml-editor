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
