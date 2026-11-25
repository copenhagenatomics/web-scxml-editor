import type { ValidationError } from '@/types/common';
import type { ChannelMapping } from '@/types/host-api';
import { extractUnresolvedChannelRefs } from '@/lib/utils/datamodel-extractor';
import { findIdentifierPositions } from './validator-utils';

/** Host-provided state the channel-mapping check needs; not part of the SCXML itself. */
export interface ChannelMappingContext {
  /** Physical channel names the host supplied via setChannels. */
  channels: string[];
  channelMappings: ChannelMapping[];
}

/**
 * Warns about every channel reference the Channel Mapping panel lists (see
 * extractUnresolvedChannelRefs) that has no channel chosen for it. Skipped while the host has not
 * supplied any channels: standalone, nothing could be mapped, so every reference would be flagged.
 */
export function validateChannelMappings(
  xmlContent: string | undefined,
  context: ChannelMappingContext | undefined,
  errors: ValidationError[],
): void {
  if (!xmlContent || !context || context.channels.length === 0) return;

  const mapped = new Set(context.channelMappings.filter(m => m.mappedChannel).map(m => m.scxmlRef));
  for (const ref of extractUnresolvedChannelRefs(xmlContent, context.channels)) {
    if (mapped.has(ref)) continue;
    const position = findIdentifierPositions(ref, xmlContent)[0];
    errors.push({
      message: `Channel '${ref}' isn't mapped to a channel. Choose one for it in Channel Mapping.`,
      severity: 'warning',
      line: position?.line,
      column: position?.column,
    });
  }
}
