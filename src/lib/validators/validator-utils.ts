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
 * A 1-based source range; endColumn is exclusive (Monaco marker convention).
 */
export interface SourceRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/**
 * Source location of one element: `range` covers the `<name` token, and each
 * attribute's range covers `name="value"`.
 */
export interface SourceElement {
  name: string;
  range: SourceRange;
  attributes: Map<string, SourceRange>;
}

/**
 * Index every element in the XML by the same path the validators build while
 * walking the fast-xml-parser tree: the root is its tag name (`scxml`), and each
 * child is `${parentPath}.${tag}[${n}]`, where n counts same-named siblings.
 * fast-xml-parser groups same-named children into arrays in document order, so
 * a path identifies exactly one parsed element — unlike the type-and-line
 * lookup in parseElementPositions.
 *
 * Only meant for documents that already parsed; on malformed XML it returns a
 * best-effort index.
 */
export function buildSourceElementIndex(xmlContent: string): Map<string, SourceElement> {
  const index = new Map<string, SourceElement>();
  const lineStarts = [0];
  for (let i = 0; i < xmlContent.length; i++) {
    if (xmlContent[i] === '\n') lineStarts.push(i + 1);
  }

  const toLineColumn = (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: offset - lineStarts[low] + 1 };
  };
  const toRange = (start: number, end: number): SourceRange => {
    const from = toLineColumn(start);
    const to = toLineColumn(end);
    return { line: from.line, column: from.column, endLine: to.line, endColumn: to.column };
  };

  const rootCounts = new Map<string, number>();
  const stack: Array<{ path: string; childCounts: Map<string, number> }> = [];
  const skipTo = (from: number, terminator: string) => {
    const end = xmlContent.indexOf(terminator, from);
    return end === -1 ? xmlContent.length : end + terminator.length;
  };

  let i = 0;
  while (i < xmlContent.length) {
    const lt = xmlContent.indexOf('<', i);
    if (lt === -1) break;

    if (xmlContent.startsWith('<!--', lt)) {
      i = skipTo(lt + 4, '-->');
      continue;
    }
    if (xmlContent.startsWith('<![CDATA[', lt)) {
      i = skipTo(lt + 9, ']]>');
      continue;
    }
    if (xmlContent.startsWith('<?', lt)) {
      i = skipTo(lt + 2, '?>');
      continue;
    }
    if (xmlContent.startsWith('<!', lt)) {
      i = skipTo(lt + 2, '>');
      continue;
    }
    if (xmlContent[lt + 1] === '/') {
      stack.pop();
      i = skipTo(lt + 2, '>');
      continue;
    }

    const nameMatch = /^[A-Za-z_][\w:.-]*/.exec(xmlContent.slice(lt + 1, lt + 257));
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }
    const name = nameMatch[0];

    // Find the closing '>' of the start tag, ignoring any inside quoted values.
    let end = lt + 1 + name.length;
    let quote: string | null = null;
    for (; end < xmlContent.length; end++) {
      const ch = xmlContent[end];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
    }
    const selfClosing = xmlContent[end - 1] === '/';

    const attributes = new Map<string, SourceRange>();
    const attrStart = lt + 1 + name.length;
    const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
    const attrText = xmlContent.slice(attrStart, end);
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrText)) !== null) {
      const start = attrStart + attrMatch.index;
      if (!attributes.has(attrMatch[1])) {
        attributes.set(attrMatch[1], toRange(start, start + attrMatch[0].length));
      }
    }

    const parent = stack[stack.length - 1];
    const counts = parent ? parent.childCounts : rootCounts;
    const n = counts.get(name) ?? 0;
    counts.set(name, n + 1);
    const path = parent ? `${parent.path}.${name}[${n}]` : name;

    index.set(path, {
      name,
      range: toRange(lt, lt + 1 + name.length),
      attributes,
    });

    if (!selfClosing) {
      stack.push({ path, childCounts: new Map() });
    }
    i = end + 1;
  }

  return index;
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
  lineInfo: { line: number; column: number } | undefined
): string {
  const label = log['@_label'];
  const contextInfo = label ? ` (with label "${label}")` : '';
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
 * Parse a space-separated list of state IDs, correctly handling IDs that contain spaces.
 * Uses greedy matching against the known state ID set: longer IDs are tried first so
 * "main region" is returned as one token rather than ["main", "region"].
 */
export function parseStateIdList(value: string, stateIds: Set<string>): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  // Guard against callers passing ids from id-less elements (undefined).
  const knownIds = [...stateIds].filter((id) => typeof id === 'string');
  const hasSpacedIds = knownIds.some((id) => id.includes(' '));
  if (!hasSpacedIds) return trimmed.split(/\s+/);

  const sortedIds = knownIds.sort((a, b) => b.length - a.length);
  const result: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining) break;

    const matched = sortedIds.find(
      (id) =>
        remaining.startsWith(id) &&
        (remaining.length === id.length || /\s/.test(remaining[id.length]))
    );

    if (matched) {
      result.push(matched);
      remaining = remaining.slice(matched.length);
    } else {
      const spaceIdx = remaining.search(/\s/);
      if (spaceIdx === -1) {
        result.push(remaining);
        remaining = '';
      } else {
        result.push(remaining.slice(0, spaceIdx));
        remaining = remaining.slice(spaceIdx);
      }
    }
  }

  return result;
}

/**
 * Find all line/column positions of <data> elements with a specific id in the XML
 */
export function findDataIdPositions(
  id: string,
  xmlContent: string
): Array<{ line: number; column: number }> {
  const positions: Array<{ line: number; column: number }> = [];
  const lines = xmlContent.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line.includes('<data') && line.includes(`id="${id}"`)) {
      positions.push({ line: lineIndex + 1, column: line.indexOf('<data') + 1 });
    }
  }

  return positions;
}

/**
 * Find every line/column position where an identifier appears as a whole word anywhere
 * in the XML - covers both declarations (e.g. a <data id="..."> attribute value) and
 * references inside expression attributes (cond, expr, location, etc.).
 */
export function findIdentifierPositions(
  name: string,
  xmlContent: string
): Array<{ line: number; column: number }> {
  const positions: Array<{ line: number; column: number }> = [];
  const lines = xmlContent.split('\n');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'g');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      positions.push({ line: lineIndex + 1, column: match.index + 1 });
    }
  }

  return positions;
}

/**
 * Find the line/column position of a specific transition in the XML
 */
export function findTransitionPosition(
  sourceStateId: string,
  targetStateId: string,
  xmlContent: string | undefined,
  event?: string,
  cond?: string,
  excludeLines?: Set<number>
): { line: number; column: number } | undefined {
  if (!xmlContent) return undefined;

  const lines = xmlContent.split('\n');

  // Search for the transition element
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    if (excludeLines?.has(lineNumber)) continue;

    // Look for transition tags
    if (line.includes('<transition')) {
      // Check if this transition matches our criteria
      const hasTarget = line.includes(`target="${targetStateId}"`);
      const hasEvent = event ? line.includes(`event="${event}"`) : !line.includes('event=');
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
