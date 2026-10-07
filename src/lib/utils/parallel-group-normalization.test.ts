import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { normalizeParallelGroups, collectParallelGroups, hasAnyChildren } from './parallel-group-normalization';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import {
  addStateToDocument,
  cloneStateSubtreeWithFreshIds,
  resolveCarriedOverInitialIds,
} from './scxml-manipulation-utils';

function ids(states: any): string[] {
  if (!states) return [];
  const arr = Array.isArray(states) ? states : [states];
  return arr.map((s) => s['@_id']);
}

function one(v: any): any {
  return Array.isArray(v) ? v[0] : v;
}

const HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

function normalizeXml(xml: string): { changed: boolean; out: string; doc: SCXMLDocument } {
  const parser = new SCXMLParser();
  const doc = parser.parse(xml).data!;
  const { changed } = normalizeParallelGroups(doc);
  return { changed, out: parser.serialize(doc, true), doc };
}

describe('normalizeParallelGroups — compound state becomes the <parallel>', () => {
  it('converts a compound state with 2+ Initial work trees into a <parallel> with the same id, keeping its transitions and actions', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'Parent',
        state: [
          {
            '@_id': 'Parent',
            '@_initial': 'X Y',
            '@_viz:xywh': '1,2,3,4',
            transition: { '@_event': 'done', '@_target': 'Other' },
            onentry: { log: { '@_expr': "'hi'" } },
            state: [{ '@_id': 'X' }, { '@_id': 'Y' }],
          },
          { '@_id': 'Other' },
        ],
      } as any,
    };
    expect(normalizeParallelGroups(d).changed).toBe(true);

    expect(ids(d.scxml.state)).toEqual(['Other']);
    const parent = one(d.scxml.parallel);
    expect(parent['@_id']).toBe('Parent');
    expect(parent['@_initial']).toBeUndefined();
    expect(parent['@_viz:xywh']).toBe('1,2,3,4');
    expect(parent.transition['@_target']).toBe('Other');
    expect(parent.onentry).toBeDefined();
    expect(ids(parent.state).sort()).toEqual(['X_region', 'Y_region']);
    expect(d.scxml['@_initial']).toBe('Parent');
  });

  it('writes no marker attributes and no <state> wrapper above the <parallel>', () => {
    const { out } = normalizeXml(
      `${HEADER} initial="main_region"><state id="main_region" initial="A B"><state id="A"/><state id="B"/></state></scxml>`,
    );
    expect(out).toMatch(/<parallel id="main_region"/);
    expect(out).not.toMatch(/<state id="main_region"/);
    expect(out).not.toMatch(/viz:auto-/);
  });

  it('is stable when the converted document is re-parsed', () => {
    const { out } = normalizeXml(
      `${HEADER} initial="main_region"><state id="main_region" initial="A B"><state id="A"/><state id="B"/></state></scxml>`,
    );
    expect(normalizeXml(out).changed).toBe(false);
  });

  it('wraps each work tree in its own {initial}_region, including a single-member one', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: {
          '@_id': 'P',
          '@_initial': 'A C',
          state: [
            { '@_id': 'A', transition: { '@_target': 'B' } },
            { '@_id': 'B' },
            { '@_id': 'C' },
          ],
        },
      } as any,
    };
    normalizeParallelGroups(d);
    const regions = one(d.scxml.parallel).state as any[];
    const aRegion = regions.find((r) => r['@_id'] === 'A_region');
    expect(aRegion['@_initial']).toBe('A');
    expect(ids(aRegion.state).sort()).toEqual(['A', 'B']);
    const cRegion = regions.find((r) => r['@_id'] === 'C_region');
    expect(cRegion['@_initial']).toBe('C');
    expect(ids(cRegion.state)).toEqual(['C']);
  });

  it('keeps children outside any work tree loose beside an inner {id}__parallel instead of giving them a region', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: {
          '@_id': 'P',
          '@_initial': 'A B',
          state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'Loose' }],
        },
      } as any,
    };
    normalizeParallelGroups(d);
    const p = one(d.scxml.state);
    expect(p['@_id']).toBe('P');
    expect(p['@_initial']).toBe('P__parallel');
    expect(ids(p.state)).toEqual(['Loose']);
    const inner = one(p.parallel);
    expect(inner['@_id']).toBe('P__parallel');
    expect(ids(inner.state).sort()).toEqual(['A_region', 'B_region']);
    expect(normalizeParallelGroups(d).changed).toBe(false);
  });

  it('wraps a <parallel> child that belongs to a work tree under the region\'s <parallel> children', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: {
          '@_id': 'P',
          '@_initial': 'Q B',
          state: { '@_id': 'B' },
          parallel: { '@_id': 'Q', state: [{ '@_id': 'Q1' }, { '@_id': 'Q2' }] },
        },
      } as any,
    };
    normalizeParallelGroups(d);
    const regions = one(d.scxml.parallel).state as any[];
    const qRegion = regions.find((r) => r['@_id'] === 'Q_region');
    expect(qRegion.state).toBeUndefined();
    expect(one(qRegion.parallel)['@_id']).toBe('Q');
  });

  it('does not convert a state with <final> children (the validator reports it instead)', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: {
          '@_id': 'P',
          '@_initial': 'A B',
          state: [{ '@_id': 'A' }, { '@_id': 'B' }],
          final: { '@_id': 'Done' },
        },
      } as any,
    };
    expect(normalizeParallelGroups(d).changed).toBe(false);
    expect(one(d.scxml.state)['@_id']).toBe('P');
    expect(d.scxml.parallel).toBeUndefined();
  });

  it('leaves a compound state with a single work tree alone', () => {
    const d: SCXMLDocument = {
      scxml: { state: { '@_id': 'P', '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } } as any,
    };
    const before = JSON.stringify(d);
    expect(normalizeParallelGroups(d).changed).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('converts a compound state nested inside a region (bottom-up)', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: {
          '@_id': 'Outer',
          '@_initial': 'A B',
          state: [
            { '@_id': 'A', '@_initial': 'A1 A2', state: [{ '@_id': 'A1' }, { '@_id': 'A2' }] },
            { '@_id': 'B' },
          ],
        },
      } as any,
    };
    normalizeParallelGroups(d);
    const outer = one(d.scxml.parallel);
    expect(outer['@_id']).toBe('Outer');
    const aRegion = (outer.state as any[]).find((r) => r['@_id'] === 'A_region');
    expect(one(aRegion.parallel)['@_id']).toBe('A');
    expect(ids(one(aRegion.parallel).state).sort()).toEqual(['A1_region', 'A2_region']);
    expect(normalizeParallelGroups(d).changed).toBe(false);
  });

  it('does not reuse an id already taken elsewhere in the document', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'P', '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] },
          { '@_id': 'A_region' },
        ],
        final: { '@_id': 'B_region' },
      } as any,
    };
    normalizeParallelGroups(d);
    const regionIds = ids(one(d.scxml.parallel).state).sort();
    expect(regionIds).toEqual(['A_region_2', 'B_region_2']);
  });
});

