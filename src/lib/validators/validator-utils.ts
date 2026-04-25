/**
 * SCXML Validator Utility Functions
 *
 * This module contains utility functions for validation including:
 * - String similarity matching (Levenshtein distance)
 * - Error deduplication
 * - XML position tracking and parsing
 */

import type { ValidationError } from '@/types/common';
import type { LogElement } from '@/types/scxml';

/**
 * Calculate the Levenshtein distance between two strings
 * Used for suggesting similar attribute names when typos are detected
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Find a similar attribute name from a set of valid attributes
 * Returns null if no similar attribute is found within the threshold
 */
export function findSimilarAttribute(
  attr: string,
  validAttributes: Set<string>
): string | null {
  const threshold = 2; // Maximum edit distance
  let bestMatch: string | null = null;
  let minDistance = threshold + 1;

  for (const validAttr of validAttributes) {
    const distance = levenshteinDistance(attr, validAttr);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = validAttr;
    }
  }

  return minDistance <= threshold ? bestMatch : null;
}

/**
 * Deduplicate validation errors based on message and position
 */
export function deduplicateErrors(errors: ValidationError[]): ValidationError[] {
  const seen = new Set<string>();
  const deduplicated: ValidationError[] = [];

  for (const error of errors) {
    // Create a key based on message and position for deduplication
    const key = `${error.message}_${error.line || 'no-line'}_${error.column || 'no-col'}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(error);
    }
  }

  return deduplicated;
}

/**
 * Parse XML content and extract element positions
 * Stores positions for common SCXML elements to provide better error messages
 */
export function parseElementPositions(
  xmlContent: string,
  positionMap: Map<any, { line: number; column: number }>
): void {
  const lines = xmlContent.split('\n');

  // Common SCXML elements to track
  const elementsToTrack = [
    'log',
    'assign',
    'send',
    'raise',
    'data',
    'invoke',
    'if',
    'transition',
    'state',
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    // Track all common SCXML elements
    for (const elementName of elementsToTrack) {
      const regex = new RegExp(`<${elementName}\\b[^>]*>`, 'g');
      const matches = line.match(regex);
      if (matches) {
        const columnIndex = line.indexOf(`<${elementName}`);
        if (columnIndex !== -1) {
          const position = {
            line: lineNumber,
            column: columnIndex + 1,
          };

          // Store position for this element type on this line
          storePositionForPattern(elementName, lineNumber, position, positionMap);
        }
      }
    }
  }
}

/**
 * Store position based on element type and line number
 */
function storePositionForPattern(
  elementName: string,
  lineNumber: number,
  position: { line: number; column: number },
  positionMap: Map<any, { line: number; column: number }>
): void {
  positionMap.set(`${elementName}_line_${lineNumber}`, position);
}

/**
 * Get element position from the position map
 */
export function getElementPosition(
  element: any,
  positionMap: Map<any, { line: number; column: number }>
): { line: number; column: number } | undefined {
  // Try to find position by looking for stored positions
  for (const [key, position] of positionMap.entries()) {
    if (key.toString().includes('log_line_')) {
      return position;
    }
  }
  return undefined;
}

/**
 * Find element position by element type and path
 */
export function findElementPosition(
  elementType: string,
  path: string,
  positionMap: Map<any, { line: number; column: number }>
): { line: number; column: number } | undefined {
  // Extract line information from path if possible, or find the first occurrence of this element type
  const pathParts = path.split('.');

  // Try to find position by element type
  for (const [key, position] of positionMap.entries()) {
    if (key.startsWith(`${elementType}_line_`)) {
      return position;
    }
  }

  return undefined;
}

/**
 * Create a user-friendly error message for log element validation
 */
export function createFriendlyLogErrorMessage(
  log: LogElement,
  path: string,
  positionMap: Map<any, { line: number; column: number }>
): string {
  const label = log['@_label'];
  const contextInfo = label ? ` (with label "${label}")` : '';
  const pathParts = path.split('.');
  const lineInfo = getElementPosition(log, positionMap);
  const locationInfo = lineInfo
    ? `at line ${lineInfo.line}, column ${lineInfo.column}`
    : `at ${path}`;

  // Create a more user-friendly error message
  return (
    `Missing required 'expr' attribute in <log> element${contextInfo} ${locationInfo}. ` +
    `The 'expr' attribute specifies what to log and is required for all <log> elements.`
  );
}

/**
 * Find the line/column position of a specific transition in the XML
 */
export function findTransitionPosition(
  sourceStateId: string,
  targetStateId: string,
  xmlContent: string | undefined,
  event?: string,
  cond?: string
): { line: number; column: number } | undefined {
  if (!xmlContent) return undefined;

  const lines = xmlContent.split('\n');

  // Search for the transition element
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    // Look for transition tags
    if (line.includes('<transition')) {
      // Check if this transition matches our criteria
      const hasTarget = line.includes(`target="${targetStateId}"`);
      const hasEvent = event ? line.includes(`event="${event}"`) : true;
      const hasCond = cond
        ? line.includes(`cond="${cond}"`)
        : !line.includes('cond=');

      if (hasTarget && hasEvent && hasCond) {
        const columnIndex = line.indexOf('<transition');
        if (columnIndex !== -1) {
          return {
            line: lineNumber,
            column: columnIndex + 1,
          };
        }
      }
    }
  }

  return undefined;
}
