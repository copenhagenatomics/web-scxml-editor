import { SCXMLParser } from '../parsers/scxml-parser';
import { SCXMLValidator } from './scxml-validator';
import { validateChannelMappings, type ChannelMappingContext } from './channel-mapping-validator';
import type { ValidationError } from '@/types/common';

/**
 * Full client-side check of an SCXML document: XML syntax/parse errors first, then the
 * SCXMLValidator passes (only when parsing succeeded). The single definition of "the editor's
 * own validation result", shared by the debounced live validation (use-content-validation.ts)
 * and on-demand callers that cannot wait for the debounce, such as gating a host command.
 * `channelContext` (host channels + mappings) adds the unmapped-channel warnings.
 */
export function validateScxmlContent(xmlContent: string, channelContext?: ChannelMappingContext): ValidationError[] {
  if (!xmlContent.trim()) return [];
  const parseResult = new SCXMLParser().parse(xmlContent);
  const errors = [...parseResult.errors];
  if (parseResult.success && parseResult.data) {
    errors.push(...new SCXMLValidator().validate(parseResult.data.scxml, xmlContent));
    validateChannelMappings(xmlContent, channelContext, errors);
  }
  return errors;
}
