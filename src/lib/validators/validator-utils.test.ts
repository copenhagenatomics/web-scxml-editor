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

  it('still finds the source state\'s transition after a one-line child state', () => {
    // The child's `</state>` comes after its own <transition> on the same line;
    // it must still close the child, or every later line looks one level deeper.
    const nested = [
      '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">',
      '  <state id="a" initial="a1">',
      '    <state id="a1"><transition target="a2"/></state>',
      '    <state id="a2"/>',
      '    <transition event="go" target="b"/>',
      '  </state>',
      '  <state id="b"/>',
      '</scxml>',
    ].join('\n');
    expect(findTransitionPosition('a', 'b', nested, 'go')?.line).toBe(5);
  });
});