describe('normalizeParallelGroups — <parallel> back to <state>', () => {
  it('turns a <parallel> with a single region back into a <state>, keeping the region as its initial child', () => {
    const { changed, doc } = normalizeXml(
      `${HEADER} initial="P"><parallel id="P"><state id="A_region" initial="A"><state id="A"/></state></parallel></scxml>`,
    );
    expect(changed).toBe(true);
    expect(doc.scxml.parallel).toBeUndefined();
    const p = one(doc.scxml.state);
    expect(p['@_id']).toBe('P');
    expect(p['@_initial']).toBe('A_region');
    expect(ids(p.state)).toEqual(['A_region']);
  });

  it('treats a hand-written <parallel> exactly the same — 2+ regions stay, fewer revert', () => {
    const kept = normalizeXml(
      `${HEADER}><parallel id="Motor"><state id="Speed"/><state id="Heater"/></parallel></scxml>`,
    );
    expect(kept.changed).toBe(false);

    const reverted = normalizeXml(`${HEADER}><parallel id="Motor"><state id="Speed"/></parallel></scxml>`);
    expect(reverted.changed).toBe(true);
    expect(one(reverted.doc.scxml.state)['@_id']).toBe('Motor');
  });

  it('reverts an empty <parallel> to an empty <state>', () => {
    const { doc } = normalizeXml(`${HEADER}><parallel id="P"/></scxml>`);
    expect(one(doc.scxml.state)['@_id']).toBe('P');
    expect(one(doc.scxml.state)['@_initial']).toBeUndefined();
  });
});

