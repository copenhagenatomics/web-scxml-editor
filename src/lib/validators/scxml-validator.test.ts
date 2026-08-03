import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import { SCXMLValidator } from './scxml-validator';

describe('SCXMLValidator duplicate state id', () => {
  it('attaches the duplicated id as stateId', () => {
    const scxml: SCXMLElement = {
      '@_xmlns': 'http://www.w3.org/2005/07/scxml',
      '@_version': '1.0',
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'A' }],
    } as any;
    const errors = new SCXMLValidator().validate(scxml);
    const duplicateError = errors.find((e) => e.message.includes('Duplicate state ID'));
    expect(duplicateError).toBeDefined();
    expect(duplicateError!.stateId).toBe('A');
  });
});
