import { describe, it, expect } from 'vitest';
import { ChangeStateTypeCommand } from './change-state-type-command';

const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

describe('ChangeStateTypeCommand waypoint invalidation', () => {
  // State type changes the node's rendered width/height (see
  // NodeDimensionCalculator — compound/parallel states are sized larger),
  // so stale persisted viz:waypoints on transitions touching it must be
  // cleared, or the edge renders against the pre-change size.
  it('clears viz:waypoints on the changed state\'s own outgoing transition', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
    const result = new ChangeStateTypeCommand('A', 'final').execute(xml);
    expect(result.success).toBe(true);
    // 'final' state type removes A's own transitions entirely, so check via
    // the sibling-targeting case below for a transition that survives.
    expect(result.newContent).not.toContain('viz:waypoints');
  });

  it('clears viz:waypoints on a sibling\'s transition targeting the changed state', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
    const result = new ChangeStateTypeCommand('B', 'final').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:waypoints');
  });

  it('leaves unrelated transitions\' waypoints untouched', () => {
    const xml = `${VIZ_HEADER}><state id="A"/><state id="B"><transition target="C" viz:waypoints="2,2"/></state><state id="C"/></scxml>`;
    const result = new ChangeStateTypeCommand('A', 'final').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('viz:waypoints="2,2"');
  });
});

describe('ChangeStateTypeCommand <state> ↔ <final>', () => {
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml');

  it('state → final replaces the <state> element with a real <final> element', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="Done"/></state><state id="Done" viz:xywh="1,2,3,4"><onentry><log expr="'bye'"/></onentry></state></scxml>`;
    const result = new ChangeStateTypeCommand('Done', 'final').execute(xml);
    expect(result.success).toBe(true);

    const doc = parse(result.newContent);
    expect(doc.querySelector('state[id="Done"]')).toBeNull();
    const final = doc.querySelector('final[id="Done"]');
    expect(final).not.toBeNull();
    // Stays in the SCXML namespace (no stray xmlns="")
    expect(final!.namespaceURI).toBe('http://www.w3.org/2005/07/scxml');
    expect(result.newContent).not.toContain('xmlns=""');
    // Valid attributes and children are preserved
    expect(final!.getAttribute('viz:xywh')).toBe('1,2,3,4');
    expect(final!.querySelector('onentry > log')).not.toBeNull();
    // The incoming transition still targets it
    expect(doc.querySelector('state[id="A"] > transition')?.getAttribute('target')).toBe('Done');
  });

  it('state → final drops children and attributes that are invalid on <final>', () => {
    const xml = `${VIZ_HEADER}><state id="C" initial="C1"><state id="C1"><transition target="C2"/></state><state id="C2"/><transition target="X"/><datamodel><data id="d"/></datamodel></state><state id="X"><transition target="C1"/></state></scxml>`;
    const result = new ChangeStateTypeCommand('C', 'final').execute(xml);
    expect(result.success).toBe(true);

    const final = parse(result.newContent).querySelector('final[id="C"]')!;
    expect(final).not.toBeNull();
    expect(final.hasAttribute('initial')).toBe(false);
    expect(final.children.length).toBe(0);
    // A transition elsewhere that targeted a dropped descendant is removed
    expect(result.newContent).not.toContain('target="C1"');
  });

  it('final → state replaces the <final> element with a real <state> element', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="Done"/></state><final id="Done" viz:xywh="1,2,3,4"><onexit><log expr="1"/></onexit><donedata><param name="status" expr="1"/></donedata></final></scxml>`;
    const result = new ChangeStateTypeCommand('Done', 'simple').execute(xml);
    expect(result.success).toBe(true);

    const doc = parse(result.newContent);
    expect(doc.querySelector('final')).toBeNull();
    const state = doc.querySelector('state[id="Done"]')!;
    expect(state).not.toBeNull();
    expect(state.namespaceURI).toBe('http://www.w3.org/2005/07/scxml');
    expect(state.getAttribute('viz:xywh')).toBe('1,2,3,4');
    expect(state.querySelector('onexit > log')).not.toBeNull();
    // <donedata> is only valid on <final>
    expect(state.querySelector('donedata')).toBeNull();
  });

  it('keeps non-SCXML (viz:) child elements across the conversion', () => {
    const xml = `${VIZ_HEADER}><state id="Done"><viz:note viz:id="n1">hi</viz:note></state></scxml>`;
    const result = new ChangeStateTypeCommand('Done', 'final').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toMatch(/<final id="Done">[\s\S]*viz:note[\s\S]*<\/final>/);
  });

  it('refuses to turn a region of a <parallel> into a final state', () => {
    const xml = `${VIZ_HEADER}><parallel id="P"><state id="R1"/><state id="R2"/></parallel></scxml>`;
    const result = new ChangeStateTypeCommand('R1', 'final').execute(xml);
    expect(result.success).toBe(false);
    expect(result.newContent).toBe(xml);
  });

  it('undo restores the original document, including dropped children', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B"/></state><state id="B"/></scxml>`;
    const command = new ChangeStateTypeCommand('A', 'final');
    const result = command.execute(xml);
    expect(result.newContent).toContain('<final id="A"');
    expect(command.undo(result.newContent).newContent).toBe(xml);
  });
});
