import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { SCXMLValidator } from './scxml-validator';

describe('SCXMLValidator duplicate state id', () => {
  it('attaches the duplicated id as stateId', () => {
    const scxml: SCXMLElement = {
      '@_xmlns': 'http://www.w3.org/2005/07/scxml',
      '@_version': '1.0',
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'A' }],
    } as any;
    const errors = new SCXMLValidator().validate(scxml);
    const duplicateError = errors.find((e) => e.message.includes('Duplicate state ID'));
    expect(duplicateError).toBeDefined();
    expect(duplicateError!.stateId).toBe('A');
  });
});

describe('SCXMLValidator main_ prefixed variables', () => {
  it('warns when a datamodel variable uses the non-portable "main_" prefix', () => {
    const xmlContent = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <datamodel>
    <data id="main_asas" expr="0"/>
  </datamodel>
  <state id="A"/>
</scxml>`;
    const scxml: SCXMLElement = {
      '@_xmlns': 'http://www.w3.org/2005/07/scxml',
      '@_version': '1.0',
      '@_initial': 'A',
      datamodel: { data: [{ '@_id': 'main_asas', '@_expr': '0' }] },
      state: [{ '@_id': 'A' }],
    } as any;

    const errors = new SCXMLValidator().validate(scxml, xmlContent);
    const warning = errors.find((e) => e.message.includes("'main_asas'"));
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
    expect(warning!.message).toContain('this_asas');
    expect(warning!.line).toBe(3);
  });

  it('does not warn for "this_" prefixed variables', () => {
    const xmlContent = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <datamodel>
    <data id="this_asas" expr="0"/>
  </datamodel>
  <state id="A"/>
</scxml>`;
    const scxml: SCXMLElement = {
      '@_xmlns': 'http://www.w3.org/2005/07/scxml',
      '@_version': '1.0',
      '@_initial': 'A',
      datamodel: { data: [{ '@_id': 'this_asas', '@_expr': '0' }] },
      state: [{ '@_id': 'A' }],
    } as any;

    const errors = new SCXMLValidator().validate(scxml, xmlContent);
    expect(errors.find((e) => e.message.includes('main_'))).toBeUndefined();
  });

  it('warns when a "main_" variable is only referenced in a transition cond, not declared anywhere', () => {
    const xmlContent = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A">
    <transition event="go" cond="main_asas == 1" target="B"/>
  </state>
  <state id="B"/>
</scxml>`;
    const scxml: SCXMLElement = {
      '@_xmlns': 'http://www.w3.org/2005/07/scxml',
      '@_version': '1.0',
      '@_initial': 'A',
      state: [
        { '@_id': 'A', transition: [{ '@_event': 'go', '@_cond': 'main_asas == 1', '@_target': 'B' }] },
        { '@_id': 'B' },
      ],
    } as any;

    const errors = new SCXMLValidator().validate(scxml, xmlContent);
    const warning = errors.find((e) => e.message.includes("'main_asas'"));
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
    expect(warning!.line).toBe(3);
  });
});

describe('SCXMLValidator unknown-attribute diagnostics (real parsed documents)', () => {
  // Runs the same parse -> validate chain as useContentValidation.
  const validateXml = (xml: string) => {
    const result = new SCXMLParser().parse(xml);
    expect(result.errors.filter((e) => e.severity === 'error')).toEqual([]);
    return new SCXMLValidator().validate(result.data!.scxml, xml);
  };
  const unknownAttributeErrors = (xml: string) =>
    validateXml(xml).filter((e) => e.message.startsWith('Unknown attribute'));

  it('flags a misspelled expr on a root-level <data> with its exact source range', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <datamodel>
    <data expre="false" id="this_something_info"/>
  </datamodel>
  <state id="A"/>
</scxml>`;
    const errors = unknownAttributeErrors(xml);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: 'error',
      line: 4,
      column: 11,
      endLine: 4,
      endColumn: 11 + 'expre="false"'.length,
    });
    expect(errors[0].message).toContain("'expre'");
    expect(errors[0].message).toContain('<data id="this_something_info">');
    expect(errors[0].message).toContain("Did you mean 'expr'?");
  });

  it('points at the actual offending element when several of the same type exist', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A">
    <datamodel>
      <data id="this_ok" expr="1"/>
      <data id="this_bad" exr="2"/>
    </datamodel>
  </state>
</scxml>`;
    const errors = unknownAttributeErrors(xml);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(5);
    expect(errors[0].message).toContain("Did you mean 'expr'?");
  });

  it('checks <datamodel> and states nested inside <parallel>', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="P">
  <parallel id="P">
    <datamodel><data id="this_q" exr="1"/></datamodel>
    <state id="R1" intial="x"/>
  </parallel>
</scxml>`;
    const errors = unknownAttributeErrors(xml);
    expect(errors.map((e) => [e.line, e.message.split('.')[0]])).toEqual([
      [3, `Unknown attribute 'exr' on <data id="this_q">`],
      [4, `Unknown attribute 'intial' on <state id="R1">`],
    ]);
  });

  it('checks executable content in onentry/onexit, including nested <if>', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A">
    <onentry>
      <log label="x" expre="1"/>
    </onentry>
    <onexit>
      <if cond="true">
        <assign location="this_x" exp="1"/>
      </if>
    </onexit>
  </state>
</scxml>`;
    const errors = unknownAttributeErrors(xml);
    expect(errors.map((e) => e.line)).toEqual([4, 8]);
    expect(errors[0].message).toContain("Did you mean 'expr'?");
    expect(errors[1].message).toContain("Did you mean 'expr'?");
  });

  it('explains how to fix an unknown attribute that has no close match', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A" color="red"/>
</scxml>`;
    const [error] = unknownAttributeErrors(xml);
    expect(error.line).toBe(2);
    expect(error.message).not.toContain('Did you mean');
    expect(error.message).toContain('namespace prefix');
    expect(error.message).toContain('Valid attributes for <state>: id, initial.');
  });

  it('does not flag inline <data> content, confType, namespaced attributes or xmlns declarations', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" initial="A">
  <datamodel>
    <data id="this_text">some inline value</data>
    <data id="conf_speed" expr="1" confType="int"/>
  </datamodel>
  <state id="A" viz:xywh="0 0 100 50">
    <datamodel><data id="this_local">inline value</data></datamodel>
    <transition event="go" target="A" viz:sourceHandle="right"/>
    <invoke type="http://www.w3.org/TR/scxml/" id="child">
      <param name="p" expr="1"/>
      <content><anything state="not-scxml" bogus="1"/></content>
    </invoke>
  </state>
</scxml>`;
    expect(unknownAttributeErrors(xml)).toEqual([]);
  });

  it('reports a missing required attribute on the right line among same-type elements', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A">
    <onentry>
      <log label="first" expr="1"/>
      <log label="second"/>
    </onentry>
  </state>
</scxml>`;
    const error = validateXml(xml).find((e) => e.message.includes("required 'expr'"));
    expect(error).toMatchObject({ line: 5, column: 7 });
    expect(error!.message).toContain('at line 5, column 7');
  });

  it('flags a misspelled id on a <state> referenced by the root initial', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="main_region">
  <state idd="main_region">
    <state id="a"/>
  </state>
</scxml>`;
    const errors = validateXml(xml);
    const typo = errors.find((e) => e.message.startsWith("Unknown attribute 'idd'"));
    expect(typo).toMatchObject({ severity: 'error', line: 2, column: 10 });
    expect(typo!.message).toContain("Did you mean 'id'?");
    expect(errors.find((e) => e.message.startsWith('State missing required'))).toMatchObject({
      line: 2,
    });
    expect(errors.some((e) => e.message.includes('could not run'))).toBe(false);
  });

  // One unknown attribute per SCXML tag; each must be reported on its own line.
  it.each([
    ['scxml', ''],
    ['state', '<state id="s" bogus="1"/>'],
    ['parallel', '<parallel id="p" bogus="1"><state id="r"/></parallel>'],
    ['final', '<final id="f" bogus="1"/>'],
    ['history', '<state id="h"><history id="hh" bogus="1"/><state id="h1"/></state>'],
    ['transition', '<state id="t"><transition target="t" bogus="1"/></state>'],
    ['initial', '<state id="i"><initial bogus="1"><transition target="i1"/></initial><state id="i1"/></state>'],
    ['onentry', '<state id="e"><onentry bogus="1"/></state>'],
    ['onexit', '<state id="x"><onexit bogus="1"/></state>'],
    ['datamodel', '<datamodel bogus="1"/>'],
    ['data', '<datamodel><data id="d" bogus="1"/></datamodel>'],
    ['invoke', '<state id="v"><invoke type="t" bogus="1"/></state>'],
    ['param', '<state id="pa"><invoke type="t"><param name="n" expr="1" bogus="1"/></invoke></state>'],
    ['content', '<state id="c"><invoke type="t"><content bogus="1"/></invoke></state>'],
    ['finalize', '<state id="fz"><invoke type="t"><finalize bogus="1"/></invoke></state>'],
    ['donedata', '<final id="dd"><donedata bogus="1"/></final>'],
    ['script', '<state id="sc"><onentry><script src="x.js" bogus="1"/></onentry></state>'],
    ['assign', '<state id="as"><onentry><assign location="v" expr="1" bogus="1"/></onentry></state>'],
    ['send', '<state id="se"><onentry><send event="e" bogus="1"/></onentry></state>'],
    ['raise', '<state id="ra"><onentry><raise event="e" bogus="1"/></onentry></state>'],
    ['log', '<state id="lo"><onentry><log expr="1" bogus="1"/></onentry></state>'],
    ['cancel', '<state id="ca"><onentry><cancel sendid="s" bogus="1"/></onentry></state>'],
    ['if', '<state id="if"><onentry><if cond="true" bogus="1"/></onentry></state>'],
    ['elseif', '<state id="ei"><onentry><if cond="a"><elseif cond="b" bogus="1"/></if></onentry></state>'],
    ['else', '<state id="el"><onentry><if cond="a"><else bogus="1"/></if></onentry></state>'],
    ['foreach', '<state id="fe"><onentry><foreach array="a" item="i" bogus="1"/></onentry></state>'],
  ])('flags an unknown attribute on <%s>', (tag, snippet) => {
    const rootAttr = tag === 'scxml' ? ' bogus="1"' : '';
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"${rootAttr}>
  <state id="root"/>
  ${snippet}
</scxml>`;
    const errors = unknownAttributeErrors(xml);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(new RegExp(`^Unknown attribute 'bogus' on <${tag}[ >]`));
    expect(errors[0].line).toBe(tag === 'scxml' ? 1 : 3);
  });

  it.each(['public/examples/traffic-light.scxml', 'xml/test-state-machine.scxml'])(
    'reports no unknown attributes for the bundled example %s',
    (file) => {
      const xml = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(unknownAttributeErrors(xml)).toEqual([]);
    }
  );
});
