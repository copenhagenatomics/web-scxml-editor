import { describe, it, expect } from 'vitest';
import { AddDataCommand } from './add-data-command';

const SCXML = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><state id="A"/></scxml>';

describe('AddDataCommand', () => {
  it('defaults the initial expr to 0 (int channel, existing behavior)', () => {
    const result = new AddDataCommand('this_counter').execute(SCXML);
    expect(result.success).toBe(true);
    expect(result.newContent).toMatch(/<data[^>]*id="this_counter"[^>]*expr="0"/);
  });

  it('uses an explicit initial expr for a bool channel', () => {
    const result = new AddDataCommand('this_something_alert', 'false').execute(SCXML);
    expect(result.success).toBe(true);
    expect(result.newContent).toMatch(/<data[^>]*id="this_something_alert"[^>]*expr="false"/);
  });

  it('uses an explicit initial expr for a double channel', () => {
    const result = new AddDataCommand('this_level', '0.0').execute(SCXML);
    expect(result.newContent).toMatch(/<data[^>]*id="this_level"[^>]*expr="0.0"/);
  });

  it('leaves an already-declared variable untouched', () => {
    const xml = '<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel><data id="this_x" expr="0"/></datamodel></scxml>';
    const result = new AddDataCommand('this_x', 'false').execute(xml);
    expect(result.newContent).toBe(xml);
  });

  it('undo removes the added data element', () => {
    const cmd = new AddDataCommand('this_flag', 'false');
    const added = cmd.execute(SCXML).newContent;
    const undone = cmd.undo(added).newContent;
    expect(undone).not.toContain('this_flag');
  });
});
