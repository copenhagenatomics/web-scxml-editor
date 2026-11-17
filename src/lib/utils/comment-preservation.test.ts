import { describe, it, expect } from 'vitest';
import { restoreComments } from './comment-preservation';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { UpdateTransitionHandlesCommand } from '@/lib/commands';
import {
  findStateById,
  detachElementFromParent,
  addStateToDocument,
  addLooseStateToParallel,
  removeStateFromDocument,
} from './scxml-manipulation-utils';

const NS = 'xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

const TEMPLATE = `<scxml ${NS} datamodel="ecmascript" name="main" initial="main_region">
  <datamodel>
    <!-- Define variables, configuration values, and runtime data here -->
  </datamodel>
  <state id="main_region" viz:xywh="-77,-17,262,80">
    <!-- Add states, transitions, and logic inside this root state -->
  </state>
  <state id="state_1" viz:xywh="220,100,160,80"/>
</scxml>`;

/** Parse → mutate → serialize, the way the canvas's object-tree edits do. */
function edit(xml: string, mutate: (doc: any) => void): string {
  const parser = new SCXMLParser();
  const doc = parser.parse(xml).data!;
  mutate(doc);
  return parser.serialize(doc, true);
}

const pos = (xml: string, s: string) => {
  const i = xml.indexOf(s);
  expect(i, `missing: ${s}`).toBeGreaterThanOrEqual(0);
  return i;
};