describe('normalizeParallelGroups — root level (__root_parallel)', () => {
  it('reports no change for a document with zero or one Initial work tree', () => {
    const none: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    expect(normalizeParallelGroups(none).changed).toBe(false);
    const single: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    expect(normalizeParallelGroups(single).changed).toBe(false);
    expect(single.scxml.parallel).toBeUndefined();
  });

  it('wraps 2+ root-level work trees into __root_parallel, leaving unassigned siblings at the root', () => {
    const d: SCXMLDocument = {
      scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'Loose' }] } as any,
    };
    expect(normalizeParallelGroups(d).changed).toBe(true);
    expect(ids(d.scxml.state)).toEqual(['Loose']);
    const rp = one(d.scxml.parallel);
    expect(rp['@_id']).toBe('__root_parallel');
    expect(d.scxml['@_initial']).toBe('__root_parallel');
    expect(ids(rp.state).sort()).toEqual(['A_region', 'B_region']);
  });

  it('adds a newly marked root-level work tree as another region', () => {
    const { doc } = normalizeXml(
      `${HEADER} initial="__root_parallel C"><parallel id="__root_parallel"><state id="A_region" initial="A"><state id="A"/></state><state id="B_region" initial="B"><state id="B"/></state></parallel><state id="C"/></scxml>`,
    );
    expect(doc.scxml.state).toBeUndefined();
    expect(ids(one(doc.scxml.parallel).state).sort()).toEqual(['A_region', 'B_region', 'C_region']);
    expect(doc.scxml['@_initial']).toBe('__root_parallel');
  });

  it('removes __root_parallel once only one region is left, moving the region back to the root as it is', () => {
    const { changed, doc } = normalizeXml(
      `${HEADER} initial="__root_parallel"><parallel id="__root_parallel"><state id="A_region" initial="A"><state id="A"/></state></parallel></scxml>`,
    );
    expect(changed).toBe(true);
    expect(doc.scxml.parallel).toBeUndefined();
    expect(ids(doc.scxml.state)).toEqual(['A_region']);
    expect(doc.scxml['@_initial']).toBe('A_region');
  });

  it('claims a suffixed root id when __root_parallel is already taken', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': 'A B',
        state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'Other', state: { '@_id': '__root_parallel' } }],
      } as any,
    };
    normalizeParallelGroups(d);
    expect(one(d.scxml.parallel)['@_id']).toBe('__root_parallel_2');
    expect(normalizeParallelGroups(d).changed).toBe(false);
  });
});

describe('normalizeParallelGroups — __root_parallel is only special directly under <scxml>', () => {
  const NESTED = `${HEADER} initial="Outer"><state id="Outer" initial="__root_parallel"><parallel id="__root_parallel"><state id="R1"/><state id="R2"/></parallel></state></scxml>`;

  it('treats a nested <parallel> that happens to be named __root_parallel as an ordinary <parallel>', () => {
    const { changed, doc } = normalizeXml(NESTED);
    expect(changed).toBe(false);
    const outer = one(doc.scxml.state);
    expect(one(outer.parallel)['@_id']).toBe('__root_parallel');
    expect(ids(one(outer.parallel).state)).toEqual(['R1', 'R2']);
  });

  it('reports it as an ordinary group (drawn inside itself, not at root level)', () => {
    const { doc } = normalizeXml(NESTED);
    const [group] = collectParallelGroups(doc);
    expect(group.containerId).toBe('__root_parallel');
    expect(group.parallelId).toBe('__root_parallel__parallel_group');
  });

  it('still reverts it like any other <parallel> once it has a single region', () => {
    const { changed, doc } = normalizeXml(
      `${HEADER} initial="Outer"><state id="Outer" initial="__root_parallel"><parallel id="__root_parallel"><state id="R1"/></parallel></state></scxml>`,
    );
    expect(changed).toBe(true);
    const outer = one(doc.scxml.state);
    expect(outer.parallel).toBeUndefined();
    expect(one(outer.state)['@_id']).toBe('__root_parallel');
  });
});

