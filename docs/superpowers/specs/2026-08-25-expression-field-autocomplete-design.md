# Expression Field Autocomplete — Design Spec

**Date:** 2026-08-25
**Branch:** new-requirements-ui

---

## Overview

Add variable/channel autocomplete to the **Expression** field in the State Actions panel (`src/components/ui/state-actions-panel.tsx`) — used for `assign` actions (onentry/onexit) and event reactions. Today this is a plain `<textarea>` with no suggestions.

This is the last major gap in expression-entry UX: the **Location** field in the same panel already has prefix-match autocomplete, and the transition panel's `cond` field already has a token-aware engine (operators, variables, channels, new-channel creation). This spec brings the Expression field up to the same level by generalizing the transition panel's engine into a shared, cursor-aware module — rather than writing a fourth divergent implementation.

**Out of scope** (per explicit decision during brainstorming): the legacy `state-actions-edit-bar.tsx` and the reaction `Event` field are not touched by this change.

---

## Section 1 — Shared Suggestion Engine

### New file: `src/lib/utils/expression-autocomplete.ts`

Extracts and generalizes the suggestion logic currently embedded in `transition-panel.tsx` (lines 120–163), which assumes the cursor is always at the end of the string. The new module works from an arbitrary cursor offset so it is correct when a user edits in the middle of a long expression (e.g. a multi-line ternary), not just when appending at the end.

```ts
export type Suggestion = {
  label: string;
  kind: 'channel' | 'mapped-channel' | 'variable' | 'operator' | 'new-channel';
};

export interface ExpressionAutocompleteContext {
  variables: string[];        // extractDatamodelVariables(scxmlContent)
  channels: ChannelInfo[];    // useHostAPIStore(s => s.channels)
  channelMappings: ChannelMapping[]; // useHostAPIStore(s => s.channelMappings)
}

export function getExpressionSuggestions(
  text: string,
  cursorPos: number,
  ctx: ExpressionAutocompleteContext
): { suggestions: Suggestion[]; tokenStart: number; tokenEnd: number };

export function applyExpressionSuggestion(
  text: string,
  tokenStart: number,
  tokenEnd: number,
  label: string
): { newText: string; newCursorPos: number };
```

`transition-panel.tsx`'s `cond` mode is refactored to call `getExpressionSuggestions`/`applyExpressionSuggestion` with `cursorPos = text.length` (preserving its current end-of-string behavior exactly), so there is one engine instead of a third divergent copy. Its `event` mode (comma-segment matching) and `state-actions-panel.tsx`'s Location field (single-identifier prefix match) are unrelated token models and are **not** migrated to this module — they stay as they are.

### Operators and suggestion rules (unchanged from transition panel)

```
OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||']
OPERATOR_SET = OPERATORS ∪ ['!']
```

- If the token immediately before the cursor position is a completed operand and is followed by whitespace → suggest `OPERATORS`.
- Otherwise → suggest variables + channels + mapped-channels whose name includes the current partial token (case-insensitive).
- If nothing matches and the current partial token starts with `this_` → suggest a single `{ label: token, kind: 'new-channel' }`.

---

## Section 2 — Cursor-Aware Token Detection

Given `text` and `cursorPos`:

1. Scan left from `cursorPos` while characters match `[a-zA-Z0-9_]` → `tokenStart`.
2. Scan right from `cursorPos` while characters match `[a-zA-Z0-9_]` → `tokenEnd`.
   (Handles clicking into the middle of an existing identifier — the whole token is replaced on selection, not just inserted at the cursor.)
3. Walk left from `tokenStart`, skipping whitespace, to find the nearest preceding non-whitespace token — used for the operator-vs-identifier decision, replacing today's string-end-relative `endsWithSpace`/`prevToken` check in `transition-panel.tsx`.

`applyExpressionSuggestion` splices `label` into `[tokenStart, tokenEnd)` and returns the new cursor position (`tokenStart + label.length`), so the caller can restore textarea selection after the state update (`textarea.setSelectionRange(...)` in a `useEffect`/`useLayoutEffect` keyed on the applied suggestion).

---

