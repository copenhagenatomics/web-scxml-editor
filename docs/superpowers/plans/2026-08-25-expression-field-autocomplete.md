# Expression Field Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cursor-aware variable/channel/operator autocomplete to the Expression textarea in `state-actions-panel.tsx`, by extracting `transition-panel.tsx`'s existing token-aware suggestion engine into a shared, cursor-position-aware module.

**Architecture:** A new pure-function module (`expression-autocomplete.ts`) computes suggestions and token replacement ranges from `(text, cursorPos, context)` instead of assuming the cursor is always at the end of the string. `transition-panel.tsx`'s condition-mode suggestions are refactored onto this module first (as a low-risk proof it's behavior-preserving), then `state-actions-panel.tsx`'s Expression field is wired to it, with a caret-position utility (`textarea-caret.ts`) so the dropdown tracks the text cursor instead of anchoring below the whole field.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react (jsdom environment), Zustand (`useHostAPIStore`).

**Spec:** `docs/superpowers/specs/2026-08-25-expression-field-autocomplete-design.md`

---

## Task 1: Expression Autocomplete Engine

**Files:**
- Create: `src/lib/utils/expression-autocomplete.ts`
- Test: `src/lib/utils/expression-autocomplete.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/utils/expression-autocomplete.test.ts
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
    ]);
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
    // cursor between "Main" and "Lght_color" — a typo the user is fixing mid-word
    const text = 'MainLght_color == conf_red';
    const cursorPos = 'Main'.length;
    const { tokenStart, tokenEnd } = getExpressionSuggestions(text, cursorPos, ctx);
    expect(tokenStart).toBe(0);
    expect(tokenEnd).toBe('MainLght_color'.length);
  });

  it('scopes matching to the token at the cursor, ignoring the rest of a longer expression', () => {
    const text = 'MainLight_color == conf_red ? this_color_old : this_blink_timbuff';
    const cursorPos = text.indexOf('conf_red') + 'conf_'.length; // cursor after "conf_" inside "conf_red"
    const { suggestions, tokenStart, tokenEnd } = getExpressionSuggestions(text, cursorPos, ctx);
    expect(suggestions).toEqual([{ label: 'conf_red', kind: 'channel' }]);
    expect(tokenStart).toBe(text.indexOf('conf_red'));
    expect(tokenEnd).toBe(text.indexOf('conf_red') + 'conf_red'.length);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/expression-autocomplete.test.ts`
Expected: FAIL — `Cannot find module './expression-autocomplete'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/utils/expression-autocomplete.ts
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

export const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||'];
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
  cursorPos: number,
  ctx: ExpressionAutocompleteContext
): { suggestions: ExpressionSuggestion[]; tokenStart: number; tokenEnd: number } {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/expression-autocomplete.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/expression-autocomplete.ts src/lib/utils/expression-autocomplete.test.ts
git commit -m "feat: add cursor-aware expression autocomplete engine"
```

---

## Task 2: Textarea Caret Coordinate Utility

**Files:**
- Create: `src/lib/utils/textarea-caret.ts`
- Test: `src/lib/utils/textarea-caret.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/utils/textarea-caret.test.ts
import { describe, it, expect } from 'vitest';
import { getCaretCoordinates } from './textarea-caret';

describe('getCaretCoordinates', () => {
  // jsdom implements the DOM but not real CSS layout, so every size/position
  // read comes back 0 regardless of content (same limitation documented in
  // src/lib/layout/measure-label-width.ts). Real pixel-accurate caret
  // coordinates can only be verified in a real browser; here we verify the
  // documented jsdom fallback and that the mirror element is always cleaned
  // up, never leaked into the document.
  it('returns null under jsdom (no real layout engine)', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = 'MainLight_color == conf_red';

    expect(getCaretCoordinates(textarea, 10)).toBeNull();

    document.body.removeChild(textarea);
  });

  it('never leaves a mirror element attached to the document', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = 'this_channel';

    getCaretCoordinates(textarea, 4);

    expect(document.querySelectorAll('div').length).toBe(0);
    document.body.removeChild(textarea);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/textarea-caret.test.ts`
