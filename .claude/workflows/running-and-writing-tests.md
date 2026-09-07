# Workflow: Running and Writing Tests

## Running

```bash
npm test        # vitest run — the entire suite, once
```

Runner: Vitest 3.2.4, `environment: jsdom`, `globals: true` (no need to import `describe`/`it`/`expect`). Config: `vitest.config.ts`, setup: `vitest.setup.ts` (just imports `@testing-library/jest-dom/vitest`).

## The one critical gotcha: `__tests__/` directories are silently excluded

`vitest.config.ts` has:
```ts
exclude: ['**/__tests__/**', '**/node_modules/**', 'server/**']
```

This means **any test file physically placed inside a directory literally named `__tests__` never runs**, with no warning. This has already happened to 5 real files:
- `src/lib/layout/__tests__/adaptive-spacing.test.ts`
- `src/lib/layout/__tests__/edge-obstacle-utils.test.ts`
- `src/lib/layout/__tests__/hub-centroid-nudge.test.ts`
- `src/lib/layout/__tests__/node-dimension-calculator.test.ts`
- `src/lib/utils/__tests__/config-overrides.test.ts`

These exist, look like normal passing tests, and simply never execute under `npm test`. **`npm test` passing is not proof these 5 modules' behavior is currently correct** — if you're touching `adaptive-spacing.ts`, `edge-obstacle-utils.ts`, `hub-centroid-nudge.ts`, `node-dimension-calculator.ts`, or `config-overrides.ts`, run their specific test file directly to actually get signal:
```bash
npx vitest run src/lib/layout/__tests__/adaptive-spacing.test.ts
```
Better yet, if you're already touching one of these files, consider moving its test out of `__tests__/` to sit as a sibling (matching every other test in the repo) so it starts running under plain `npm test` again — that's a strict improvement and likely what was originally intended before this drifted.

**When adding any new test file, do not put it under a `__tests__/` subdirectory.** Put it as a sibling of the module it tests (`foo.ts` + `foo.test.ts` in the same folder) — this is what the other 47 test files in the repo already do, and it's the only way to guarantee your new test actually runs in CI/`npm test`.

## What's actually tested (47 files, roughly)

- **Pure unit tests, no rendering**: the overwhelming majority — `src/lib/utils/*.test.ts`, `src/lib/validators/*.test.ts`, `src/lib/commands/*.test.ts`, `src/lib/layout/*.test.ts` (the ones that run), `src/lib/converters/*.test.ts`, `src/lib/github/*.test.ts`, `src/stores/*.test.ts`. Follow this pattern for any new pure function: call it directly with plain data, assert on the return value.
- **`@testing-library/react` component/hook tests** (7 files, genuinely interactive UI): `events-panel.test.tsx`, `github-panel.test.tsx`, `state-actions-panel.test.tsx`, `multi-select-toolbar.test.tsx`, `transition-panel.test.tsx`, `use-github-connect.test.ts`, `use-github-pull.test.ts`. Only add an RTL test for a component with real interactive branching logic — purely presentational components in this repo don't get one.
- **No e2e/browser automation exists anywhere in this repo** (no Playwright/Cypress). Claims about actual browser behavior (drag-and-drop gestures, ReactFlow canvas interaction, Monaco autocomplete popups) are **not verified by any automated test** — passing `npm test` does not confirm they work. **This project overrides the general "start the dev server and verify in a browser" guidance**: Claude does not start `npm run dev` or attempt browser verification itself in this repository (Claude has no browser-automation/screenshot tool here, so any such claim would be unverifiable) — see rule 17.5 (`.claude/project/project-rules.md`) and `.claude/decisions/testing.md` #5. Claude reports automated-check results and hands the developer a concrete manual verification checklist instead.

## Server relay tests

`server/test/*` covers the standalone GitHub OAuth relay (`server/index.js`) — these are **not** run by the root `npm test` (excluded via `'server/**'`) and have their own test setup inside `server/`. Run them from within that directory per `server/README.md` if you touch the relay.