describe('normalizeParallelGroups — migrating documents from older versions', () => {
  it('strips viz:auto-* markers', () => {
    const { changed, out } = normalizeXml(
      `${HEADER} initial="__root_parallel"><parallel id="__root_parallel" viz:auto-parallel="true"><state id="A_region" initial="A" viz:auto-region="true"><state id="A"/></state><state id="B_region" initial="B" viz:auto-region="true"><state id="B"/></state></parallel></scxml>`,
    );
    expect(changed).toBe(true);
    expect(out).not.toMatch(/viz:auto-/);
    expect(out).toMatch(/<parallel id="__root_parallel"/);
  });

  it('collapses an older <state> wrapper around its nested auto <parallel> so the state itself is the <parallel>', () => {
    const { changed, doc, out } = normalizeXml(
      `${HEADER} initial="main_region"><state id="main_region" initial="main_region_parallel"><transition event="go" target="main_region"/><parallel id="main_region_parallel" viz:auto-parallel="true"><state id="A_region" initial="A" viz:auto-region="true"><state id="A"/></state><state id="B_region" initial="B" viz:auto-region="true"><state id="B"/></state></parallel></state></scxml>`,
    );
    expect(changed).toBe(true);
    const main = one(doc.scxml.parallel);
    expect(main['@_id']).toBe('main_region');
    expect(main['@_initial']).toBeUndefined();
    expect(main.transition['@_target']).toBe('main_region');
    expect(ids(main.state).sort()).toEqual(['A_region', 'B_region']);
    expect(doc.scxml.state).toBeUndefined();
    expect(out).not.toMatch(/main_region_parallel/);
    expect(normalizeXml(out).changed).toBe(false);
  });
});

describe('collectParallelGroups', () => {
  it('returns nothing for a document with no <parallel>', () => {
    const d: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    expect(collectParallelGroups(d)).toEqual([]);
  });

  it('reports a <parallel> with the contents of each region as its column members', () => {
    const d: SCXMLDocument = {
      scxml: { state: { '@_id': 'P', '@_initial': 'X Y', state: [{ '@_id': 'X' }, { '@_id': 'Y' }] } } as any,
    };
    normalizeParallelGroups(d);
    const [group] = collectParallelGroups(d);
    expect(group.containerId).toBe('P');
    expect(group.parallelId).toBe('P__parallel_group');
    expect(group.regions.map((r) => r.memberIds).sort()).toEqual([['X'], ['Y']]);
  });

  it('uses the region itself as the member when the region is empty or is itself a <parallel>', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'P',
          state: { '@_id': 'Empty' },
          parallel: { '@_id': 'Q', state: [{ '@_id': 'Q1' }, { '@_id': 'Q2' }] },
        },
      } as any,
    };
    const group = collectParallelGroups(d).find((g) => g.containerId === 'P')!;
    expect(group.regions.map((r) => r.memberIds).sort()).toEqual([['Empty'], ['Q']]);
  });

  it('gives the wrapper key a suffix when a state already uses {id}__parallel_group', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'P',
          state: [
            { '@_id': 'R1', state: { '@_id': 'P__parallel_group' } },
            { '@_id': 'R2' },
          ],
        },
      } as any,
    };
    const [group] = collectParallelGroups(d);
    expect(group.parallelId).toBe('P__parallel_group_2');
  });

  it('reports __root_parallel at the root level (containerId null)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    normalizeParallelGroups(d);
    const [group] = collectParallelGroups(d);
    expect(group.containerId).toBeNull();
    expect(group.parallelId).toBe('__root_parallel');
  });

  it('finds nested <parallel>s at any depth, including hand-written ones', () => {
    const d: SCXMLDocument = {
      scxml: {
        parallel: {
          '@_id': 'Outer',
          state: [
            { '@_id': 'R1', parallel: { '@_id': 'Inner', state: [{ '@_id': 'I1' }, { '@_id': 'I2' }] } },
            { '@_id': 'R2' },
          ],
        },
      } as any,
    };
    expect(collectParallelGroups(d).map((g) => g.containerId).sort()).toEqual(['Inner', 'Outer']);
  });
});

describe('hasAnyChildren', () => {
  it('is false for a container with no state and no parallel children', () => {
    expect(hasAnyChildren({} as any)).toBe(false);
  });

  it('is true for a container with a <state> or a <parallel> child', () => {
    expect(hasAnyChildren({ state: [{ '@_id': 'A' }] } as any)).toBe(true);
    expect(hasAnyChildren({ parallel: { '@_id': 'P', state: [{ '@_id': 'A' }] } } as any)).toBe(true);
  });

  it('is true for the root once its children have moved into __root_parallel', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    normalizeParallelGroups(d);
    expect(d.scxml.state).toBeUndefined();
    expect(hasAnyChildren(d.scxml)).toBe(true);
  });
});