Expected: FAIL — `Cannot find module './textarea-caret'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/utils/textarea-caret.ts

/**
 * Pixel position of the caret at `offset` within `textarea`, relative to the
 * textarea's own top-left corner — or `null` when no real layout engine is
 * available to measure with (jsdom: every size/position read comes back 0
 * regardless of content, same limitation as measure-label-width.ts). Callers
 * should fall back to anchoring the dropdown below the field in that case.
 *
 * Technique: clone the textarea's relevant computed styles into a hidden
 * mirror <div>, insert the text up to `offset` followed by a marker <span>,
 * measure the marker's offset, then remove the mirror. This is the standard
 * "mirror div" approach for caret coordinates (no native browser API exists
 * for this on a plain <textarea>).
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  offset: number
): { top: number; left: number; height: number } | null {
  if (typeof document === 'undefined') return null;

  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  try {
    const style = getComputedStyle(textarea);
    const props: (keyof CSSStyleDeclaration)[] = [
      'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textIndent',
    ];
    for (const prop of props) {
      // style[prop] is always a string for these CSS-text properties.
      (mirror.style as unknown as Record<string, string>)[prop as string] = style[prop] as string;
    }
    mirror.style.position = 'absolute';
    mirror.style.top = '-9999px';
    mirror.style.left = '-9999px';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';

    mirror.textContent = textarea.value.slice(0, offset);
    marker.textContent = textarea.value.slice(offset) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const top = marker.offsetTop;
    const left = marker.offsetLeft;
    const height = marker.offsetHeight;

    if (top === 0 && left === 0 && height === 0) return null;
    return { top, left, height };
  } catch {
    return null;
  } finally {
    if (mirror.isConnected) document.body.removeChild(mirror);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/textarea-caret.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/textarea-caret.ts src/lib/utils/textarea-caret.test.ts
git commit -m "feat: add caret pixel-coordinate utility for textareas"
```

---

## Task 3: Characterization Tests for Transition Panel's Condition-Mode Suggestions

Written against the **current** (pre-refactor) implementation, as a safety net for Task 4.

**Files:**
- Create: `src/components/diagram/transition-panel.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
// src/components/diagram/transition-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransitionPanel } from './transition-panel';
import { useHostAPIStore } from '@/stores/host-api-store';

const noop = () => {};

function renderPanel(overrides: Partial<Parameters<typeof TransitionPanel>[0]> = {}) {
  return render(
    <TransitionPanel
      edgeId='e1'
      source='StateA'
      target='StateB'
      cond=''
      scxmlContent='<scxml xmlns="http://www.w3.org/2005/07/scxml"><datamodel><data id="MainLight_color" expr="0"/></datamodel><state id="StateA"/><state id="StateB"/></scxml>'
      onApply={() => undefined}
      onClose={noop}
      {...overrides}
    />
  );
}

beforeEach(() => {
  useHostAPIStore.setState({
    channels: [{ name: 'conf_red', type: 'cf' }],
    channelMappings: [],
    events: [],
  });
});

describe('TransitionPanel condition-mode suggestions (characterization)', () => {
  it('suggests known variables and channels by substring match while typing', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'color' } });

    expect(screen.getByText('MainLight_color')).toBeInTheDocument();
  });

  it('suggests operators right after a completed identifier followed by a space', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'MainLight_color ' } });

    expect(screen.getByText('==')).toBeInTheDocument();
  });

  it('suggests variables again right after an operator followed by a space', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'MainLight_color == ' } });

    expect(screen.getByText('MainLight_color')).toBeInTheDocument();
    expect(screen.getByText('conf_red')).toBeInTheDocument();
  });

  it('offers a new-channel suggestion for an unmatched this_-prefixed token', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Condition' }));
    fireEvent.change(screen.getByPlaceholderText('Enter condition'), { target: { value: 'this_brand_new' } });

    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass against the current implementation**

Run: `npx vitest run src/components/diagram/transition-panel.test.tsx`
Expected: PASS (4 tests) — this locks in current behavior before refactoring.

- [ ] **Step 3: Commit**

```bash
git add src/components/diagram/transition-panel.test.tsx
git commit -m "test: characterize transition panel condition-mode suggestions before refactor"
```

---

## Task 4: Refactor Transition Panel to Use the Shared Engine

**Files:**
- Modify: `src/components/diagram/transition-panel.tsx:1-19` (imports, drop local `OPERATORS`/`OPERATOR_SET`)
- Modify: `src/components/diagram/transition-panel.tsx:141-163` (cond-mode suggestions + `buildCondValue`)

- [ ] **Step 1: Update imports and remove the now-duplicated constants**

At the top of `transition-panel.tsx`, replace:

```ts
type Suggestion = { label: string; kind: 'channel' | 'event' | 'variable' | 'new-channel' | 'mapped-channel' | 'operator' };

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||'];
const OPERATOR_SET = new Set([...OPERATORS, '!']);
const MAX_TEXTAREA_HEIGHT = 200;
```

with:

```ts
import { getExpressionSuggestions, applyExpressionSuggestion } from '@/lib/utils/expression-autocomplete';

