import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { validateCompoundStates, findMainPrefixedDataIds } from './state-validator';
import { SCXMLValidator } from './scxml-validator';

describe('validateCompoundStates stateId attachment', () => {
  it('attaches the compound state id to a missing-initial error', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', state: [{ '@_id': 'Child' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateCompoundStates(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].stateId).toBe('Parent');
  });

  it('reports no error for a compound state with an initial attribute', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'Parent', '@_initial': 'Child', state: [{ '@_id': 'Child' }] }],
    } as any;
    const errors: ValidationError[] = [];
    validateCompoundStates(scxml, errors);
    expect(errors).toEqual([]);
  });
});

describe('compound states without an initial state (parsed documents)', () => {
  const validate = (body: string) => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="Root">\n${body}\n</scxml>`;
    const parsed = new SCXMLParser().parse(xml);
    expect(parsed.success).toBe(true);
    return new SCXMLValidator()
      .validate(parsed.data!.scxml, xml)
      .filter((e) => e.message.startsWith('Compound state'));
  };

  it('flags a compound state with the exact <state tag position', () => {
    const errors = validate(`  <state id="Root">\n    <state id="A"/>\n  </state>`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: 'error',
      stateId: 'Root',
      line: 2,
      column: 3,
      endLine: 2,
      endColumn: 9,
    });
  });

  it('flags a region of a <parallel> that has no initial', () => {
    const errors = validate(
      `  <parallel id="Root">\n    <state id="R1" initial="R1a"><state id="R1a"/></state>\n    <state id="R2">\n      <state id="R2a"/>\n    </state>\n  </parallel>`
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ stateId: 'R2', line: 4, column: 5 });
  });

  it('flags a compound state nested inside a <parallel> inside a <state>', () => {
    const errors = validate(
      `  <state id="Root" initial="P">\n    <parallel id="P">\n      <state id="R" initial="X">\n        <state id="X">\n          <state id="X1"/>\n        </state>\n      </state>\n    </parallel>\n  </state>`
    );
    expect(errors.map((e) => e.stateId)).toEqual(['X']);
    expect(errors[0].line).toBe(5);
  });

  it('does not flag a <parallel>, atomic states, or states with an <initial> child', () => {
    const errors = validate(
      `  <parallel id="Root">\n    <state id="R1">\n      <initial><transition target="R1a"/></initial>\n      <state id="R1a"/>\n    </state>\n    <state id="R2"/>\n  </parallel>`
    );
    expect(errors).toEqual([]);
  });

  it('counts <final> children as making a state compound', () => {
    const errors = validate(`  <state id="Root">\n    <final id="Done"/>\n  </state>`);
    expect(errors.map((e) => e.stateId)).toEqual(['Root']);
  });
});

describe('findMainPrefixedDataIds', () => {
  it('finds "main_" prefixed data ids at the root and in nested states', () => {
    const scxml: SCXMLElement = {
      datamodel: { data: [{ '@_id': 'main_asas', '@_expr': '0' }, { '@_id': 'this_ok' }] },
      state: [
        {
          '@_id': 'Parent',
          datamodel: { data: [{ '@_id': 'main_nested' }] },
        },
      ],
    } as any;

    expect(findMainPrefixedDataIds(scxml)).toEqual(['main_asas', 'main_nested']);
  });

  it('returns an empty array when no "main_" prefixed ids exist', () => {
    const scxml: SCXMLElement = {
      datamodel: { data: [{ '@_id': 'this_ok' }, { '@_id': 'conf_ok' }] },
    } as any;

    expect(findMainPrefixedDataIds(scxml)).toEqual([]);
  });
});
