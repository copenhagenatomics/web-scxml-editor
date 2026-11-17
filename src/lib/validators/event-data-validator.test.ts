import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ValidationError } from '@/types/common';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { SCXMLValidator } from './scxml-validator';
import { validateEventlessEventDataEntry } from './event-data-validator';

const HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"';

function validateXml(xml: string): ValidationError[] {
  const scxml = new SCXMLParser().parse(xml).data!.scxml;
  const errors: ValidationError[] = [];
  validateEventlessEventDataEntry(scxml, xml, errors);
  return errors;
}

const validate = (body: string) => validateXml(`${HEADER} initial="idle">${body}</scxml>`);

const READS_DATA = '<onentry><assign location="cycles" expr="_event.data"/></onentry>';

describe('validateEventlessEventDataEntry', () => {
  it('warns on a cond-only transition into a state that reads _event.data on entry', () => {
    const xml = `${HEADER} initial="idle">
  <state id="idle">
    <transition cond="cycles &gt; 0" target="running"/>
  </state>
  <state id="running">${READS_DATA}</state>
</scxml>`;
    const errors = validateXml(xml);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: 'warning',
      stateId: 'idle',
      targetStateId: 'running',
      line: 3,
    });
    expect(errors[0].message).toContain(
      "Eventless transition from 'idle' to 'running': 'running' uses _event.data"
    );
  });

  it('warns on a bare transition and on event=""', () => {
    expect(validate(`<state id="idle"><transition target="running"/></state><state id="running">${READS_DATA}</state>`)).toHaveLength(1);
    expect(validate(`<state id="idle"><transition event="" target="running"/></state><state id="running">${READS_DATA}</state>`)).toHaveLength(1);
  });

  it('does not warn when the transition has an event', () => {
    expect(validate(`<state id="idle"><transition event="start" target="running"/></state><state id="running">${READS_DATA}</state>`)).toEqual([]);
  });

  it('does not warn when the target never reads _event.data on entry', () => {
    expect(
      validate(
        '<state id="idle"><transition target="running"/></state>' +
          '<state id="running"><onexit><assign location="x" expr="_event.data"/></onexit>' +
          '<transition event="go" target="idle"><assign location="x" expr="_event.data"/></transition></state>'
      )
    ).toEqual([]);
    expect(
      validate(
        '<state id="idle"><transition target="running"/></state>' +
          '<state id="running"><onentry><assign location="x" expr="my_event.data + _event.name"/></onentry></state>'
      )
    ).toEqual([]);
  });

  it('does not check <initial> transitions', () => {
    expect(
      validate(
        `<state id="idle"><transition event="start" target="P"/></state>` +
          `<state id="P"><initial><transition target="running"/></initial><state id="running">${READS_DATA}</state></state>`
      )
    ).toEqual([]);
  });

  it('warns when a descendant entered by default reads _event.data', () => {
    const errors = validate(
      '<state id="idle"><transition target="P"/></state>' +
        `<state id="P" initial="running"><state id="other"/><state id="running">${READS_DATA}</state></state>`
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("'running' (entered through 'P') uses _event.data");
  });

  it('does not warn when the reader is a non-initial child', () => {
    expect(
      validate(
        '<state id="idle"><transition target="P"/></state>' +
          `<state id="P" initial="other"><state id="other"/><state id="running">${READS_DATA}</state></state>`
      )
    ).toEqual([]);
  });

  it('enters every region of a parallel target and checks transitions inside parallels', () => {
    expect(
      validate(
        '<state id="idle"><transition target="Par"/></state>' +
          `<parallel id="Par"><state id="r1"/><state id="r2">${READS_DATA}</state></parallel>`
      )
    ).toHaveLength(1);
    expect(
      validate(
        '<state id="idle"/>' +
          `<parallel id="Par"><state id="r1" initial="a"><state id="a"><transition target="b"/></state><state id="b">${READS_DATA}</state></state><state id="r2"/></parallel>`
      )
    ).toHaveLength(1);
  });

  it('runs as part of SCXMLValidator, without flagging the sample machine as it ships', () => {
    const xml = readFileSync(resolve(__dirname, '../../../xml/test-state-machine.scxml'), 'utf8');
    const scxml = new SCXMLParser().parse(xml).data!.scxml;
    const messages = new SCXMLValidator().validate(scxml, xml).map((e) => e.message);
    expect(messages.filter((m) => m.includes('_event.data'))).toEqual([]);

    // Make Oven_on_Not_Counting's `start` entry into test_running (the last one) eventless.
    const original = '<transition event="start"  target="test_running">';
    const at = xml.lastIndexOf(original);
    expect(at).toBeGreaterThan(xml.indexOf('<state id="Oven_on_Not_Counting">'));
    const broken =
      xml.slice(0, at) +
      '<transition cond="pneumatic_valve_actuator_counter == 0" target="test_running">' +
      xml.slice(at + original.length);
    const brokenScxml = new SCXMLParser().parse(broken).data!.scxml;
    const warnings = new SCXMLValidator()
      .validate(brokenScxml, broken)
      .filter((e) => e.message.includes('_event.data'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      severity: 'warning',
      stateId: 'Oven_on_Not_Counting',
      targetStateId: 'test_running',
    });
  });
});
