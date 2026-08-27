import type { ChannelInfo, ChannelMapping } from '@/types/host-api';

export type ExpressionSuggestionKind = 'channel' | 'mapped-channel' | 'variable' | 'operator' | 'new-channel';

export interface ExpressionSuggestion {
  label: string;
  kind: ExpressionSuggestionKind;
}

export interface ExpressionAutocompleteContext {
  variables: string[];
  channels: ChannelInfo[];
  channelMappings: ChannelMapping[];
}

export const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||', '?', ':'];
const OPERATOR_SET = new Set([...OPERATORS, '!']);
const IDENTIFIER_CHAR = /[a-zA-Z0-9_]/;

function findTokenBounds(text: string, cursorPos: number): { tokenStart: number; tokenEnd: number } {
  let start = cursorPos;
  while (start > 0 && IDENTIFIER_CHAR.test(text[start - 1])) start--;
  let end = cursorPos;
  while (end < text.length && IDENTIFIER_CHAR.test(text[end])) end++;
  return { tokenStart: start, tokenEnd: end };
}

// Nearest non-whitespace run immediately before `fromPos`, skipping any
// whitespace first — used to decide whether the last completed token was an
// operand (suggest an operator next) or an operator (suggest an operand).
function findPrevToken(text: string, fromPos: number): string {
  let i = fromPos;
  while (i > 0 && /\s/.test(text[i - 1])) i--;
  const end = i;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return text.slice(i, end);
}

export function getExpressionSuggestions(
  text: string,
  rawCursorPos: number,
  ctx: ExpressionAutocompleteContext
): { suggestions: ExpressionSuggestion[]; tokenStart: number; tokenEnd: number } {
  // Clamp defensively: every current call site keeps cursorPos within
  // [0, text.length], but this module is shared across independently-evolving
  // components that each track cursor state through their own DOM handlers —
  // an out-of-range value would otherwise read text[-1] or text[text.length]
  // (undefined), which coerces to the string "undefined" and spuriously
  // matches IDENTIFIER_CHAR, scanning left all the way to 0.
  const cursorPos = Math.min(Math.max(rawCursorPos, 0), text.length);
  const { tokenStart, tokenEnd } = findTokenBounds(text, cursorPos);

  const channelSet = new Set(ctx.channels.map((c) => c.name));
  const scxmlRefSet = new Set(ctx.channelMappings.map((m) => m.scxmlRef));
  const allNames = Array.from(
    new Set([...ctx.variables, ...ctx.channels.map((c) => c.name), ...ctx.channelMappings.map((m) => m.scxmlRef)])
  );
  const kindOf = (name: string): ExpressionSuggestionKind =>
    channelSet.has(name) ? 'channel' : scxmlRefSet.has(name) ? 'mapped-channel' : 'variable';

  // Cursor sits right at a word boundary with nothing typed yet at this
  // position, and immediately after whitespace — the "just finished a token,
  // now deciding operator vs. operand" position.
  if (tokenStart === cursorPos && cursorPos > 0 && /\s/.test(text[cursorPos - 1])) {
    const prevToken = findPrevToken(text, cursorPos);
    if (OPERATOR_SET.has(prevToken)) {
      return { suggestions: allNames.map((n) => ({ label: n, kind: kindOf(n) })), tokenStart, tokenEnd };
    }
    return { suggestions: OPERATORS.map((op) => ({ label: op, kind: 'operator' as const })), tokenStart, tokenEnd };
  }

  const rawToken = text.slice(tokenStart, cursorPos);
  const filtered = allNames.filter((n) => n.toLowerCase().includes(rawToken.toLowerCase()));
  if (filtered.length === 0 && rawToken.startsWith('this_')) {
    return { suggestions: [{ label: rawToken, kind: 'new-channel' }], tokenStart, tokenEnd };
  }
  return { suggestions: filtered.map((n) => ({ label: n, kind: kindOf(n) })), tokenStart, tokenEnd };
}

export function applyExpressionSuggestion(
  text: string,
  tokenStart: number,
  tokenEnd: number,
  label: string
): { newText: string; newCursorPos: number } {
  const newText = text.slice(0, tokenStart) + label + text.slice(tokenEnd);
  return { newText, newCursorPos: tokenStart + label.length };
}
