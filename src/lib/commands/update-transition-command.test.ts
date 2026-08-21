import { describe, it, expect } from 'vitest';
import { UpdateTransitionCommand } from './update-transition-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

describe('UpdateTransitionCommand', () => {
  it('clears an event-only transition to eventless via the index-based path, leaving no event or cond attribute', () => {
    const xml = `${SCXML_HEADER}><state id="A"><transition event="e1" target="B"/></state><state id="B"/></scxml>`;
    const result = new UpdateTransitionCommand('A', 'B', 'e1', undefined, '', 'none', 0).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('event=');
    expect(result.newContent).not.toContain('cond=');
    expect(result.newContent).toContain('target="B"');
  });

  it('clears a cond-only transition to eventless via the index-based path, leaving no event or cond attribute', () => {
    const xml = `${SCXML_HEADER}><state id="A"><transition cond="x&gt;1" target="B"/></state><state id="B"/></scxml>`;
    const result = new UpdateTransitionCommand('A', 'B', undefined, 'x>1', '', 'none', 0).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('event=');
    expect(result.newContent).not.toContain('cond=');
    expect(result.newContent).toContain('target="B"');
  });

  it('is a no-op success when clearing an already-eventless transition via the index-based path', () => {
    const xml = `${SCXML_HEADER}><state id="A"><transition target="B"/></state><state id="B"/></scxml>`;
    const result = new UpdateTransitionCommand('A', 'B', undefined, undefined, '', 'none', 0).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('event=');
    expect(result.newContent).not.toContain('cond=');
  });

  it('clears an event-only transition to eventless via the fallback attribute-matching path (no transitionIndex)', () => {
    const xml = `${SCXML_HEADER}><state id="A"><transition event="e1" target="B"/></state><state id="B"/></scxml>`;
    const result = new UpdateTransitionCommand('A', 'B', 'e1', undefined, '', 'none').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('event=');
    expect(result.newContent).not.toContain('cond=');
  });

  it('clears a cond-only transition to eventless via the fallback attribute-matching path (no transitionIndex)', () => {
    const xml = `${SCXML_HEADER}><state id="A"><transition cond="x&gt;1" target="B"/></state><state id="B"/></scxml>`;
    const result = new UpdateTransitionCommand('A', 'B', undefined, 'x>1', '', 'none').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('event=');
    expect(result.newContent).not.toContain('cond=');
  });

  it('sets an event on a previously eventless transition (existing event-field behavior, unaffected by the new none case)', () => {
    const xml = `${SCXML_HEADER}><state id="A"><transition target="B"/></state><state id="B"/></scxml>`;
    const result = new UpdateTransitionCommand('A', 'B', undefined, undefined, 'e1', 'event', 0).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('event="e1"');
  });
});
