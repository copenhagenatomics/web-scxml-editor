import { SCXMLParser } from '../parsers/scxml-parser';
import { SCXMLValidator } from './scxml-validator';
import type { ValidationError } from '@/types/common';

/**
 * Full client-side check of an SCXML document: XML syntax/parse errors first, then the
 * SCXMLValidator passes (only when parsing succeeded). The single definition of "the editor's
 * own validation result", shared by the debounced live validation (use-content-validation.ts)
 * and on-demand callers that cannot wait for the debounce, such as gating a host command.
 */
export function validateScxmlContent(xmlContent: string): ValidationError[] {
  if (!xmlContent.trim()) return [];
  const parseResult = new SCXMLParser().parse(xmlContent);
  const errors = [...parseResult.errors];
  if (parseResult.success && parseResult.data) {
    errors.push(...new SCXMLValidator().validate(parseResult.data.scxml, xmlContent));
  }
  return errors;
}
