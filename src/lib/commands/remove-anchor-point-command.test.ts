import { describe, it, expect } from 'vitest';
import {
  RemoveAnchorPointCommand,
  ANCHOR_IN_USE_MESSAGE,
  LAST_ANCHOR_MESSAGE,
} from './remove-anchor-point-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';
const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

const attrOf = (xml: string, transitionEvent: string, attr: string) => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const t = Array.from(doc.getElementsByTagName('transition')).find(
    (el) => el.getAttribute('event') === transitionEvent
  );
  return t?.getAttribute(attr) ?? null;
};

describe('RemoveAnchorPointCommand', () => {
  it('decrements the count, dropping the side from viz:anchors at 1', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:2;right:3"/></scxml>`;
    const result = new RemoveAnchorPointCommand('A', 'bottom', 1).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('viz:anchors="right:3"');
  });

  it('removes the attribute entirely when the last extra anchor goes', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="top:2"/></scxml>`;
    const result = new RemoveAnchorPointCommand('A', 'top', 0).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:anchors');
  });

  it("refuses to remove a side's only connection point", () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const result = new RemoveAnchorPointCommand('A', 'bottom', 0).execute(xml);
    expect(result.success).toBe(false);
    expect(result.error).toBe(LAST_ANCHOR_MESSAGE);
    expect(result.newContent).toBe(xml);
  });

  it('refuses an index outside the side', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:2"/></scxml>`;
    expect(new RemoveAnchorPointCommand('A', 'bottom', 2).execute(xml).success).toBe(false);
  });

  it('refuses when an outgoing transition is attached to the anchor', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:3"><transition event="go" target="B" viz:sourceHandle="bottom-1"/></state><state id="B"/></scxml>`;
    const result = new RemoveAnchorPointCommand('A', 'bottom', 1).execute(xml);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ANCHOR_IN_USE_MESSAGE);
    expect(result.newContent).toBe(xml);
  });

  it('refuses when an incoming transition is attached to the anchor', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition event="go" target="B" viz:targetHandle="top"/></state><state id="B" viz:anchors="top:2"/></scxml>`;
    const result = new RemoveAnchorPointCommand('B', 'top', 0).execute(xml);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ANCHOR_IN_USE_MESSAGE);
  });

  it("ignores another state's handle with the same id", () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:2"><transition event="go" target="B" viz:sourceHandle="bottom" viz:targetHandle="bottom-1"/></state><state id="B" viz:anchors="bottom:2"/></scxml>`;
    // A's bottom (index 0) is in use, but A's bottom-1 is not — B's is.
    expect(new RemoveAnchorPointCommand('A', 'bottom', 1).execute(xml).success).toBe(true);
  });

  it('shifts higher-index handles on the same side down so they keep their point', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:4;right:2">
      <transition event="e0" target="B" viz:sourceHandle="bottom"/>
      <transition event="e2" target="B" viz:sourceHandle="bottom-2"/>
      <transition event="e3" target="B" viz:sourceHandle="bottom-3"/>
      <transition event="r1" target="B" viz:sourceHandle="right-1"/>
    </state><state id="B"><transition event="in" target="A" viz:targetHandle="bottom-3"/></state></scxml>`;
    const result = new RemoveAnchorPointCommand('A', 'bottom', 1).execute(xml);
    expect(result.success).toBe(true);
    const out = result.newContent;
    expect(out).toContain('bottom:3');
    expect(attrOf(out, 'e0', 'viz:sourceHandle')).toBe('bottom');
    expect(attrOf(out, 'e2', 'viz:sourceHandle')).toBe('bottom-1');
    expect(attrOf(out, 'e3', 'viz:sourceHandle')).toBe('bottom-2');
    expect(attrOf(out, 'r1', 'viz:sourceHandle')).toBe('right-1');
    expect(attrOf(out, 'in', 'viz:targetHandle')).toBe('bottom-2');
  });

  it('removing index 0 promotes the next anchor to the bare side id', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="left:2"><transition event="go" target="B" viz:sourceHandle="left-1"/></state><state id="B"/></scxml>`;
    const result = new RemoveAnchorPointCommand('A', 'left', 0).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:anchors');
    expect(attrOf(result.newContent, 'go', 'viz:sourceHandle')).toBe('left');
  });

  it('undo restores the count and every renamed handle', () => {
    const xml = `${VIZ_HEADER}><state id="A" viz:anchors="bottom:3"><transition event="go" target="B" viz:sourceHandle="bottom-2"/></state><state id="B"/></scxml>`;
    const command = new RemoveAnchorPointCommand('A', 'bottom', 0);
    const afterExecute = command.execute(xml);
    expect(attrOf(afterExecute.newContent, 'go', 'viz:sourceHandle')).toBe('bottom-1');
    const afterUndo = command.undo(afterExecute.newContent);
    expect(afterUndo.success).toBe(true);
    expect(afterUndo.newContent).toContain('bottom:3');
    expect(attrOf(afterUndo.newContent, 'go', 'viz:sourceHandle')).toBe('bottom-2');
  });

  it('fails when the state does not exist', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    expect(new RemoveAnchorPointCommand('missing', 'bottom', 0).execute(xml).success).toBe(false);
  });
});
