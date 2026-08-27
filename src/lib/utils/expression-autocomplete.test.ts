import { describe, it, expect } from 'vitest';
import { getExpressionSuggestions, applyExpressionSuggestion } from './expression-autocomplete';

const ctx = {
  variables: ['MainLight_color', 'this_blink_timbuff', 'this_color_old'],
  channels: [{ name: 'conf_red', type: 'cf' as const }],
  channelMappings: [{ scxmlRef: 'mapped_ref', mappedChannel: 'physical_out_1' }],
};

describe('getExpressionSuggestions', () => {
  it('suggests variables/channels/mapped-channels matching the token at the cursor (substring match)', () => {
    const text = 'MainLight_col';
    const { suggestions, tokenStart, tokenEnd } = getExpressionSuggestions(text, text.length, ctx);
    expect(suggestions).toEqual([{ label: 'MainLight_color', kind: 'variable' }]);
    expect(tokenStart).toBe(0);
    expect(tokenEnd).toBe(text.length);
  });

  it('matches by substring anywhere in the name, not just prefix', () => {
    const { suggestions } = getExpressionSuggestions('color', 5, ctx);
    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain('MainLight_color');
    expect(labels).toContain('this_color_old');
  });

  it('classifies known channels and mapped-channels correctly', () => {
    const { suggestions } = getExpressionSuggestions('conf_red', 8, ctx);
    expect(suggestions).toContainEqual({ label: 'conf_red', kind: 'channel' });

    const { suggestions: mapped } = getExpressionSuggestions('mapped_ref', 10, ctx);
    expect(mapped).toContainEqual({ label: 'mapped_ref', kind: 'mapped-channel' });
  });

  it('suggests operators right after a completed identifier followed by a space', () => {
    const text = 'MainLight_color ';
    const { suggestions } = getExpressionSuggestions(text, text.length, ctx);
    expect(suggestions).toEqual([
      { label: '==', kind: 'operator' },
      { label: '!=', kind: 'operator' },
      { label: '>=', kind: 'operator' },
      { label: '<=', kind: 'operator' },
      { label: '>', kind: 'operator' },
      { label: '<', kind: 'operator' },
      { label: '&&', kind: 'operator' },
      { label: '||', kind: 'operator' },
      { label: '?', kind: 'operator' },
      { label: ':', kind: 'operator' },
    ]);
  });

  it('suggests variables/channels right after a ternary "?" or ":" followed by a space, same as any other operator', () => {
    const conditionText = 'this_blink_timbuff <= 0.001 ? ';
    const { suggestions: afterQuestion } = getExpressionSuggestions(conditionText, conditionText.length, ctx);
    expect(afterQuestion.map((s) => s.label)).toEqual(expect.arrayContaining(['MainLight_color', 'conf_red']));

    const branchText = 'this_blink_timbuff <= 0.001 ? MainLight_color : ';
    const { suggestions: afterColon } = getExpressionSuggestions(branchText, branchText.length, ctx);
    expect(afterColon.map((s) => s.label)).toEqual(expect.arrayContaining(['MainLight_color', 'conf_red']));
  });

  it('suggests variables/channels right after an operator followed by a space', () => {
    const text = 'MainLight_color == ';
    const { suggestions } = getExpressionSuggestions(text, text.length, ctx);
    const labels = suggestions.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['MainLight_color', 'conf_red', 'mapped_ref']));
  });

  it('offers a new-channel suggestion for an unmatched this_-prefixed token', () => {
    const text = 'this_brand_new';
    const { suggestions } = getExpressionSuggestions(text, text.length, ctx);
    expect(suggestions).toEqual([{ label: 'this_brand_new', kind: 'new-channel' }]);
  });

  it('does not offer new-channel for a this_-prefixed token that already matches a known name', () => {
    const text = 'this_color_old';
    const { suggestions } = getExpressionSuggestions(text, text.length, ctx);
    expect(suggestions).toEqual([{ label: 'this_color_old', kind: 'variable' }]);
  });

  it('finds the full identifier bounds when the cursor sits in the middle of a token (mid-expression edit)', () => {
    const text = 'MainLght_color == conf_red';
    const cursorPos = 'Main'.length;
    const { tokenStart, tokenEnd } = getExpressionSuggestions(text, cursorPos, ctx);
    expect(tokenStart).toBe(0);
    expect(tokenEnd).toBe('MainLght_color'.length);
  });

  it('scopes matching to the token at the cursor, ignoring the rest of a longer expression', () => {
    const text = 'MainLight_color == conf_red ? this_color_old : this_blink_timbuff';
    const cursorPos = text.indexOf('conf_red') + 'conf_'.length;
    const { suggestions, tokenStart, tokenEnd } = getExpressionSuggestions(text, cursorPos, ctx);
    expect(suggestions).toEqual([{ label: 'conf_red', kind: 'channel' }]);
    expect(tokenStart).toBe(text.indexOf('conf_red'));
    expect(tokenEnd).toBe(text.indexOf('conf_red') + 'conf_red'.length);
  });

  it('clamps an out-of-range cursor position instead of scanning off the end of the string', () => {
    // Regression guard: without clamping, reading text[cursorPos] /
    // text[cursorPos - 1] past the string's bounds returns undefined, which
    // regex-coerces to the string "undefined" and spuriously matches
    // IDENTIFIER_CHAR, scanning tokenStart all the way back to 0.
    const text = 'MainLight_color';
    const { tokenStart, tokenEnd } = getExpressionSuggestions(text, text.length + 50, ctx);
    expect(tokenStart).toBe(0);
    expect(tokenEnd).toBe(text.length);

    const negative = getExpressionSuggestions(text, -10, ctx);
    expect(negative.tokenStart).toBe(0);
    expect(negative.tokenEnd).toBe(text.length);
  });
});

describe('applyExpressionSuggestion', () => {
  it('splices the label into the token range and reports the new cursor position', () => {
    const { newText, newCursorPos } = applyExpressionSuggestion('MainLight_col', 0, 'MainLight_col'.length, 'MainLight_color');
    expect(newText).toBe('MainLight_color');
    expect(newCursorPos).toBe('MainLight_color'.length);
  });

  it('preserves text after the replaced token (mid-expression replacement)', () => {
    const text = 'MainLght_color == conf_red';
    const { newText, newCursorPos } = applyExpressionSuggestion(text, 0, 'MainLght_color'.length, 'MainLight_color');
    expect(newText).toBe('MainLight_color == conf_red');
    expect(newCursorPos).toBe('MainLight_color'.length);
  });
});
