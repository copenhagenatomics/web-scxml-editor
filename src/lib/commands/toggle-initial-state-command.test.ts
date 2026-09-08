import { describe, it, expect } from 'vitest';
import { ToggleInitialStateCommand } from './toggle-initial-state-command';

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

  describe('auto-wrapped <parallel> (parallel-group-normalization.ts)', () => {
    const AUTO_HEADER =
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

    it('unmarks a bare-region member of an auto-wrapped root <parallel> (reproduces the reported bug: unchecking Initial State did nothing)', () => {
      // Before the fix, ToggleInitialStateCommand read/wrote the *real DOM
      // parent* (<parallel>, which never has an `initial` attribute) instead
      // of the logical container (root <scxml>), so unmarking a wrapped bare
      // region silently wrote initial="state_1" onto the <parallel> element
      // itself — invisible, and discarded by the next normalization pass —
      // leaving the state still marked Initial.
      const xml = `${AUTO_HEADER} initial="__root_parallel"><parallel id="__root_parallel" viz:auto-parallel="true"><state id="main_region"/><state id="state_2"/><state id="state_1"/></parallel></scxml>`;
      const result = new ToggleInitialStateCommand('state_1').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('initial="main_region state_2"');
      expect(result.newContent).not.toMatch(/initial="[^"]*state_1[^"]*"/);
    });

    it('unmarks the Initial member of a multi-member auto-region, clearing the group entirely when it was the only one', () => {
      const xml = `${AUTO_HEADER} initial="__root_parallel"><parallel id="__root_parallel" viz:auto-parallel="true"><state id="main_region_region" initial="main_region" viz:auto-region="true"><state id="main_region"><transition event="go" target="state_1"/></state><state id="state_1"/></state><state id="state_2"/></parallel></scxml>`;
      const result = new ToggleInitialStateCommand('main_region').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('initial="state_2"');
    });

    it('marks a new sibling Initial (joining the group) when the container is already auto-wrapped', () => {
      const xml = `${AUTO_HEADER} initial="__root_parallel"><parallel id="__root_parallel" viz:auto-parallel="true"><state id="main_region"/><state id="state_2"/></parallel><state id="state_3"/></scxml>`;
      const result = new ToggleInitialStateCommand('state_3').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('initial="main_region state_2 state_3"');
    });

    it('refuses to mark a state Initial when it is already transitively connected to an Initial member inside a wrapped multi-member region', () => {
      const xml = `${AUTO_HEADER} initial="__root_parallel"><parallel id="__root_parallel" viz:auto-parallel="true"><state id="main_region_region" initial="main_region" viz:auto-region="true"><state id="main_region"><transition event="go" target="state_1"/></state><state id="state_1"/></state><state id="state_2"/></parallel></scxml>`;
      const result = new ToggleInitialStateCommand('state_1').execute(xml);
      expect(result.success).toBe(false);
      expect(result.error).toContain('main_region');
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
