import { describe, it, expect } from 'vitest';
import type { ValidationError } from '@/types/common';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { validateParallelNesting } from './parallel-nesting-validator';

const HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

function validate(body: string): ValidationError[] {
  const scxml = new SCXMLParser().parse(`${HEADER}>${body}</scxml>`).data!.scxml;
  const errors: ValidationError[] = [];
  validateParallelNesting(scxml, errors);
  return errors;
}

describe('validateParallelNesting', () => {
  it('accepts a flat parallel state', () => {
    expect(validate('<parallel id="P"><state id="a"/><state id="b"/></parallel>')).toEqual([]);
  });

  it('reports a parallel state nested inside another one', () => {
    const errors = validate(
      '<parallel id="Outer"><state id="R1" initial="P"><parallel id="P"><state id="a"/><state id="b"/></parallel></state><state id="R2"/></parallel>',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ severity: 'error', stateId: 'P' });
    expect(errors[0].message).toContain("Parallel state 'P' is nested inside parallel state 'Outer'");
  });

  it('names the top-level parallel for nesting under __root_parallel', () => {
    const errors = validate(
      '<parallel id="__root_parallel"><state id="R1" initial="P"><parallel id="P"><state id="a"/><state id="b"/></parallel></state><state id="R2"/></parallel>',
    );
    expect(errors[0].message).toContain('nested inside the top-level parallel state');
  });
});
