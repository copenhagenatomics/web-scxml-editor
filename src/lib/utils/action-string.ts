/**
 * Decodes a pipe-delimited `assign|{location}|{expr}` onentry/onexit action string (the
 * format produced by StateActionsPanel's `toStrings()` and UpdateActionsCommand's
 * extraction). Only the first two `|` are delimiters: the expr may itself contain `|`
 * (e.g. logical OR `a || b`), so everything after the location is the expr. A location
 * is a datamodel identifier and can never contain `|`.
 * Returns undefined for a non-assign action string.
 */
export function parseAssignActionString(
  actionString: string
): { location: string; expr: string } | undefined {
  const parts = actionString.split('|');
  if (parts[0] !== 'assign') return undefined;
  return { location: parts[1] ?? '', expr: parts.slice(2).join('|') };
}