describe('comments survive object-tree edits (SCXMLParser.serialize)', () => {
  it('drawing a transition keeps both template comments (reported bug)', () => {
    // Mirrors onConnect: push a <transition> on the source, serialize, then
    // persist handles with the DOM-based UpdateTransitionHandlesCommand.
    let xml = edit(TEMPLATE, (doc) => {
      findStateById(doc, 'main_region')!.transition = { '@_target': 'state_1' } as any;
    });
    xml = new UpdateTransitionHandlesCommand('main_region', 'state_1', undefined, undefined, 'bottom', 'left')
      .execute(xml).newContent;

    expect(xml).not.toContain('<datamodel/>');
    const dm = pos(xml, '<!-- Define variables');
    expect(dm).toBeGreaterThan(pos(xml, '<datamodel>'));
    expect(dm).toBeLessThan(pos(xml, '</datamodel>'));
    // The root-state comment stays inside main_region, ahead of the new transition.
    const c = pos(xml, '<!-- Add states');
    expect(c).toBeGreaterThan(pos(xml, 'id="main_region"'));
    expect(c).toBeLessThan(pos(xml, '<transition'));
    expect(xml).toMatch(/<transition target="state_1"[^>]*viz:sourceHandle="bottom"/);
  });

  it('adding a state (canvas Add State) keeps the template comments, ahead of the new state', () => {
    const xml = edit(TEMPLATE, (doc) => {
      findStateById(doc, 'main_region')!['@_initial'] = 'state_2';
      addStateToDocument(doc, { '@_id': 'state_2', '@_viz:xywh': '50,100,160,80' } as any, 'main_region');
    });
    expect(xml).toContain('<!-- Define variables');
    expect(xml).not.toContain('<datamodel/>');
    expect(pos(xml, '<!-- Add states')).toBeLessThan(pos(xml, 'id="state_2"'));
    expect(pos(xml, '<!-- Add states')).toBeGreaterThan(pos(xml, 'id="main_region"'));
  });

  it('a comment inside a state moves with it when the state is reparented', () => {
    const src = `<scxml ${NS} initial="A"><state id="A"><!-- about A --><state id="A1"/></state><state id="B"/></scxml>`;
    const xml = edit(src, (doc) => {
      const detached = detachElementFromParent(doc, 'A')!;
      addStateToDocument(doc, detached.element, 'B', detached.tag);
    });
    const c = pos(xml, '<!-- about A -->');
    expect(c).toBeGreaterThan(pos(xml, 'id="B"'));
    expect(c).toBeGreaterThan(pos(xml, 'id="A"'));
    expect(c).toBeLessThan(pos(xml, 'id="A1"'));
  });

  it('keeps a comment beside the element it preceded, and keeps consecutive comments in order', () => {
    const src = `<scxml ${NS} initial="A"><state id="A"/><!-- one --><!-- two --><state id="B"/><!-- tail --></scxml>`;
    const xml = edit(src, (doc) => {
      addStateToDocument(doc, { '@_id': 'C' } as any);
    });
    expect(pos(xml, '<!-- one -->')).toBeGreaterThan(pos(xml, 'id="A"'));
    expect(pos(xml, '<!-- two -->')).toBeGreaterThan(pos(xml, '<!-- one -->'));
    expect(pos(xml, 'id="B"')).toBeGreaterThan(pos(xml, '<!-- two -->'));
    // "tail" followed B, so it stays right after B, ahead of the appended C.
    expect(pos(xml, '<!-- tail -->')).toBeGreaterThan(pos(xml, 'id="B"'));
    expect(pos(xml, '<!-- tail -->')).toBeLessThan(pos(xml, 'id="C"'));
  });

  it('drops a comment together with the state it was inside when that state is deleted', () => {
    const src = `<scxml ${NS} initial="A"><state id="A"/><state id="Gone"><!-- bye --></state><!-- keep --></scxml>`;
    const xml = edit(src, (doc) => removeStateFromDocument(doc, 'Gone'));
    expect(xml).not.toContain('bye');
    expect(xml).toContain('<!-- keep -->');
  });

  it('follows a <parallel> that is re-tagged as a <state> (matched by id)', () => {
    const src = `<scxml ${NS} initial="P"><parallel id="P"><!-- regions --><state id="R1"/><state id="R2"/></parallel></scxml>`;
    const xml = edit(src, (doc) => addLooseStateToParallel(doc, 'P', { '@_id': 'New' } as any));
    expect(xml).toMatch(/<state id="P"/);
    expect(pos(xml, '<!-- regions -->')).toBeGreaterThan(pos(xml, 'id="P"'));
  });

  it('keeps comments inside id-less elements (onentry) and around the root', () => {
    const src = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- header -->\n<scxml ${NS} initial="A"><state id="A"><onentry><!-- greet --><log expr="'hi'"/></onentry></state></scxml>`;
    const xml = edit(src, (doc) => {
      (findStateById(doc, 'A') as any)['@_viz:xywh'] = '1,2,3,4';
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(pos(xml, '<!-- header -->')).toBeLessThan(pos(xml, '<scxml'));
    const g = pos(xml, '<!-- greet -->');
    expect(g).toBeGreaterThan(pos(xml, '<onentry>'));
    expect(g).toBeLessThan(pos(xml, '<log'));
  });

  it('also keeps comments in the clean (no viz:) export', () => {
    const parser = new SCXMLParser();
    const clean = parser.serialize(parser.parse(TEMPLATE).data!, false);
    expect(clean).toContain('<!-- Define variables');
    expect(clean).not.toContain('viz:');
  });

  it('leaves output untouched when the source had no comments', () => {
    const src = `<scxml ${NS} initial="A"><state id="A"/></scxml>`;
    const parser = new SCXMLParser();
    const doc = parser.parse(src).data!;
    const viaBuilder = parser.getVisualMetadataManager().serializeWithVisualMetadata(doc, {
      includeVisualMetadata: true,
      formatOutput: true,
      validate: true,
    });
    expect(parser.serialize(parser.parse(src).data!, true)).toBe(viaBuilder);
  });
});

describe('SCXMLParser.parse with a text-only root', () => {
  it('does not throw (the root parses to a string, not an object)', () => {
    const result = new SCXMLParser().parse('<scxml>raw</scxml><!--c-->');
    expect(result.data?.scxml).toBe('raw');
  });
});

describe('restoreComments', () => {
  it('is a no-op when the rebuilt XML already has comments or does not parse', () => {
    expect(restoreComments('<a><!--x--></a>', '<a><!--y--></a>')).toBe('<a><!--y--></a>');
    expect(restoreComments('<a><!--x--></a>', '<a>')).toBe('<a>');
  });
});
