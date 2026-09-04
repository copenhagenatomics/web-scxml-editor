import { describe, it, expect } from 'vitest';
import { AddAnchorPointCommand } from './add-anchor-point-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';
const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

describe('AddAnchorPointCommand', () => {
  it('creates viz:anchors with count 2 the first time a side gains an anchor', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const result = new AddAnchorPointCommand('A', 'bottom').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('viz:anchors="bottom:2"');
  });

  it('increments an existing count for the same side, leaving other sides untouched', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:2;right:3"/></scxml>`;
    const result = new AddAnchorPointCommand('A', 'bottom').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('bottom:3');
    expect(result.newContent).toContain('right:3');
  });

  it('adds a new side to an existing viz:anchors attribute', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:2"/></scxml>`;
    const result = new AddAnchorPointCommand('A', 'top').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('bottom:2');
    expect(result.newContent).toContain('top:2');
  });

  it('fails without modifying content once a side reaches the maximum of 6 anchors', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:6"/></scxml>`;
    const result = new AddAnchorPointCommand('A', 'bottom').execute(xml);
    expect(result.success).toBe(false);
    expect(result.newContent).toBe(xml);
  });

  it('fails when the state does not exist', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const result = new AddAnchorPointCommand('missing', 'bottom').execute(xml);
    expect(result.success).toBe(false);
  });

  it('undo removes the attribute entirely when the side had no prior anchors', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const command = new AddAnchorPointCommand('A', 'bottom');
    const afterExecute = command.execute(xml);
    const afterUndo = command.undo(afterExecute.newContent);
    expect(afterUndo.success).toBe(true);
    expect(afterUndo.newContent).not.toContain('viz:anchors');
  });

  it('undo restores the prior count when a side already had anchors', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:2"/></scxml>`;
    const command = new AddAnchorPointCommand('A', 'bottom');
    const afterExecute = command.execute(xml);
    expect(afterExecute.newContent).toContain('bottom:3');
    const afterUndo = command.undo(afterExecute.newContent);
    expect(afterUndo.success).toBe(true);
    expect(afterUndo.newContent).toContain('bottom:2');
  });
});
