import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { SCXMLValidator } from '@/lib/validators/scxml-validator';
import { DEFAULT_SCXML_TEMPLATE } from './default_scxml_template';

describe('DEFAULT_SCXML_TEMPLATE', () => {
  const parsed = new SCXMLParser().parse(DEFAULT_SCXML_TEMPLATE);

  it('parses without errors', () => {
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
  });

  it('gives main_region an initial transition targeting an existing child state', () => {
    const scxml = parsed.data!.scxml as any;
    const mainRegion = [scxml.state].flat().find((s: any) => s['@_id'] === 'main_region');
    expect(mainRegion).toBeDefined();
    const initial = mainRegion['@_initial'];
    expect(initial).toBeTruthy();
    const childIds = [mainRegion.state].flat().filter(Boolean).map((s: any) => s['@_id']);
    expect(childIds).toContain(initial);
  });

  it('produces no validation errors', () => {
    const errors = new SCXMLValidator().validate(parsed.data!.scxml, DEFAULT_SCXML_TEMPLATE);
    expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
  });
});