describe('copy/cut + paste of parallel regions (end-to-end with the paste pipeline)', () => {
  it('pasting 2+ regions carried over as Initial into an empty state turns that state into a <parallel>', () => {
    const d: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'P', '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] },
          { '@_id': 'Target' },
        ],
      } as any,
    };
    normalizeParallelGroups(d);
    const source = one(d.scxml.parallel);
    // The copy flow carries regions of a parallel over as Initial.
    const copied = (source.state as any[]).map((r) => JSON.parse(JSON.stringify(r)));
    const copiedInitialIds = new Set(copied.map((s) => s['@_id']));

    const existingIds = new Set(['P', 'Target', 'A', 'B', ...copied.map((s) => s['@_id'])]);
    const combinedIdMap = new Map<string, string>();
    const clones = copied.map((state) => {
      const { clone, idMap } = cloneStateSubtreeWithFreshIds(state, existingIds, 0, 0);
      idMap.forEach((newId, oldId) => combinedIdMap.set(oldId, newId));
      return clone;
    });
    const target = one(d.scxml.state);
    clones.forEach((clone) => addStateToDocument(d, clone, 'Target'));
    target['@_initial'] = resolveCarriedOverInitialIds(copied, copiedInitialIds, combinedIdMap, true).join(' ');

    expect(normalizeParallelGroups(d).changed).toBe(true);
    const parallels = Array.isArray(d.scxml.parallel) ? d.scxml.parallel : [d.scxml.parallel];
    expect(parallels).toContain(target);
    expect((target.state as any[]).length).toBe(2);
  });
});