## Section 3 — Caret-Positioned Dropdown

### New file: `src/lib/utils/textarea-caret.ts`

```ts
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  offset: number
): { top: number; left: number; height: number };
```

Implements the standard "mirror div" technique: clones the textarea's relevant computed styles (font, padding, border, `white-space: pre-wrap`, `word-wrap: break-word`, width) into a hidden, absolutely-positioned `<div>`, inserts the textarea's text up to `offset` followed by a marker `<span>`, measures the marker's `offsetTop`/`offsetLeft`/`offsetHeight`, then removes the mirror div. No external library — this is a small, well-known algorithm implemented locally to avoid adding a dependency.

### Dropdown placement

Reuses the existing visual style from the Location field's dropdown (`absolute z-50 bg-elevated border border-default rounded shadow-lg max-h-36 overflow-y-auto`, per-row type badges via `BADGE_COLORS`/`getVariableType`, amber-tinted new-channel row), but is positioned via inline `style={{ top, left }}` computed from `getCaretCoordinates(textareaEl, cursorPos)` relative to the textarea's nearest positioned ancestor, placed just below the caret's `top + height`. Horizontal position is clamped so the dropdown never overflows the panel's right edge.

---

## Section 4 — Integration into `state-actions-panel.tsx`

The Expression `<textarea>` (currently lines 519–535) gains its own autocomplete state, parallel to but independent from the Location field's (`isOpen`/`activeIndex` are already used for Location — the Expression field gets its own `isExprOpen`/`exprActiveIndex` plus tracked `cursorPos`):

- `onChange`: update `formExpr`, recompute `cursorPos` from `e.target.selectionStart`, call `getExpressionSuggestions`, open dropdown if non-empty.
- `onKeyDown`: when the Expression dropdown is open, `ArrowUp`/`ArrowDown`/`Tab`/`Enter`/`Escape` are captured first for suggestion navigation (mirroring `handleLocationKeyDown`'s existing pattern at lines 380–405). When the dropdown is **not** open, existing behavior is preserved unchanged: plain `Enter` submits the form (`handleApply`), `Shift+Enter` inserts a newline, `Escape` resets the form.
- `onBlur`: same 100ms `blurTimerRef` delay pattern already used for Location, so a suggestion's `onMouseDown` fires before the dropdown closes.
- Selecting a suggestion calls `applyExpressionSuggestion`, updates `formExpr` and restores the textarea's cursor position, and closes the dropdown.

---

## Section 5 — New-Channel Handling

Unlike the Location field — where the entire field *is* the channel name, so `onNewChannel` fires at Apply time via the existing `isNewChannel` check in `handleApply` — the Expression field's new-channel token is just one identifier inside a larger expression. Selecting `"(new channel)"` from the Expression dropdown therefore calls the existing `onNewChannel` prop **immediately at selection time** (registers the channel via the host API right away), independent of whether the user later clicks Apply or Discard. This is a deliberate behavioral difference from the Location field, confirmed during design: accepting the suggestion is treated as the commit point, matching how autocomplete "accept" behaves in code editors generally.

---

## Section 6 — Data Sources (no changes needed)

| Source | Import | Already used by |
|---|---|---|
| Datamodel variables | `extractDatamodelVariables(scxmlContent)` | `src/lib/utils/datamodel-extractor.ts` |
| Host channels | `useHostAPIStore(s => s.channels)` | `src/stores/host-api-store.ts` |
| Channel mappings | `useHostAPIStore(s => s.channelMappings)` | `src/stores/host-api-store.ts` |
| Type badge lookup | `getVariableType`, `BADGE_COLORS` | `src/lib/utils/common-utils.ts` |

---

## Out of Scope

- `state-actions-edit-bar.tsx` (legacy Expr input) — not touched.
- Event reaction's `Event` field — not touched.
- Migrating the Location field's single-identifier autocomplete to the new shared engine — different token model, left as-is.
- Monaco XML editor completion (`enhanced-scxml-completion.ts`) — already solved independently for the raw XML view.
- Fuzzy/substring ranking beyond simple case-insensitive `includes` matching — matches existing behavior across all current autocomplete surfaces.
