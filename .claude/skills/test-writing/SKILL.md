---
name: test-writing
description: Add, modify, or run tests in the SCXML Editor. Use whenever a task includes "add a test", "why isn't this tested", or when any other skill's testing-expectations step needs to actually be carried out. Encodes this repo's specific test-runner gotcha (the __tests__/ exclusion bug), its unit-test-first philosophy, and when (rarely) to reach for @testing-library/react.
---

# Test Writing

Specializes `.claude/workflows/development.md` step 10 (identify existing tests) and step 13 (run tests) into their own skill, since this repo has a specific, easy-to-miss configuration trap that silently defeats new tests if you don't know about it.

## When to use

Any request to add test coverage; any task where `development.md` step 10/13 applies (i.e., almost every code change); investigating why a test that "should" be passing/failing isn't behaving as expected; auditing test coverage for an area before changing it.

## Required investigation steps

1. **Before writing anything, know this rule: never place a new test file under a directory literally named `__tests__/`.** `vitest.config.ts` excludes `**/__tests__/**`, and 5 real, existing test files are already silently never run because of this (`src/lib/layout/__tests__/*`, `src/lib/utils/__tests__/config-overrides.test.ts`). Place new tests as a sibling of the module they test (`foo.ts` + `foo.test.ts` in the same directory) — matching the other 40+ test files in the repo.
2. Check whether a test file already exists for the module you're changing — read it before modifying behavior; it encodes the currently-expected contract.
3. Decide unit test vs. `@testing-library/react` test using this repo's actual, consistent convention: pure logic (validators, commands, layout math, utils, converters) → plain Vitest, no rendering. Only genuinely interactive components get RTL tests — currently exactly 7 files do (`events-panel`, `github-panel`, `state-actions-panel`, `multi-select-toolbar`, `transition-panel`, plus the `use-github-connect`/`use-github-pull` hooks). Do not add an RTL test to a purely presentational component "for completeness."
4. If you're touching one of the 5 currently-excluded test files (or `config-overrides.ts`, `adaptive-spacing.ts`, `edge-obstacle-utils.ts`, `hub-centroid-nudge.ts`, `node-dimension-calculator.ts`), run it explicitly (`npx vitest run <path>`) — `npm test` will not exercise it, and its current pass/fail status is unknown until you do.
5. Remember this repo has **no e2e/browser-automation framework** — anything requiring real browser/canvas/interaction verification cannot be covered by an automated test here; say so explicitly rather than writing a test that can't actually verify the behavior, and fall back to documenting the manual verification you performed instead.

## Relevant knowledge files

`.claude/workflows/running-and-writing-tests.md` (the detailed how-to), `.claude/decisions/testing.md`.

## Relevant project rules

`.claude/project/project-rules.md` §17 (Testing) in full.

## Relevant decision records

`.claude/decisions/testing.md` #1 (Vitest/no-e2e), #2 (RTL scope), #3 (the `__tests__/` exclusion — labeled `Inferred behavior`, i.e. an accident worth fixing if you're already touching one of the affected files, not a convention to imitate), #4 (the manual testing checklist in `README.md`).

## Implementation expectations

- Sibling file placement, always.
- Use `globals: true` conventions already configured (`describe`/`it`/`expect` available without import, per `vitest.config.ts`).
- For a pure function, test inputs/outputs directly — don't render a component just to exercise logic that's actually implemented in a plain utility it calls.
- For an RTL test, follow the existing pattern in one of the 7 current examples (store reset in `afterEach`, `render`/`screen`/`fireEvent`).

## Testing expectations

(This skill *is* the testing-expectations layer for every other skill — its own "testing expectations" is: leave the test suite in a state where `npm test` accurately reflects what's covered, with no new file silently excluded.)

## Common mistakes to avoid

- Creating `src/lib/whatever/__tests__/new-test.test.ts` — it will never run under `npm test` and no error will indicate why.
- Assuming `npm test` passing proves the 5 already-excluded files' logic is correct — it doesn't; they're skipped, not verified.
- Writing an RTL test for a component with no real interactive branching logic, inconsistent with the established convention.
- Claiming a UI/canvas/Monaco behavior is "tested" because a superficial render test passes — if the actual interaction wasn't manually exercised in a browser, say that explicitly.
- If you notice the `__tests__/` exclusion bug while working nearby, consider fixing it (move the file to a sibling location) rather than only working around it for your own change — but only within the scope of the current task; don't go on an unrelated cleanup spree.
