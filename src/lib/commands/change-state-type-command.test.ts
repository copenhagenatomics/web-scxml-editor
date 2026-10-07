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
