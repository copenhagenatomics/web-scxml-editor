import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
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