type Suggestion = { label: string; kind: 'channel' | 'event' | 'variable' | 'new-channel' | 'mapped-channel' | 'operator' };

const MAX_TEXTAREA_HEIGHT = 200;
```

(Add the `import` line near the other local imports at the top of the file, not inline where shown above.)

- [ ] **Step 2: Replace the cond-mode branch of the `suggestions` memo**

Replace the body of the `suggestions` memo (currently lines 120–155) so the `cond` branch delegates to the shared engine, keeping the `event` branch untouched:

```ts
  const suggestions: Suggestion[] = React.useMemo(() => {
    const vars = extractDatamodelVariables(scxmlContent);
    const eventNames = events.map((e) => e.name);

    if (rawValue.trimStart().startsWith('after')) return [];

    if (selectionMode === 'event') {
      const endsWithSeparator = /,\s*$/.test(rawValue);
      const segments = rawValue.split(',');
      const lastSegment = endsWithSeparator ? '' : (segments[segments.length - 1] ?? '').trim();
      const prefix = lastSegment.toLowerCase();
      return eventNames
        .filter((n) => n.toLowerCase().includes(prefix))
        .map((n) => ({ label: n, kind: 'event' as const }));
    }

    const { suggestions } = getExpressionSuggestions(rawValue, rawValue.length, {
      variables: vars,
      channels,
      channelMappings,
    });
    return suggestions;
  }, [rawValue, channels, channelMappings, events, scxmlContent, selectionMode]);
```

- [ ] **Step 3: Replace `buildCondValue` to delegate token replacement to the shared engine**

Replace:

```ts
  const buildCondValue = (label: string) => {
    const endsWithSpace = rawValue.endsWith(' ');
    if (endsWithSpace) return rawValue + label;
    const tokens = rawValue.split(/\s+/);
    tokens[tokens.length - 1] = label;
    return tokens.join(' ');
  };
```

with:

```ts
  const buildCondValue = (label: string) => {
    const { tokenStart, tokenEnd } = getExpressionSuggestions(rawValue, rawValue.length, {
      variables: extractDatamodelVariables(scxmlContent),
      channels,
      channelMappings,
    });
    return applyExpressionSuggestion(rawValue, tokenStart, tokenEnd, label).newText;
  };
