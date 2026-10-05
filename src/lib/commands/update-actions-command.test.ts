import { describe, it, expect } from 'vitest';
import { UpdateActionsCommand } from './update-actions-command';

const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

describe('UpdateActionsCommand waypoint invalidation', () => {
  // Entry/exit action count changes the node's rendered height (see
  // NodeDimensionCalculator), so stale persisted viz:waypoints on
  // transitions touching it must be cleared, or the edge renders against
  // the pre-update size.
  it('clears viz:waypoints on the updated state\'s own outgoing transition', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
    const result = new UpdateActionsCommand('A', ['assign|x|1', 'assign|y|2'], []).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:waypoints');
  });

  it('clears viz:waypoints on a sibling\'s transition targeting the updated state', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
    const result = new UpdateActionsCommand('B', ['assign|x|1'], []).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('viz:waypoints');
  });

  it('leaves unrelated transitions\' waypoints untouched', () => {
    const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1"/></state><state id="B"><transition target="C" viz:waypoints="2,2"/></state><state id="C"/></scxml>`;
    const result = new UpdateActionsCommand('A', ['assign|x|1'], []).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('viz:waypoints="2,2"');
  });
});

describe('UpdateActionsCommand assign expressions', () => {
  // Actions are pipe-delimited (`assign|location|expr`), so a logical-OR in
  // the expression must not be cut off at the first '|'.
  it('keeps "||" in onentry and onexit assign expressions', () => {
    const xml = `${VIZ_HEADER}><state id="A"/></scxml>`;
    const result = new UpdateActionsCommand(
      'A',
      ['assign|x|false || true'],
      ['assign|y|a || b || c']
    ).execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('expr="false || true"');
    expect(result.newContent).toContain('expr="a || b || c"');
  });
});
