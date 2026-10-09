import { describe, it, expect } from 'vitest';
import { ToggleInitialStateCommand } from './toggle-initial-state-command';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { normalizeParallelGroups } from '@/lib/utils/parallel-group-normalization';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';
const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

describe('ToggleInitialStateCommand', () => {
  it('marks a previously-unmarked root state as Initial by adding it to a fresh initial attribute', () => {
    const xml = `${SCXML_HEADER}><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A"');
  });

  it('marks a second root state as Initial by appending to an existing initial attribute', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('B').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A B"');
  });

  it('unmarks a state by removing just its token, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="B"');
    expect(result.newContent).not.toMatch(/initial="[^"]*A[^"]*"/);
  });

  it('allows unmarking the only root Initial state, clearing the attribute entirely', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('initial=');
  });

  it('allows unmarking one of several root Initial states, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="B"');
  });

  it('allows unmarking the sole Initial state of a nested compound parent, clearing its attribute', () => {
    // This temporarily leaves the compound state without an initial
    // designation, which is a valid (if momentarily invalid-per-spec) editing
    // state — caught by the existing validateCompoundStates persistent
    // validator (Errors panel), not blocked here. Blocking it here would make
    // it impossible to ever reassign which child is Initial: marking a
    // sibling first is refused by wouldConflictIfMarkedInitial since it's
    // already connected to the current marker.
    const xml = `${SCXML_HEADER}><state id="Parent" initial="Child"><state id="Child"/></state></scxml>`;
    const result = new ToggleInitialStateCommand('Child').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('initial=');
  });

  it('allows unmarking one of several Initial states in the same nested parent', () => {
    const xml = `${SCXML_HEADER}><state id="Parent" initial="ChildA ChildB"><state id="ChildA"/><state id="ChildB"/></state></scxml>`;
    const result = new ToggleInitialStateCommand('ChildA').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="ChildB"');
  });

  it('undo restores the exact prior initial attribute value', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const command = new ToggleInitialStateCommand('B');
    const result = command.execute(xml);
    expect(result.newContent).toContain('initial="A B"');
    const undone = command.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(undone.newContent).toContain('initial="A"');
    expect(undone.newContent).not.toContain('initial="A B"');
  });

  it('undo restores an absent initial attribute after marking a fresh one', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const command = new ToggleInitialStateCommand('A');
    const result = command.execute(xml);
    expect(result.newContent).toContain('initial="A"');
    const undone = command.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('initial=');
  });

  it('fails to mark a state Initial when it is already connected to another Initial state in the same chain', () => {
    // Reproduces the reported bug: main_region (Initial) --event--> state_2,
    // marking state_2 Initial too must be refused since it would merge two
    // Initial State groups into one chain.
    const xml = `${SCXML_HEADER} initial="main_region"><state id="main_region"><transition event="event" target="state_2"/></state><state id="state_2"/></scxml>`;
    const result = new ToggleInitialStateCommand('state_2').execute(xml);
    expect(result.success).toBe(false);
    expect(result.newContent).toBe(xml);
    expect(result.error).toContain('main_region');
  });

  it('still allows marking an unconnected state Initial alongside an existing Initial group', () => {
    const xml = `${SCXML_HEADER} initial="main_region"><state id="main_region"/><state id="island"/></scxml>`;
    const result = new ToggleInitialStateCommand('island').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="main_region island"');
  });

  it('allows reassigning a chain\'s Initial marker to a different sibling (unmark then mark)', () => {
    // Reproduces the reported deadlock: main_region --event--> state_2 is a
    // chain whose sole Initial marker is state_2. Unmark it, then mark
    // main_region instead — both steps must succeed now that unmarking is
    // never blocked.
    const xml = `${SCXML_HEADER} initial="state_2"><state id="main_region"><transition event="event" target="state_2"/></state><state id="state_2"/></scxml>`;

    const unmarkResult = new ToggleInitialStateCommand('state_2').execute(xml);
    expect(unmarkResult.success).toBe(true);
    expect(unmarkResult.newContent).not.toContain('initial=');

    const markResult = new ToggleInitialStateCommand('main_region').execute(unmarkResult.newContent);
    expect(markResult.success).toBe(true);
    expect(markResult.newContent).toContain('initial="main_region"');
  });

  describe('<initial> child-element form (older SCXML style, no initial attribute)', () => {
    it('unmarks a state named via the <initial> element, removing the element and leaving no attribute', () => {
      const xml = `${SCXML_HEADER}><state id="Parent"><initial><transition target="Child"/></initial><state id="Child"/><state id="Other"/></state></scxml>`;
      const result = new ToggleInitialStateCommand('Child').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('<initial>');
      expect(result.newContent).not.toContain('initial=');
    });

    it('fails to mark a sibling Initial when the existing marker is expressed via <initial>, leaving the document unchanged', () => {
      const xml = `${SCXML_HEADER}><state id="Parent"><initial><transition target="off"/></initial><state id="off"><transition event="go" target="test_running"/></state><state id="test_running"/></state></scxml>`;
      const result = new ToggleInitialStateCommand('test_running').execute(xml);
      expect(result.success).toBe(false);
      expect(result.newContent).toBe(xml);
      expect(result.error).toContain('off');
    });

    it('migrates to the attribute form when marking a new, unconnected sibling alongside an <initial>-element marker', () => {
      const xml = `${SCXML_HEADER}><state id="Parent"><initial><transition target="off"/></initial><state id="off"/><state id="island"/></state></scxml>`;
      const result = new ToggleInitialStateCommand('island').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('<initial>');
      expect(result.newContent).toContain('initial="off island"');
    });

    it('undo restores the original <initial> element verbatim after an unmark', () => {
      const xml = `${SCXML_HEADER}><state id="Parent"><initial><transition target="Child"/></initial><state id="Child"/><state id="Other"/></state></scxml>`;
      const command = new ToggleInitialStateCommand('Child');
      const result = command.execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('<initial>');

      const undone = command.undo(result.newContent);
      expect(undone.success).toBe(true);
      expect(undone.newContent).toContain('<initial>');
      expect(undone.newContent).toContain('target="Child"');
      expect(undone.newContent).not.toContain('initial="Child"');
    });

    it('undo restores the original <initial> element after a migrating mark, removing the attribute that was added', () => {
      const xml = `${SCXML_HEADER}><state id="Parent"><initial><transition target="off"/></initial><state id="off"/><state id="island"/></state></scxml>`;
      const command = new ToggleInitialStateCommand('island');
      const result = command.execute(xml);
      expect(result.newContent).toContain('initial="off island"');

      const undone = command.undo(result.newContent);
      expect(undone.success).toBe(true);
      expect(undone.newContent).toContain('<initial>');
      expect(undone.newContent).toContain('target="off"');
      expect(undone.newContent).not.toContain('initial="off island"');
      expect(undone.newContent).not.toContain('initial="off"');
    });
  });

  describe('<parallel> regions (parallel-group-normalization.ts)', () => {
    const PAR_HEADER =
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';
    const TWO_REGIONS = '<state id="A_region" initial="A"><state id="A"/></state><state id="B_region" initial="B"><state id="B"/></state>';

    it('refuses to unmark a region of a <parallel> — regions are always active', () => {
      const xml = `${PAR_HEADER} initial="P"><parallel id="P">${TWO_REGIONS}</parallel></scxml>`;
      const result = new ToggleInitialStateCommand('B_region').execute(xml);
      expect(result.success).toBe(false);
      expect(result.error).toContain('always active');
      expect(result.newContent).toBe(xml);
    });

    it('refuses to toggle a region of the root __root_parallel too', () => {
      const xml = `${PAR_HEADER} initial="__root_parallel"><parallel id="__root_parallel">${TWO_REGIONS}</parallel></scxml>`;
      const result = new ToggleInitialStateCommand('A_region').execute(xml);
      expect(result.success).toBe(false);
    });

    it('toggles a member inside a region normally (the region is an ordinary compound state)', () => {
      const xml = `${PAR_HEADER} initial="P"><parallel id="P"><state id="A_region" initial="A"><state id="A"/><state id="A2"/></state><state id="B_region" initial="B"><state id="B"/></state></parallel></scxml>`;
      const result = new ToggleInitialStateCommand('A').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('initial="A"');
    });

    it('refuses a second Initial State inside a region — it would nest a <parallel> in P', () => {
      const xml = `${PAR_HEADER} initial="P"><parallel id="P"><state id="A_region" initial="A"><state id="A"/><state id="A2"/></state><state id="B_region" initial="B"><state id="B"/></state></parallel></scxml>`;
      const result = new ToggleInitialStateCommand('A2').execute(xml);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Parallel states cannot be nested');
      expect(result.newContent).toBe(xml);
    });

    it('marks a root-level sibling Initial next to __root_parallel, expanding the parallel to its regions', () => {
      const xml = `${PAR_HEADER} initial="__root_parallel"><parallel id="__root_parallel">${TWO_REGIONS}</parallel><state id="C"/></scxml>`;
      const result = new ToggleInitialStateCommand('C').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('initial="A_region B_region C"');

      const parsed = new SCXMLParser().parse(result.newContent).data!;
      normalizeParallelGroups(parsed);
      const regionIds = ((parsed.scxml.parallel as any).state as any[]).map((r) => r['@_id']).sort();
      expect(regionIds).toEqual(['A_region', 'B_region', 'C_region']);
    });

    describe('unmarking the last Initial State of a region dissolves the region', () => {
      const normalized = (content: string) => {
        const parsed = new SCXMLParser().parse(content).data!;
        normalizeParallelGroups(parsed);
        return parsed.scxml as any;
      };

      it('reverts a converted <parallel> back to a compound <state> when only one region is left', () => {
        const xml = `${PAR_HEADER} initial="P"><parallel id="P"><transition event="go" target="P"/>${TWO_REGIONS}</parallel></scxml>`;
        const result = new ToggleInitialStateCommand('A').execute(xml);
        expect(result.success).toBe(true);

        const scxml = normalized(result.newContent);
        expect(scxml.parallel).toBeUndefined();
        const p = scxml.state;
        expect(p['@_id']).toBe('P');
        expect(p.transition['@_target']).toBe('P');
        expect(p['@_initial']).toBe('B');
        const childIds = (p.state as any[]).map((s) => s['@_id']).sort();
        expect(childIds).toEqual(['A', 'B']);
        expect(p.parallel).toBeUndefined();
      });

      it('removes __root_parallel when only one root-level region is left', () => {
        const xml = `${PAR_HEADER} initial="__root_parallel"><parallel id="__root_parallel">${TWO_REGIONS}</parallel></scxml>`;
        const result = new ToggleInitialStateCommand('A').execute(xml);
        expect(result.success).toBe(true);

        const scxml = normalized(result.newContent);
        expect(scxml.parallel).toBeUndefined();
        expect(scxml['@_initial']).toBe('B');
        expect((scxml.state as any[]).map((s) => s['@_id']).sort()).toEqual(['A', 'B']);
      });

      it('keeps the <parallel> when 2+ regions are left, with the unmarked work tree loose beside it', () => {
        const xml = `${PAR_HEADER} initial="P"><parallel id="P">${TWO_REGIONS}<state id="C_region" initial="C"><state id="C"><transition event="go" target="C2"/></state><state id="C2"/></state></parallel></scxml>`;
        const result = new ToggleInitialStateCommand('C').execute(xml);
        expect(result.success).toBe(true);

        const scxml = normalized(result.newContent);
        const p = scxml.state;
        expect(p['@_id']).toBe('P');
        expect(p['@_initial']).toBe('P__parallel');
        expect((p.state as any[]).map((s) => s['@_id']).sort()).toEqual(['C', 'C2']);
        expect((p.parallel.state as any[]).map((r) => r['@_id']).sort()).toEqual(['A_region', 'B_region']);
      });

      it('undo restores the original <parallel>', () => {
        const xml = `${PAR_HEADER} initial="P"><parallel id="P">${TWO_REGIONS}</parallel></scxml>`;
        const command = new ToggleInitialStateCommand('A');
        const result = command.execute(xml);
        const undone = command.undo(result.newContent);
        expect(undone.success).toBe(true);
        const scxml = normalized(undone.newContent);
        expect(scxml.parallel['@_id']).toBe('P');
        expect((scxml.parallel.state as any[]).find((r) => r['@_id'] === 'A_region')['@_initial']).toBe('A');
      });
    });

    it('refuses to mark a state Initial when it is already transitively connected to the Initial member of its region', () => {
      const xml = `${PAR_HEADER} initial="P"><parallel id="P"><state id="A_region" initial="A"><state id="A"><transition event="go" target="A2"/></state><state id="A2"/></state><state id="B_region" initial="B"><state id="B"/></state></parallel></scxml>`;
      const result = new ToggleInitialStateCommand('A2').execute(xml);
      expect(result.success).toBe(false);
      expect(result.error).toContain("'A'");
    });
  });

  describe('waypoint invalidation on resize', () => {
    // Marking/unmarking changes the node's rendered width for the "Initial"
    // badge. SCXMLTransitionEdge always prefers a persisted viz:waypoints
    // path over dynamic routing, so a stale one computed against the old
    // width renders visually cutting through the resized node — reported as
    // a rendering bug. Clearing waypoints on transitions touching the
    // toggled state forces those edges back to dynamic (self-adjusting)
    // routing.
    it('clears viz:waypoints on the toggled state\'s own outgoing transition when marking Initial', () => {
      const xml = `${VIZ_HEADER}><state id="A" viz:waypoints="10,10;20,20"><transition target="B" viz:waypoints="10,10;20,20"/></state><state id="B"/></scxml>`;
      const result = new ToggleInitialStateCommand('A').execute(xml);
      expect(result.success).toBe(true);
      // Only the <transition>'s waypoints should be cleared, not an
      // unrelated same-named attribute elsewhere.
      expect(result.newContent).toMatch(/<transition target="B"\s*\/>/);
    });

    it('clears viz:waypoints on a sibling\'s transition that targets the toggled state', () => {
      const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="10,10;20,20"/></state><state id="B"/></scxml>`;
      const result = new ToggleInitialStateCommand('B').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('viz:waypoints');
    });

    it('clears viz:waypoints on both sides when unmarking, leaving unrelated transitions untouched', () => {
      const xml = `${VIZ_HEADER} initial="A"><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"><transition target="C" viz:waypoints="3,3;4,4"/></state><state id="C"/></scxml>`;
      const result = new ToggleInitialStateCommand('A').execute(xml);
      expect(result.success).toBe(true);
      // A -> B touches A (cleared); B -> C does not touch A (untouched).
      expect(result.newContent).not.toContain('viz:waypoints="1,1;2,2"');
      expect(result.newContent).toContain('viz:waypoints="3,3;4,4"');
    });

    it('does not clear waypoints when the mark is refused (conflict)', () => {
      const xml = `${VIZ_HEADER} initial="A"><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
      const result = new ToggleInitialStateCommand('B').execute(xml);
      expect(result.success).toBe(false);
      expect(result.newContent).toBe(xml);
    });

    it('undo restores cleared waypoints exactly', () => {
      const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="10,10;20,20"/></state><state id="B"/></scxml>`;
      const command = new ToggleInitialStateCommand('A');
      const result = command.execute(xml);
      expect(result.newContent).not.toContain('viz:waypoints');

      const undone = command.undo(result.newContent);
      expect(undone.success).toBe(true);
      expect(undone.newContent).toContain('viz:waypoints="10,10;20,20"');
    });
  });
});