```

- [ ] **Step 4: Run the characterization tests from Task 3 to confirm no regression**

Run: `npx vitest run src/components/diagram/transition-panel.test.tsx`
Expected: PASS (4 tests, unchanged) — refactor is behavior-preserving.

- [ ] **Step 5: Run the full test suite to check for unrelated breakage**

Run: `npm test`
Expected: PASS (no new failures)

- [ ] **Step 6: Commit**

```bash
git add src/components/diagram/transition-panel.tsx
git commit -m "refactor: delegate transition panel cond suggestions to shared engine"
```

---

## Task 5: Wire Expression-Field Autocomplete State into State Actions Panel

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx:1-20` (imports)
- Modify: `src/components/ui/state-actions-panel.tsx:180-192` (new state + data sources)
- Modify: `src/components/ui/state-actions-panel.tsx:519-535` (Expression textarea)

- [ ] **Step 1: Add imports and new autocomplete state**

Add to the import block at the top of the file:

```ts
import {
  getExpressionSuggestions,
  applyExpressionSuggestion,
  type ExpressionSuggestion,
} from '@/lib/utils/expression-autocomplete';
```

After the existing Location-field autocomplete state (around line 183, right after `const blurTimerRef = ...`), add:

```ts
  // Autocomplete state — expression field (independent of the location
  // field's: different token model — multi-token expression vs. a single
  // identifier — and its own cursor position to track).
  const [isExprOpen, setIsExprOpen] = React.useState(false);
  const [exprActiveIndex, setExprActiveIndex] = React.useState(-1);
  const [exprCursorPos, setExprCursorPos] = React.useState(0);
  const exprBlurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const exprTextareaRef = React.useRef<HTMLTextAreaElement>(null);
```

Add `channelMappings` alongside the existing `channels` selector (near line 187):

```ts
  const channels = useHostAPIStore((s) => s.channels);
  const channelMappings = useHostAPIStore((s) => s.channelMappings);
```

Extend the blur-timer cleanup effect (currently lines 217–221) to also clear the new timer:

```ts
  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (exprBlurTimerRef.current) clearTimeout(exprBlurTimerRef.current);
    };
  }, []);
```

Extend `resetForm` (currently lines 196–205) to also close the expression dropdown:

```ts
  const resetForm = React.useCallback(() => {
    setFormMode('idle');
    setEditingRowIndex(null);
    setFormEvent('');
    setFormLocation('');
    setFormExpr('');
    setFormReactionType('internal');
    setIsOpen(false);
    setActiveIndex(-1);
    setIsExprOpen(false);
    setExprActiveIndex(-1);
  }, []);
```

- [ ] **Step 2: Add the expression suggestions memo and selection handler**

Add after the existing Location-field `suggestions` memo (after line 238):

```ts
  const exprSuggestionResult = React.useMemo(() => {
    if (formMode === 'idle') return { suggestions: [] as ExpressionSuggestion[], tokenStart: 0, tokenEnd: 0 };
    return getExpressionSuggestions(formExpr, exprCursorPos, {
      variables: dataVars,
      channels,
      channelMappings,
    });
  }, [formExpr, exprCursorPos, dataVars, channels, channelMappings, formMode]);

  const exprSuggestions = exprSuggestionResult.suggestions;
  const showExprSuggestions = isExprOpen && exprSuggestions.length > 0;

  const selectExprSuggestion = (s: ExpressionSuggestion) => {
    const { newText, newCursorPos } = applyExpressionSuggestion(
      formExpr,
      exprSuggestionResult.tokenStart,
      exprSuggestionResult.tokenEnd,
      s.label
    );
    setFormExpr(newText);
    setIsExprOpen(false);
    setExprActiveIndex(-1);
    requestAnimationFrame(() => {
      exprTextareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      exprTextareaRef.current?.focus();
    });

    // The channel just needs to exist as a <data> element for the expression
    // to reference it — the assign row itself (location/expr) isn't
    // committed until Apply, so we pass the *current*, unmodified action
    // lists here rather than anything from the in-progress form. This makes
    // the parent's list-update step a no-op re-write while still running its
    // AddDataCommand step to register the channel.
    if (s.kind === 'new-channel' && onNewChannel) {
      if (activeTab === 'reactions') {
        onNewChannel(s.label, {
          kind: 'reactions',
          actions: localReactions.map(({ _rowId, ...rest }) => rest),
        });
      } else {
        onNewChannel(s.label, {
          kind: 'actions',
          entryActions: toStrings(localEntry),
          exitActions: toStrings(localExit),
        });
      }
    }
  };
```

