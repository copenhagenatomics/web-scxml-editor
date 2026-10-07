import { describe, it, expect } from 'vitest';
import { ReconnectTransitionCommand } from './reconnect-transition-command';

const HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

describe('ReconnectTransitionCommand with <final> states', () => {
  const xml = `${HEADER}><state id="A"><transition event="go" target="B"/></state><state id="B"/><final id="Done"/></scxml>`;

  it('can retarget a transition to a <final>', () => {
    const result = new ReconnectTransitionCommand('A', 'B', null, 'Done', 'go').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('target="Done"');
  });

  it("refuses to move a transition's source onto a <final>", () => {
    const result = new ReconnectTransitionCommand('A', 'B', 'Done', null, 'go').execute(xml);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/final state cannot have outgoing transitions/i);
    expect(result.newContent).toBe(xml);
  });
});
