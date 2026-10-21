import { describe, it, expect } from 'vitest';
import { UpdateDataExprCommand } from './update-data-expr-command';

const XML = '<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel><data id="this_x" expr="false"/></datamodel></scxml>';

describe('UpdateDataExprCommand', () => {
  it('changes the expr of an existing data element', () => {
    const result = new UpdateDataExprCommand('this_x', '0').execute(XML);
    expect(result.success).toBe(true);
    expect(result.newContent).toMatch(/<data[^>]*id="this_x"[^>]*expr="0"/);
  });

  it('is a no-op when the data element does not exist', () => {
    const result = new UpdateDataExprCommand('this_missing', '0').execute(XML);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe(XML);
  });

  it('is a no-op when the expr is already the requested value', () => {
    expect(new UpdateDataExprCommand('this_x', 'false').execute(XML).newContent).toBe(XML);
  });

  it('undo restores the previous expr', () => {
    const cmd = new UpdateDataExprCommand('this_x', '0.0');
    const changed = cmd.execute(XML).newContent;
    expect(cmd.undo(changed).newContent).toMatch(/<data[^>]*id="this_x"[^>]*expr="false"/);
  });

  it('undo fails before execute', () => {
    expect(new UpdateDataExprCommand('this_x', '0').undo(XML).success).toBe(false);
  });
});