describe('normalizeParallelGroups — loose states', () => {
  // The reported flow: state_1 (Initial) -> state_2, then state_3 marked
  // Initial, with state_4 unconnected.
  const compound = () => `${HEADER} initial="P">
  <state id="P" initial="state_1 state_3">
    <state id="state_1"><transition event="go" target="state_2"/></state>
    <state id="state_2"/>
    <state id="state_3"/>
    <state id="state_4"/>
  </state>
</scxml>`;

  it('leaves the unconnected state loose: no region of its own, not Initial', () => {
    const { doc } = normalizeXml(compound());
    const p = one(doc.scxml.state);
    expect(ids(p.state)).toEqual(['state_4']);
    expect(p['@_initial']).toBe('P__parallel');
    const regions = one(p.parallel).state as any[];
    expect(ids(regions).sort()).toEqual(['state_1_region', 'state_3_region']);
    expect(regions.some((r) => ids(r.state).includes('state_4'))).toBe(false);
    expect(collectParallelGroups(doc)).toEqual([
      {
        containerId: 'P',
        parallelId: 'P__parallel',
        regions: [{ memberIds: ['state_1', 'state_2'] }, { memberIds: ['state_3'] }],
      },
    ]);
  });

  it('connecting a region member to the loose state moves it into that region, and P becomes the <parallel> again', () => {
    const parser = new SCXMLParser();
    const doc = normalizeXml(compound()).doc;
    // Draw state_3 -> state_4 on the canvas.
    const p = one(doc.scxml.state);
    const region3 = (one(p.parallel).state as any[]).find((r) => r['@_id'] === 'state_3_region');
    region3.state.transition = { '@_event': 'next', '@_target': 'state_4' };
    const reparsed = parser.parse(parser.serialize(doc, true)).data!;
    normalizeParallelGroups(reparsed);

    expect(reparsed.scxml.state).toBeUndefined();
    const parallel = one(reparsed.scxml.parallel);
    expect(parallel['@_id']).toBe('P');
    const regions = parallel.state as any[];
    expect(ids(regions.find((r) => r['@_id'] === 'state_3_region').state).sort()).toEqual(['state_3', 'state_4']);
    expect(ids(regions.find((r) => r['@_id'] === 'state_1_region').state).sort()).toEqual(['state_1', 'state_2']);
  });

  it('pulls a chain of loose states in together, and keeps a loose state touching two regions loose', () => {
    const xml = `${HEADER} initial="P">
  <state id="P" initial="P__parallel">
    <parallel id="P__parallel">
      <state id="a_region" initial="a"><state id="a"><transition event="e" target="x"/></state></state>
      <state id="b_region" initial="b"><state id="b"><transition event="e" target="z"/></state></state>
    </parallel>
    <state id="x"><transition event="e" target="y"/></state>
    <state id="y"/>
    <state id="z"/>
    <state id="w"><transition event="e" target="a"/><transition event="f" target="b"/></state>
  </state>
</scxml>`;
    const { doc } = normalizeXml(xml);
    const p = one(doc.scxml.state);
    expect(ids(p.state)).toEqual(['w']);
    const regions = one(p.parallel).state as any[];
    expect(ids(regions.find((r) => r['@_id'] === 'a_region').state).sort()).toEqual(['a', 'x', 'y']);
    expect(ids(regions.find((r) => r['@_id'] === 'b_region').state).sort()).toEqual(['b', 'z']);
  });

  it('marking a loose state Initial makes it a new region (and P the <parallel> once nothing is loose)', () => {
    const doc = normalizeXml(compound()).doc;
    const p = one(doc.scxml.state);
    // What ToggleInitialStateCommand writes: the expanded regions plus state_4.
    p['@_initial'] = 'state_1_region state_3_region state_4';
    normalizeParallelGroups(doc);
    expect(doc.scxml.state).toBeUndefined();
    const parallel = one(doc.scxml.parallel);
    expect(parallel['@_id']).toBe('P');
    expect(ids(parallel.state).sort()).toEqual(['state_1_region', 'state_3_region', 'state_4_region']);
  });

  it('unwraps the inner parallel when fewer than 2 regions remain', () => {
    const doc = normalizeXml(compound()).doc;
    const p = one(doc.scxml.state);
    const inner = one(p.parallel);
    inner.state = (inner.state as any[]).filter((r) => r['@_id'] !== 'state_3_region');
    normalizeParallelGroups(doc);
    expect(p.parallel).toBeUndefined();
    expect(ids(p.state).sort()).toEqual(['state_1_region', 'state_4']);
    expect(p['@_initial']).toBe('state_1_region');
  });

  it('at the root, connecting a region member to a loose root state moves it into that region', () => {
    const parser = new SCXMLParser();
    const xml = `${HEADER} initial="state_1 state_3">
  <state id="state_1"><transition event="go" target="state_2"/></state>
  <state id="state_2"/>
  <state id="state_3"/>
  <state id="state_4"/>
</scxml>`;
    const { doc } = normalizeXml(xml);
    expect(ids(doc.scxml.state)).toEqual(['state_4']);
    // Now draw state_3 -> state_4.
    const region3 = (one(doc.scxml.parallel).state as any[]).find((r) => r['@_id'] === 'state_3_region');
    region3.state.transition = { '@_event': 'next', '@_target': 'state_4' };
    const reparsed = parser.parse(parser.serialize(doc, true)).data!;
    normalizeParallelGroups(reparsed);
    expect(reparsed.scxml.state).toBeUndefined();
    const regions = one(reparsed.scxml.parallel).state as any[];
    expect(ids(regions.find((r) => r['@_id'] === 'state_3_region').state).sort()).toEqual(['state_3', 'state_4']);
  });
});

describe('normalizeParallelGroups — loose state ids containing spaces', () => {
  it('absorbs a loose state whose id contains a space when a region member targets it', () => {
    const d: SCXMLDocument = {
      scxml: {
        '@_initial': '__root_parallel',
        parallel: {
          '@_id': '__root_parallel',
          state: [
            {
              '@_id': 'a_region',
              '@_initial': 'a',
              state: { '@_id': 'a', transition: { '@_event': 'e', '@_target': 'my state' } },
            },
            { '@_id': 'b_region', '@_initial': 'b', state: { '@_id': 'b' } },
          ],
        },
        state: { '@_id': 'my state' },
      } as any,
    };
    normalizeParallelGroups(d);
    expect(d.scxml.state).toBeUndefined();
    const aRegion = (one(d.scxml.parallel).state as any[]).find((r) => r['@_id'] === 'a_region');
    expect(ids(aRegion.state).sort()).toEqual(['a', 'my state']);
  });
});
