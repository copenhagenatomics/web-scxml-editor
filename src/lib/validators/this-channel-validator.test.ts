import { describe, it, expect } from 'vitest';
import type { ValidationError } from '@/types/common';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { applyValidationFix } from '@/lib/utils/validation-fix';
import { SCXMLValidator } from './scxml-validator';

const HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"';

/** Runs the full validator on a document loaded through the real parser, as the app does. */
function validateXml(xml: string): ValidationError[] {
  const parsed = new SCXMLParser().parse(xml);
  return new SCXMLValidator().validate(parsed.data!.scxml, xml);
}

const channelErrors = (xml: string) => validateXml(xml).filter((e) => e.message.startsWith('Channel '));

const doc = (data: string, body: string) =>
  `${HEADER} initial="A">\n  <datamodel>\n${data}\n  </datamodel>\n${body}\n</scxml>`;
const transition = (cond: string) =>
  `  <state id="A">\n    <transition target="B" cond="${cond}"/>\n  </state>\n  <state id="B"/>`;
const entryAssign = (location: string, expr: string) =>
  `  <state id="C">\n    <onentry><assign location="${location}" expr="${expr}"/></onentry>\n  </state>`;

describe('this_ channel type validation', () => {
  // The reported case: the channel edited to false in the code editor, compared to a number.
  it('warns, with a fix, when a bool channel is compared to a number', () => {
    const xml = doc('    <data id="this_number" expr="false"/>', transition('this_number == 2'));
    const [warning] = channelErrors(xml);

    expect(warning.severity).toBe('warning');
    expect(warning.message).toBe(
      "Channel 'this_number' starts as false (true/false) but is compared to a number in the condition on 'A' → 'B'. Change its initial value to 0.0, or the host will fail to generate the program."
    );
    expect(warning.line).toBe(3); // the <data> line the fix changes
    expect(warning.stateId).toBe('A');
    expect(warning.targetStateId).toBe('B');
    expect(warning.fix).toEqual({
      label: 'Set initial value to 0.0',
      kind: 'set-data-expr',
      dataId: 'this_number',
      expr: '0.0',
    });
  });

  it('clears the warning once its fix is applied', () => {
    const xml = doc('    <data id="this_number" expr="false"/>', transition('this_number == 2'));
    const [warning] = channelErrors(xml);
    const fixed = applyValidationFix(xml, warning.fix!);

    expect(fixed).toContain('id="this_number" expr="0.0"');
    expect(channelErrors(fixed)).toEqual([]);
  });

  it('errors, with a fix, when a channel is used but never declared', () => {
    const xml = doc('', transition('this_number == 2'));
    const [error] = channelErrors(xml);

    expect(error.severity).toBe('error');
    expect(error.message).toContain("Channel 'this_number' is used in the condition on 'A' → 'B' but isn't declared");
    expect(error.fix).toEqual({
      label: 'Declare as number (0.0)',
      kind: 'add-data',
      dataId: 'this_number',
      expr: '0.0',
    });
    expect(channelErrors(applyValidationFix(xml, error.fix!))).toEqual([]);
  });

  it('declares a channel used as a condition as true/false', () => {
    const [error] = channelErrors(doc('', transition('!this_door')));
    expect(error.fix).toMatchObject({ label: 'Declare as true/false (false)', expr: 'false' });
  });

  it('warns when a number channel is used as a true/false condition', () => {
    const [warning] = channelErrors(doc('    <data id="this_flag" expr="0.0"/>', transition('!this_flag')));
    expect(warning.message).toContain('is used as a true/false condition in');
    expect(warning.fix).toMatchObject({ expr: 'false' });
  });

  it('warns when an int channel is assigned a decimal number', () => {
    const [warning] = channelErrors(doc('    <data id="this_v" expr="5"/>', entryAssign('this_v', '1.5')));
    expect(warning.message).toContain("starts as 5 (whole number) but is assigned a decimal number in an assignment in 'C'");
    expect(warning.fix).toMatchObject({ expr: '0.0' });
  });

  it('warns without a fix when uses disagree on the type', () => {
    const xml = doc('    <data id="this_v" expr="0"/>', `${transition('this_v')}\n${entryAssign('this_v', '5')}`);
    const [warning] = channelErrors(xml);

    expect(warning.severity).toBe('warning');
    expect(warning.message).toBe(
      "Channel 'this_v' is used as a true/false value in the condition on 'A' → 'B' but as a number in an assignment in 'C'. A channel has one type, so change one of them to match the other."
    );
    expect(warning.fix).toBeUndefined();
  });

  it('still counts the uses it can type when another use is unknown', () => {
    const xml = doc(
      '    <data id="this_v" expr="0.0"/>',
      `${transition('this_v')}\n${entryAssign('this_v', '_event.data')}`
    );
    expect(channelErrors(xml)).toHaveLength(1);
  });

  it.each([
    ['consistent bool', '<data id="this_v" expr="false"/>', transition('this_v')],
    ['int value in a double channel', '<data id="this_v" expr="0.0"/>', entryAssign('this_v', '5')],
    ['int compared in an int channel', '<data id="this_v" expr="0"/>', transition('this_v &gt; 5')],
    ['only an unknown use', '<data id="this_v" expr="false"/>', entryAssign('this_v', '_event.data')],
    ['non-literal initial value', '<data id="this_v" expr="Math.max(1, 2)"/>', transition('this_v')],
    ['conf_ variable', '<data id="conf_v" expr="0.0"/>', transition('conf_v')],
    ['plain variable', '<data id="v" expr="0.0"/>', transition('v')],
  ])('reports nothing for %s', (_label, data, body) => {
    expect(channelErrors(doc(`    ${data}`, body))).toEqual([]);
  });

  it('finds channels used inside a parallel region', () => {
    const body =
      '  <parallel id="P">\n    <state id="R1">\n      <transition target="R1b" cond="this_n == 1"/>\n    </state>\n    <state id="R1b"/>\n  </parallel>';
    const [error] = channelErrors(`${HEADER} initial="P">\n${body}\n</scxml>`);
    expect(error.message).toContain("the condition on 'R1' → 'R1b'");
  });
});
