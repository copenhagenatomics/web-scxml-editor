import { describe, expect, it } from 'vitest';
import type { ValidationError } from '@/types/common';
import { validateChannelMappings } from './channel-mapping-validator';
import { validateScxmlContent } from './validate-content';

const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
  <state id="A">
    <transition cond="abc &gt; 5" target="B"/>
  </state>
  <state id="B">
    <transition cond="neww" target="A"/>
  </state>
</scxml>`;

function run(channels: string[], mappings: Array<{ scxmlRef: string; mappedChannel: string }>) {
  const errors: ValidationError[] = [];
  validateChannelMappings(xml, { channels, channelMappings: mappings }, errors);
  return errors;
}

describe('validateChannelMappings', () => {
  it('warns for each unresolved reference with no mapping, pointing at its first use', () => {
    const errors = run(['ClockSynced'], [{ scxmlRef: 'abc', mappedChannel: 'ClockSynced' }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ severity: 'warning', line: 6 });
    expect(errors[0].message).toContain("'neww'");
  });

  it('treats a mapping with an empty channel as unmapped', () => {
    const errors = run(['ClockSynced'], [{ scxmlRef: 'neww', mappedChannel: '' }]);
    expect(errors.map(e => e.message)).toEqual([
      expect.stringContaining("'abc'"),
      expect.stringContaining("'neww'"),
    ]);
  });

  it('reports nothing once every reference is mapped', () => {
    expect(run(['X'], [
      { scxmlRef: 'abc', mappedChannel: 'X' },
      { scxmlRef: 'neww', mappedChannel: 'X' },
    ])).toEqual([]);
  });

  it('skips a reference that is itself a host channel', () => {
    expect(run(['abc', 'neww'], [])).toEqual([]);
  });

  it('stays quiet until the host supplies channels', () => {
    expect(run([], [])).toEqual([]);
  });

  it('is included by validateScxmlContent only when given the host context', () => {
    const unmapped = (issues: ValidationError[]) => issues.filter(i => i.message.includes("isn't mapped"));
    expect(unmapped(validateScxmlContent(xml))).toEqual([]);
    expect(unmapped(validateScxmlContent(xml, { channels: ['X'], channelMappings: [] }))).toHaveLength(2);
  });
});
