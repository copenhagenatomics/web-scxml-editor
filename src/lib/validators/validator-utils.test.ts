import { describe, it, expect } from 'vitest';
import { findTransitionPosition } from './validator-utils';

const xml = [
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">',
  '  <state id="a">',
  '    <transition event="go" target="b"/>',
  '    <transition event="go"/>',
  '  </state>',
  '  <state id="b"/>',
  '</scxml>',
].join('\n');

describe('findTransitionPosition', () => {
  it('finds a targeted transition by its target', () => {
    expect(findTransitionPosition('a', 'b', xml, 'go')?.line).toBe(3);
  });

  it('finds a targetless transition when targetStateId is empty, skipping targeted ones', () => {
    // Before the targetless rule, '' was matched as the literal `target=""`,
    // which no line has, so no position was found at all.
    expect(findTransitionPosition('a', '', xml, 'go')?.line).toBe(4);
  });
});
