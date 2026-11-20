import {
  getExpressionSuggestions,
  type ExpressionAutocompleteContext,
  type ExpressionSuggestion,
} from './expression-autocomplete';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// SCXML `delayexpr` values are read by the code generator as milliseconds with no unit
// suffix (a bare number is never re-interpreted as seconds). The "after <expr> s" syntax
// visually implies seconds, so we bake the seconds→ms conversion into the stored expression
// itself. Already-converted expressions (hand-written or from a prior apply) are left alone
// so re-applying an unedited time transition never multiplies twice.
const MS_CONVERSION_SUFFIX = /\*\s*1000\s*$/;

/** True when every ( / [ has a matching close and no close comes before its open. */
function isBalanced(expr: string): boolean {
  let depth = 0;
  for (const ch of expr) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * True when appending "* 1000" to `expr` would NOT multiply the whole expression — i.e. it has
 * an operator binding looser than `*` at the top level (`a + b`, `c ? 5 : 0`, `x > 1 && y`).
 * Only operands joined by `*`, `/`, `%` (plus a leading unary `-`/`+`/`!`) are safe without
 * parentheses; anything else at depth 0 needs them. Over-wrapping is harmless, so this errs
 * toward true (e.g. `1e-3`, `x * -2`).
 */
function needsParensForMsConversion(expr: string): boolean {
  const body = expr.trim().replace(/^[-+!]\s*/, '');
  if (!isBalanced(body)) return true;
  let depth = 0;
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && !/[\w.$\s*/%]/.test(ch)) return true;
  }
  return false;
}

function ensureMsConversion(expr: string): string {
  if (MS_CONVERSION_SUFFIX.test(expr)) return expr;
  return needsParensForMsConversion(expr) ? `(${expr}) * 1000` : `${expr} * 1000`;
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
 *   after x * 5s          → { type: 'delayexpr', value: 'x * 5 * 1000' }  (unit glued to trailing number)
 *   after x * 5ms         → { type: 'delayexpr', value: 'x * 5' }
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

  // The parenthesized forms only strip the outer parens when they enclose the whole expression
  // — "after (a) * (b) s" has a leading "(" and trailing ")" that don't pair up, so it falls
  // through to the bare forms instead of being cut down to "a) * (b".

  // after (expr) ms  — parenthesized, already in milliseconds: stored verbatim, no conversion
  const parenMs = t.match(/^after\s+\((.+)\)\s+ms$/);
  if (parenMs && isBalanced(parenMs[1])) return { type: 'delayexpr', value: parenMs[1].trim() };

  // after <expr> ms  — bare expression, already in milliseconds: stored verbatim, no conversion
  const bareMs = t.match(/^after\s+(.+)\s+ms$/);
  if (bareMs) return { type: 'delayexpr', value: bareMs[1].trim() };

  // after (expr) s  — parenthesized form kept for backward compatibility
  const paren = t.match(/^after\s+\((.+)\)\s+s$/);
  if (paren && isBalanced(paren[1])) return { type: 'delayexpr', value: ensureMsConversion(paren[1].trim()) };

  // after <expr> s  — bare expression; the mandatory space before "s" prevents
  // plain words ending in "s" (e.g. "after conf_hats") from matching
  const bare = t.match(/^after\s+(.+)\s+s$/);
  if (bare) return { type: 'delayexpr', value: ensureMsConversion(bare[1].trim()) };

  // after <expr><N>ms / after <expr><N>s — the unit glued to the expression's trailing number
  // ("after x * 5s"). The number must be its own token (preceded by a space, operator or
  // paren), so a plain word ending in digit+"s" ("after conf_hat5s") is still rejected.
  const glued = t.match(/^after\s+(.*[^\w.])(\d+(?:\.\d+)?)(ms|s)$/);
  if (glued) {
    const expr = `${glued[1]}${glued[2]}`.trim();
    return { type: 'delayexpr', value: glued[3] === 'ms' ? expr : ensureMsConversion(expr) };
  }

  return null;
}

/**
 * Start index of the delay expression of the "after X" segment the caret is in — the text right
 * after "after " — or null when the caret isn't inside one. A segment starts at the beginning
 * of the field or after a comma (merged event lists), and a comma at parenthesis depth 0
 * between the expression start and the caret means the caret has moved on to a later segment.
 */
function findAfterExpressionStart(text: string, caret: number): number | null {
  let start: number | null = null;
  for (const m of text.matchAll(/(?:^|,)\s*after\s+/g)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > caret) break;
    start = end;
  }
  if (start === null) return null;
  let depth = 0;
  for (let i = start; i < caret; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) return null;
  }
  return start;
}

/**
 * Channel/variable autocomplete for the delay expression of an "after X" time transition
 * (e.g. `after this_timeout s`, `after (conf_delay * 2) ms`). Returns null when the caret
 * isn't inside an "after " expression, so callers can fall back to their own suggestions.
 * Token bounds are absolute positions in `text`, ready for `applyExpressionSuggestion`.
 *
 * Narrower than condition autocomplete:
 *  - no operator suggestions — the comparison/logical operators don't make sense in a delay;
 *  - no "(new channel)" row — `syncThisChannels` only declares channels used by conditions and
 *    `<assign>`s, so an unknown this_ name in a delay would not actually be declared on save;
 *  - nothing at the unit position — a word typed after a completed operand and a space
 *    (`after this_x s`, `after (x) ms`) is the unit, not the start of a name.
 */