- [ ] **Step 3: Run TypeScript to check the new code compiles**

Run: `npx tsc --noEmit`
Expected: no new errors from `state-actions-panel.tsx`. (The Expression textarea itself isn't wired to this new state yet — that's Task 6 — so `showExprSuggestions`/`selectExprSuggestion` are unused for now; this step exists only to catch type errors early. Ignore an "unused variable" warning if your linter treats it as an error — it resolves in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx
git commit -m "feat: add expression-field autocomplete state to state actions panel"
```

---

## Task 6: Expression Suggestion Dropdown UI (Caret-Positioned)

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx:519-535` (Expression textarea + dropdown)
- Test: `src/components/ui/state-actions-panel.test.tsx` (append new `describe` block)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ui/state-actions-panel.test.tsx`:

```tsx
describe('StateActionsPanel expression field autocomplete', () => {
  it('suggests a matching datamodel variable while typing in the Expression field', () => {
    renderPanel({ scxmlContent: scxmlWithData('MainLight_color') });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'MainLight_col' } });

    expect(screen.getByText('MainLight_color')).toBeInTheDocument();
  });

  it('replaces only the token at the cursor when selecting a suggestion, preserving the rest of the expression', () => {
    renderPanel({ scxmlContent: scxmlWithData('MainLight_color') });

    fireEvent.click(screen.getByTitle('Add action'));
    const textarea = screen.getByPlaceholderText('expression') as HTMLTextAreaElement;
    // fireEvent.change assigns target.value onto the real node before dispatching
    // the input event, and selectionStart is a settable property on <textarea> —
    // this sets the cursor to right after "MainLight_col" (position 14) in the
    // same step, deterministically, instead of relying on jsdom's selection
    // behavior when re-setting an unchanged value.
    fireEvent.change(textarea, { target: { value: 'MainLight_col == 1', selectionStart: 14 } });

    fireEvent.click(screen.getByText('MainLight_color'));

    expect(textarea.value).toBe('MainLight_color == 1');
  });

  it('offers a "(new channel)" suggestion for an unmatched this_-prefixed token in the Expression field', () => {
    renderPanel();

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    expect(screen.getByText('(new channel)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: FAIL — the Expression textarea has no dropdown/suggestions wired up yet.

- [ ] **Step 3: Wire the Expression textarea to the new state and render the dropdown**

Replace the Expression field block (currently lines 519–535):

```tsx
      <div>
        <label className='text-[10px] text-muted block mb-0.5'>Expression</label>
        <textarea
          value={formExpr}
          onChange={(e) => setFormExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleApply();
            }
            if (e.key === 'Escape') resetForm();
          }}
          placeholder='expression'
          rows={3}
          className={`${inputClass} resize-y font-mono`}
        />
      </div>
```

with:

```tsx
      <div className='relative'>
        <label className='text-[10px] text-muted block mb-0.5'>Expression</label>
        <textarea
          ref={exprTextareaRef}
          value={formExpr}
          onChange={(e) => {
            setFormExpr(e.target.value);
            setExprCursorPos(e.target.selectionStart ?? e.target.value.length);
            setIsExprOpen(true);
            setExprActiveIndex(-1);
          }}
          onBlur={() => {
            exprBlurTimerRef.current = setTimeout(() => setIsExprOpen(false), 100);
          }}
          onKeyDown={(e) => {
            if (showExprSuggestions) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setExprActiveIndex((p) => (p < exprSuggestions.length - 1 ? p + 1 : 0));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setExprActiveIndex((p) => (p > 0 ? p - 1 : exprSuggestions.length - 1));
                return;
              }
              if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                selectExprSuggestion(exprSuggestions[exprActiveIndex >= 0 ? exprActiveIndex : 0]);
                return;
              }
              if (e.key === 'Escape') {
                setIsExprOpen(false);
                setExprActiveIndex(-1);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleApply();
            }
            if (e.key === 'Escape') resetForm();
          }}
          placeholder='expression'
          rows={3}
          className={`${inputClass} resize-y font-mono`}
        />
        {showExprSuggestions && (
          <ExpressionSuggestionDropdown
            textareaEl={exprTextareaRef.current}
            cursorPos={exprCursorPos}
            suggestions={exprSuggestions}
            activeIndex={exprActiveIndex}
            channels={channels}
            channelMappings={channelMappings}
            onSelect={selectExprSuggestion}
          />
        )}
      </div>
```

- [ ] **Step 4: Add the `ExpressionSuggestionDropdown` component**

First, add these two imports to the existing import block at the top of the file (alongside the `expression-autocomplete` import added in Task 5):

```ts
import { getCaretCoordinates } from '@/lib/utils/textarea-caret';
import type { ChannelInfo, ChannelMapping } from '@/types/host-api';
```

Then add this component in the same file, above the `StateActionsPanel` export (it's only used here, so it doesn't need its own file — same pattern as `SortableActionRow` already in this file):

```tsx
interface ExpressionSuggestionDropdownProps {
  textareaEl: HTMLTextAreaElement | null;
  cursorPos: number;
  suggestions: ExpressionSuggestion[];
  activeIndex: number;
  channels: ChannelInfo[];
  channelMappings: ChannelMapping[];
  onSelect: (s: ExpressionSuggestion) => void;
}

function ExpressionSuggestionDropdown({
  textareaEl,
  cursorPos,
  suggestions,
  activeIndex,
  channels,
  channelMappings,
  onSelect,
}: ExpressionSuggestionDropdownProps) {
  const caret = textareaEl ? getCaretCoordinates(textareaEl, cursorPos) : null;

  // Assumed dropdown width for clamping, matching the max-w set on the
  // dropdown's own class below — keeps it from overflowing the panel's
  // right edge when the caret is near the end of a long line.
  const DROPDOWN_WIDTH = 200;
  const containerWidth = textareaEl?.clientWidth ?? 0;
  const clampedLeft = caret ? Math.max(0, Math.min(caret.left, containerWidth - DROPDOWN_WIDTH)) : 0;

  const positionStyle: React.CSSProperties = caret
    ? { top: caret.top + caret.height + 4, left: clampedLeft }
    : {};
  const positionClassName = caret
    ? 'absolute z-50 bg-elevated border border-default rounded shadow-lg max-h-36 w-[200px] overflow-y-auto'
    : 'absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded shadow-lg max-h-36 overflow-y-auto';

  const renderBadge = (s: ExpressionSuggestion) => {
    if (s.kind === 'operator' || s.kind === 'new-channel') return null;
    const type =
      s.kind === 'variable'
        ? getVariableType(s.label)
        : s.kind === 'channel'
          ? channels.find((c) => c.name === s.label)?.type
          : channels.find((c) => c.name === channelMappings.find((m) => m.scxmlRef === s.label)?.mappedChannel)?.type;
    if (!type) return null;
    return (
      <span
        className='text-xs px-1 rounded font-mono text-black'
        style={{ backgroundColor: BADGE_COLORS[type] }}
      >
        {type}
      </span>
    );
  };

  return (
    <div className={positionClassName} style={positionStyle}>
      {suggestions.map((s, i) => (
        <div
          key={`${s.kind}-${s.label}`}
          onMouseDown={() => onSelect(s)}
          className={`px-2 py-1 text-xs cursor-pointer flex items-center gap-2 ${
            s.kind === 'new-channel'
              ? 'bg-amber-50 text-amber-800 border-l-2 border-amber-400'
              : i === activeIndex
                ? 'bg-primary text-primary-fg'
                : 'hover:bg-primary-muted text-default'
          }`}
        >
          {s.kind === 'new-channel' && <span className='text-xs text-amber-600'>(new channel)</span>}
          {renderBadge(s)}
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (no new failures)

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/ui/state-actions-panel.test.tsx
git commit -m "feat: caret-positioned suggestion dropdown for the expression field"
```

---

## Task 7: New-Channel-at-Selection Integration Test

Task 5 already implements the new-channel-at-selection wiring (`selectExprSuggestion`'s `onNewChannel` call). This task adds the integration test proving it end-to-end and checks the no-op-list-update behavior specifically.

**Files:**
- Test: `src/components/ui/state-actions-panel.test.tsx` (append to the new-channel describe block)

- [ ] **Step 1: Write the test**

Append inside `describe('StateActionsPanel new-channel suggestions', ...)`:

```tsx
  it('registers a new channel referenced inside the Expression field immediately on selection, without touching the committed action lists', () => {
    const onApply = vi.fn();
    const onNewChannel = vi.fn();
    renderPanel({
      entryActions: [{ type: 'assign', location: 'existingVar', expr: '1' }],
      onApply,
      onNewChannel,
    });

    fireEvent.click(screen.getByTitle('Add action'));
    fireEvent.change(screen.getByPlaceholderText('variable or channel'), { target: { value: 'target' } });
    fireEvent.change(screen.getByPlaceholderText('expression'), { target: { value: 'this_new_thing' } });

    fireEvent.click(screen.getByText('(new channel)'));

    // Registration fires immediately — before Apply is ever clicked — and
    // carries the *current* committed lists unchanged (the in-progress
    // "target = this_new_thing" row isn't in here yet; that only happens
    // when Apply is clicked, same as any other row).
    expect(onNewChannel).toHaveBeenCalledWith('this_new_thing', {
      kind: 'actions',
      entryActions: ['assign|existingVar|1'],
      exitActions: [],
    });
    expect(onApply).not.toHaveBeenCalled();

    // The textarea now contains the accepted suggestion; the form is still
    // open and editable (selecting a suggestion is not the same as applying).
    expect(screen.getByPlaceholderText('expression')).toHaveValue('this_new_thing');
    expect(screen.getByPlaceholderText('variable or channel')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/components/ui/state-actions-panel.test.tsx`
Expected: PASS

- [ ] **Step 3: Run the full test suite one final time**

Run: `npm test`
Expected: PASS (no failures)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/state-actions-panel.test.tsx
git commit -m "test: cover new-channel registration from the expression field"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Section 1 (shared engine) → Task 1. Section 2 (cursor-aware tokens) → Task 1. Section 3 (caret dropdown) → Task 2 + Task 6. Section 4 (integration/keyboard) → Task 5 + Task 6. Section 5 (new-channel timing) → Task 5 (`selectExprSuggestion`) + Task 7 (test). Section 6 (data sources) → no new code, reused directly in Task 5. Out-of-scope items (edit bar, Event field, Location-field migration, Monaco) are untouched by every task above.
- **transition-panel.tsx refactor risk:** mitigated by writing characterization tests (Task 3) against the *current* implementation before touching it (Task 4), then re-running the same tests unchanged afterward.
- **New-channel timing resolution:** the spec approved "register at selection time," but didn't address that the existing `onNewChannel` prop bundles channel-registration with an action-list update. Task 5/7 resolve this by passing the current, uncommitted-form-excluded lists — registering the channel without prematurely saving the in-progress row. This is an implementation detail consistent with the approved spec's intent, not a new product decision.
