# Testing Decisions

---

## 1. Vitest + jsdom, unit-test-heavy, no end-to-end framework

### Context
The app needed some form of automated test coverage across a large amount of pure business logic (validators, commands, layout math) plus a smaller amount of genuinely interactive UI.

### Decision
Vitest 3.2.4 with `jsdom` is the sole test runner (`vitest.config.ts`). No Playwright/Cypress or any e2e framework is present anywhere in the repository.

### Reason
Not documented in a dedicated note, but the overwhelming majority of this app's logic is pure, framework-independent functions (validators, commands, layout algorithms, utils) that are naturally suited to fast unit testing — a heavier e2e setup would add cost without covering proportionally more of the codebase's actual complexity, which lives in business logic rather than browser-specific interaction sequences.

### Constraints
Real browser/interaction behavior (drag gestures, ReactFlow canvas interaction, Monaco autocomplete popups, zoom/pan) is **not verified by any automated test** — changes to these must be manually verified in a running browser (per this repo's own operating conventions).

### Alternatives
None found evidenced (no config remnants or discussion of Playwright/Cypress having been tried).

### Evidence
`vitest.config.ts`, `package.json` (`devDependencies`, no e2e framework present), 47 test files under `src/`, all Vitest-based.

### Status
Accepted.

---

## 2. Component tests (`@testing-library/react`) reserved for genuinely interactive components only

### Context
The app has many React components, but most are presentational.

### Decision
Only 7 test files use `@testing-library/react`: `events-panel`, `github-panel`, `state-actions-panel`, `multi-select-toolbar`, `transition-panel` (components), plus `use-github-connect`/`use-github-pull` (hooks) — all components with real branching interactive logic. Purely presentational components have no RTL tests.

### Reason
Not documented in a dedicated note, but the pattern is consistent enough across the whole test suite to represent a deliberate convention: test business logic directly where it's pure, and reserve the heavier RTL setup for components where behavior genuinely depends on simulated user interaction and cannot be tested as a plain function.

### Constraints
New purely-presentational components should not automatically get an RTL test "for completeness" — this would be inconsistent with the established pattern and add low-value test maintenance burden.

### Alternatives
None found evidenced (e.g., snapshot-testing every component was not adopted).

### Evidence
The 7 RTL test files listed above vs. the remaining ~40 pure-function test files; `.claude/project/coding-rules.md` §6 documents this convention explicitly as a followed rule.

### Status
Accepted.

---

## 3. A subset of test files sit under `__tests__/` directories and are silently excluded from `npm test`

### Context
`vitest.config.ts` excludes `**/__tests__/**` from the test run (alongside `node_modules` and `server/`).

### Decision (Inferred behavior, not a deliberate choice)
Five real, presumably-passing test files (`src/lib/layout/__tests__/{adaptive-spacing,edge-obstacle-utils,hub-centroid-nudge,node-dimension-calculator}.test.ts`, `src/lib/utils/__tests__/config-overrides.test.ts`) exist but never execute under `npm test`, with no warning. Sibling test files for closely related modules (e.g. `chain-wrapping.test.ts`, `elk-layout-service.test.ts`) sit directly alongside their source files (not under `__tests__/`) and do run.

### Reason
No comment or commit explains or acknowledges this exclusion pattern. The mixed placement (some layout tests under `__tests__/`, most siblings not) is itself evidence this is a **leftover from an incomplete reorganization** — most plausibly, test files were being migrated from a `__tests__/`-subdirectory convention to a sibling-file convention (matching the majority pattern across the other ~40 test files), and this migration was left unfinished, with the `exclude` pattern in `vitest.config.ts` then silently swallowing whatever was never moved.

### Constraints
`npm test` passing is **not** proof these 5 modules' tests currently pass — they must be run explicitly (`npx vitest run <path>`) to get real signal. New test files must be placed as siblings, not under `__tests__/`, to avoid the same fate.

### Alternatives
N/A — not a deliberate choice.

### Evidence
`vitest.config.ts` (`exclude: ['**/__tests__/**', ...]`), the specific 5 affected files vs. their non-excluded siblings.

### Status
Inferred behavior — an accidental configuration/reorganization artifact, not an intended testing decision. Should likely be fixed (move the 5 files to sibling locations) rather than preserved.

---

## 4. Testing checklist for UI/frontend changes is explicitly manual, not automated

### Context
`README.md` includes a "Testing Checklist" for contributors covering things like "Two-way sync (code ↔ visual) works," "Undo/redo works in both modes," "Visual metadata preserved on export."

### Decision
This checklist is a manual verification list, not a description of automated test coverage — none of these end-to-end behaviors have corresponding automated tests (consistent with decision #1, no e2e framework).

### Reason
Directly acknowledges the gap decision #1 creates: since integrated, cross-cutting user-facing flows aren't covered by the unit-test-heavy automated suite, the project compensates with an explicit manual checklist for contributors to run through before submitting changes.

### Constraints
Anyone making a change touching two-way sync, undo/redo, or export behavior should manually verify against this checklist, since `npm test` passing does not confirm these flows still work end-to-end.

### Alternatives
None found evidenced (e.g. no partial e2e coverage was added instead).

### Evidence
`README.md` §"Testing Checklist" (under "Contributing").

### Status
Accepted.

---

## 5. Claude runs automated checks only; the developer performs and confirms browser verification for UI changes

### Context
Decision #4 already establishes that UI/frontend behavior verification is manual, not automated, in this repository — but left open *who* performs that manual step when Claude is doing the implementation work. Claude Code, in this environment, has no browser-automation or screenshot tool — it cannot itself observe rendered output, only start a process and read its logs. A prior general instruction (outside this project) told Claude to "start the dev server and use the feature in a browser before reporting a UI task complete," which is not actually achievable here: starting `npm run dev` gives Claude a running server, not a way to see or interact with the page, so any resulting claim of "browser-verified" would be asserted, not actually confirmed.

### Decision
For any task that changes UI, visual behavior, interaction, layout, or a user-facing workflow:
1. Claude runs every applicable check that doesn't require a browser: `npx tsc --noEmit` (typecheck), `npm run lint`, `npm test` (unit tests), and `npm run build` where relevant.
2. Claude does **not** start the development server (`npm run dev`) solely to attempt browser verification.
3. Claude ends the task by handing the developer a concise, concrete manual verification checklist (specific pages, specific interactions, specific expected outcomes — not a generic "check that it works").
4. The developer starts the app, performs the checklist, and confirms the result.
5. Claude must not state or imply that a UI change has been "verified," "tested in the browser," or "confirmed working" unless the developer has explicitly said so in the conversation. Passing typecheck/lint/unit tests is reported as exactly that — not as UI verification.

### Reason
Two compounding facts make this the correct division of labor rather than a workaround: (a) Claude has no tool in this environment that can actually observe a rendered browser page, so any "I verified it in the browser" claim would be unfalsifiable and potentially false; (b) this repository already has no automated UI/e2e coverage (decision #1) by deliberate design, meaning a human has always been the actual verification mechanism for this class of change — this decision just makes explicit, for Claude specifically, a responsibility that was already implicitly the developer's.

### Constraints
- Every UI-affecting task's final message must include a manual verification checklist, phrased as concrete steps and expected outcomes (see the worked example in this decision's source instruction), not a vague "please check the UI."
- A task is not "complete" from Claude's own reporting until automated checks have run — but completion of the *user-facing behavior* itself is explicitly gated on the developer's confirmation, not on Claude's say-so.
- This does not relax decision #4's checklist-based manual-testing culture — it specifically assigns the browser-facing half of that culture to the developer when Claude is the one implementing the change.

### Alternatives
The rejected alternative is directly named in the source instruction: Claude starting `npm run dev` itself and asserting the feature "works" based on server logs or its own unverified belief, without the developer ever confirming rendered/interactive behavior.

### Evidence
Direct project instruction (this conversation) establishing the rule and its worked example (editing a transition expression, deleting a character, confirming only that character is removed and the transition isn't cancelled).

### Status
Accepted.