export function getAfterExpressionSuggestions(
  text: string,
  rawCursorPos: number,
  ctx: ExpressionAutocompleteContext
): { suggestions: ExpressionSuggestion[]; tokenStart: number; tokenEnd: number } | null {
  const caret = Math.min(Math.max(rawCursorPos, 0), text.length);
  const exprStart = findAfterExpressionStart(text, caret);
  if (exprStart === null) return null;

  const region = text.slice(exprStart);
  const local = getExpressionSuggestions(region, caret - exprStart, ctx);
  const tokenStart = local.tokenStart + exprStart;
  const tokenEnd = local.tokenEnd + exprStart;

  const before = region.slice(0, local.tokenStart);
  const atUnitPosition = /\s$/.test(before) && /[a-zA-Z0-9_.)\]]$/.test(before.trimEnd());
  if (atUnitPosition) return { suggestions: [], tokenStart, tokenEnd };

  return {
    suggestions: local.suggestions.filter((s) => s.kind !== 'operator' && s.kind !== 'new-channel'),
    tokenStart,
    tokenEnd,
  };
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
  if (!MS_CONVERSION_SUFFIX.test(delayValue)) return `after ${delayValue} ms`;
  const seconds = stripMsConversion(delayValue);
  // Saved before ensureMsConversion parenthesized: "a + b * 1000" multiplies only "b", so
  // showing "after a + b s" would hide what actually runs. Show the stored ms value verbatim
  // instead (re-saving it keeps it unchanged); re-typing it as "after (a + b) s" fixes it.
  return needsParensForMsConversion(seconds)
    ? `after ${delayValue} ms`
    : `after ${seconds} s`;
}

/**
 * Returns true when an event name follows the auto-generated pattern
 * {stateId}_t_{N}_timeEvent_{N}.
 */
export function isTimeEventName(name: string): boolean {
  return /^.+_t_\d+_timeEvent_\d+$/.test(name);
}

/**
 * Returns true for a pipe-delimited onentry/onexit action string (the format
 * produced by StateActionsPanel's `toStrings()`) that is the auto-generated
 * send/cancel pair backing an "after X" time transition, rather than an
 * action the user authored directly. Used to hide these rows from the State
 * Actions panel and the state node's action-count display — they still exist
 * in the underlying SCXML and remain visible in the code editor.
 */
export function isTimerGeneratedActionString(actionString: string): boolean {
  const parts = actionString.split('|');
  if (parts[0] === 'send' || parts[0] === 'cancel') {
    return isTimeEventName(parts[1] ?? '');
  }
  return false;
}

/**
 * Re-inserts timer-generated action strings (hidden from the State Actions panel by
 * `isTimerGeneratedActionString`) back into an edited action list at their original
 * position, rather than appending them at the end. Callers record each hidden action's
 * index in the pre-edit array; this splices them back in ascending index order so
 * interleaved `<send>`/`<cancel>` pairs keep their execution order relative to the
 * surrounding onentry/onexit actions (e.g. a `delayexpr` still reads a variable's value
 * as of its original position, not after later assignments). Indices are clamped to the
 * current array length so this degrades gracefully when the user added/removed rows.
 */
export function mergeHiddenActions(
  editedActions: string[],
  hiddenActions: Array<{ index: number; action: string }>
): string[] {
  const result = [...editedActions];
  const sorted = [...hiddenActions].sort((a, b) => a.index - b.index);
  for (const { index, action } of sorted) {
    result.splice(Math.min(index, result.length), 0, action);
  }
  return result;
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
 * Rewrites a single auto-generated time-event token (`{oldId}_t_{N}_timeEvent_{N}`)
 * to carry `newId` instead, if — and only if — it was generated for `oldId`.
 * A plain event name, or a time-event token belonging to some other state, is
 * returned unchanged.
 */
export function renameTimeEventToken(
  token: string,
  oldId: string,
  newId: string
): string {
  const pattern = new RegExp(`^${escapeRegExp(oldId)}_t_\\d+_timeEvent_\\d+$`);
  return pattern.test(token) ? newId + token.slice(oldId.length) : token;
}

/**
 * Applies renameTimeEventToken across a possibly comma-merged `@_event` value,
 * preserving the original string (spacing included) when nothing changed.
 */
export function renameTimeEventTokensInEventList(
  value: string | undefined,
  oldId: string,
  newId: string
): string | undefined {
  if (!value) return value;
  const tokens = value.split(',').map((t) => t.trim());
  const renamed = tokens.map((t) => renameTimeEventToken(t, oldId, newId));
  return renamed.some((t, i) => t !== tokens[i]) ? renamed.join(', ') : value;
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
