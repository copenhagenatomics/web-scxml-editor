import { describe, it, expect } from 'vitest';
import { getConfigFieldUsage } from './datamodel-extractor';

describe('getConfigFieldUsage', () => {
  it('returns [] when the config value is not referenced anywhere', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual([]);
  });

  it('finds a reference in a transition cond, reported under the enclosing state id', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <transition cond="conf_threshold &gt; 3" target="S2"/>
        </state>
        <state id="S2"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('finds a reference in an assign expr', () => {
    const xml = `
      <scxml>
        <datamodel>
          <data id="conf_threshold" expr="5" confType="int"/>
          <data id="counter" expr="0"/>
        </datamodel>
        <state id="S1">
          <onentry><assign location="counter" expr="conf_threshold + 1"/></onentry>
        </state>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('finds a reference in a namelist', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <onentry><send event="e1" namelist="conf_threshold"/></onentry>
        </state>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });

  it('does not false-positive match a longer identifier with the same prefix', () => {
    const xml = `
      <scxml>
        <datamodel>
          <data id="conf_foo" expr="1" confType="int"/>
          <data id="conf_foobar" expr="2" confType="int"/>
        </datamodel>
        <state id="S1">
          <transition cond="conf_foobar &gt; 1" target="S2"/>
        </state>
        <state id="S2"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'foo')).toEqual([]);
  });

  it('does not count the field\'s own <data> declaration as a usage of itself', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="conf_threshold" confType="int"/></datamodel>
        <state id="S1"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual([]);
  });

  it('deduplicates when the same enclosing id references the field more than once', () => {
    const xml = `
      <scxml>
        <datamodel><data id="conf_threshold" expr="5" confType="int"/></datamodel>
        <state id="S1">
          <transition cond="conf_threshold &gt; 3" target="S2"/>
          <transition cond="conf_threshold &lt; 0" target="S3"/>
        </state>
        <state id="S2"/>
        <state id="S3"/>
      </scxml>`;
    expect(getConfigFieldUsage(xml, 'threshold')).toEqual(['S1']);
  });
});
