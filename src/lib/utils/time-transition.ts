function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// SCXML `delayexpr` values are read by the code generator as milliseconds with no unit
// suffix (a bare number is never re-interpreted as seconds). The "after <expr> s" syntax
// visually implies seconds, so we bake the seconds→ms conversion into the stored expression
// itself. Already-converted expressions (hand-written or from a prior apply) are left alone
// so re-applying an unedited time transition never multiplies twice.
const MS_CONVERSION_SUFFIX = /\*\s*1000\s*$/;

function ensureMsConversion(expr: string): string {
  return MS_CONVERSION_SUFFIX.test(expr) ? expr : `${expr} * 1000`;
}

// Inverse of ensureMsConversion, for display: hides the baked-in "* 1000" so the diagram
// shows the expression the user actually typed, not the runtime ms conversion.
function stripMsConversion(expr: string): string {
  return expr.replace(/\s*\*\s*1000\s*$/, '');
}

/**
 * Parse "after X" user input into a delay descriptor.
 * Returns null if the input does not match any supported format.
 *
 * Accepted formats:
 *   after 2s              → { type: 'delay',     value: '2s'    }
 *   after 714ms           → { type: 'delay',     value: '714ms' }
 *   after 5 s             → { type: 'delay',     value: '5s'    }  (space before unit)
 *   after 344 ms          → { type: 'delay',     value: '344ms' }  (space before unit)
 *   after (expr) s         → { type: 'delayexpr', value: 'expr * 1000' }  (parenthesized, converted to ms)
 *   after this.abc s      → { type: 'delayexpr', value: 'this.abc * 1000' }  (bare expr, converted to ms)
 *   after this.abc ms     → { type: 'delayexpr', value: 'this.abc' }  (bare expr, already ms — no conversion)
 *
 * Bare expressions MUST end with a space + "s"/"ms" so that plain words like
 * "after conf_hats" (no space before the trailing s) are rejected.
 * Numeric patterns are checked first so "after 5 s" resolves to delay, not delayexpr.
 * Expressions marked "s" are converted to milliseconds (the unit the SCXML runtime actually
 * reads a bare delayexpr number as) by appending "* 1000"; expressions marked "ms" are
 * already in the runtime's native unit and are stored verbatim.
 */
export function parseAfterSyntax(
  input: string
): { type: 'delay' | 'delayexpr'; value: string } | null {
  const t = input.trim();

  // after <N>ms  or  after <N> ms
  const ms = t.match(/^after\s+(\d+(?:\.\d+)?)\s*ms$/);
  if (ms) return { type: 'delay', value: `${ms[1]}ms` };

  // after <N>s  or  after <N> s
  const sec = t.match(/^after\s+(\d+(?:\.\d+)?)\s*s$/);
  if (sec) return { type: 'delay', value: `${sec[1]}s` };

  // after (expr) ms  — parenthesized, already in milliseconds: stored verbatim, no conversion
  const parenMs = t.match(/^after\s+\((.+)\)\s+ms$/);
  if (parenMs) return { type: 'delayexpr', value: parenMs[1].trim() };

  // after <expr> ms  — bare expression, already in milliseconds: stored verbatim, no conversion
  const bareMs = t.match(/^after\s+(.+)\s+ms$/);
  if (bareMs) return { type: 'delayexpr', value: bareMs[1].trim() };

  // after (expr) s  — parenthesized form kept for backward compatibility
  const paren = t.match(/^after\s+\((.+)\)\s+s$/);
  if (paren) return { type: 'delayexpr', value: ensureMsConversion(paren[1].trim()) };

  // after <expr> s  — bare expression; the mandatory space before "s" prevents
  // plain words ending in "s" (e.g. "after conf_hats") from matching
  const bare = t.match(/^after\s+(.+)\s+s$/);
  if (bare) return { type: 'delayexpr', value: ensureMsConversion(bare[1].trim()) };

  return null;
}

/**
 * Reconstruct the "after X" display string from a stored delay type + value.
 * Used when loading an existing time-transition edge.
 */
export function formatAfterSyntax(
  delayType: 'delay' | 'delayexpr',
  delayValue: string
): string {
  if (delayType !== 'delayexpr') return `after ${delayValue}`;
  // A "* 1000" suffix means the expression was authored in seconds and converted for
  // runtime; anything else is already milliseconds, matching how the backend reads it.
  return MS_CONVERSION_SUFFIX.test(delayValue)
    ? `after ${stripMsConversion(delayValue)} s`
    : `after ${delayValue} ms`;
}

/**
 * Returns true when an event name follows the auto-generated pattern
 * {stateId}_t_{N}_timeEvent_{N}.
 */
export function isTimeEventName(name: string): boolean {
  return /_t_\d+_timeEvent_\d+/.test(name);
}

/**
 * Finds the single time-event token inside a possibly comma-merged `@_event` value
 * (event-merge can combine a time event with a plain event sharing the same
 * target/cond/actions). Returns undefined if no token matches the time-event pattern.
 */
export function findTimeEventToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((t) => t.trim())
    .find((t) => isTimeEventName(t));
}

/**
 * Resolves a possibly comma-merged `@_event` value into its display form, replacing
 * exactly the token(s) that follow the time-event naming pattern with their "after X"
 * reconstruction. `findSendAction` looks up the `send|{token}|{delayType}|{delayValue}`
 * entry-action string for a given token; a token with no match is left as-is.
 * Returns the original value unchanged if no token resolved to a time event.
 */
export function resolveTimeEventDisplay(
  value: string,
  findSendAction: (token: string) => string | undefined
): string {
  const tokens = value.split(',').map((t) => t.trim()).filter(Boolean);
  let resolvedAny = false;
  const resolved = tokens.map((token) => {
    if (!isTimeEventName(token)) return token;
    const sendStr = findSendAction(token);
    if (!sendStr) return token;
    const parts = sendStr.split('|');
    const dt = (parts[2] as 'delay' | 'delayexpr' | undefined) ?? 'delay';
    const dv = parts.slice(3).join('|');
    resolvedAny = true;
    return formatAfterSyntax(dt, dv);
  });
  return resolvedAny ? resolved.join(', ') : value;
}

/**
 * Generate the next available time-event name for a source state.
 * Scans the SCXML string for existing {sourceId}_t_{N}_timeEvent_ occurrences
 * and uses max(N)+1 (starting from 0).
 */
export function generateTimeEventName(
  sourceId: string,
  scxmlContent: string
): string {
  const pattern = new RegExp(
    `${escapeRegExp(sourceId)}_t_(\\d+)_timeEvent_\\d+`,
    'g'
  );
  const indices = [...scxmlContent.matchAll(pattern)].map((m) =>
    parseInt(m[1], 10)
  );
  const next = indices.length === 0 ? 0 : Math.max(...indices) + 1;
  return `${sourceId}_t_${next}_timeEvent_${next}`;
}
