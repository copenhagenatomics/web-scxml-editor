/**
 * ID Mapping Utilities for SCXML Converter
 *
 * Handles conversion between SCXML IDs (which may contain dots) and safe IDs
 * for React Flow (which interprets dots as path separators).
 */

/**
 * Convert state ID to a safe ID (replace dots with underscores)
 * This is necessary because React Flow and some libraries interpret dots as path separators
 */
export function toSafeId(
  id: string | null | undefined,
  idToSafeId: Map<string, string>,
  safeIdToId: Map<string, string>
): string | null | undefined {
  // Handle null/undefined cases
  if (id === null || id === undefined) {
    return id;
  }

  // Ensure it's a string
  if (typeof id !== 'string') {
    return String(id);
  }

  // Handle empty string
  if (id === '') {
    return id;
  }

  // Check if we already have a safe ID for this
  const existing = idToSafeId.get(id);
  if (existing) return existing;

  // Replace dots with double underscores to avoid conflicts
  const safeId = id.replace(/\./g, '__');

  // Store the mapping
  idToSafeId.set(id, safeId);
  safeIdToId.set(safeId, id);

  return safeId;
}
