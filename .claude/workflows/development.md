# Standard Development Workflow

This is the default process for **any** task in this repository — bug fix, new feature, UI change, refactor, performance work, SCXML/state-machine change, validation change, test change, configuration change, integration change, or documentation change. It is feature-neutral: it tells you *how to approach* a task, not what any specific feature does (that's `.claude/features/*.md`) or what rule governs it (that's `.claude/project/project-rules.md`).

Follow the 19 steps below in order. Steps can be quick for a small task (a one-line bug fix might spend one sentence on step 8) but should never be skipped outright — a step that seems irrelevant should be explicitly dismissed ("no test exists for this," "no decision doc covers this area"), not silently omitted, so nothing gets missed by assumption.

---

## 0. Non-negotiable rules (apply to every step below)

- **Never assume how the system works without inspecting the repository.** This codebase has multiple confirmed cases where a plausible-sounding assumption is wrong (e.g. "the history manager uses two stacks" — it doesn't; see `.claude/decisions/state-management.md` #2). Read the actual code before acting on a belief about it.
- **Never rely only on static documentation when current source code is available.** `DEVELOPER_GUIDE.md` and `.claude/context/CLAUDE.md` are *known stale* — they describe a design that no longer matches the code (§`.claude/project/overview.md`). The `.claude/` knowledge base itself is a distillation, not a replacement for reading source when precision matters — treat every doc's file:line pointers as a starting point to verify, not a final answer, especially for anything load-bearing to your change.
- **If documentation conflicts with source code, investigate and identify the discrepancy** — don't silently pick one side. Say explicitly which one is right and, if the doc is wrong, note it (and consider fixing the doc per step 18).
- **Never make unrelated changes.** Fix the bug / add the feature / do the refactor asked for — do not also rename a variable you find ugly, reformat unrelated code, or fix an unrelated bug you notice in passing (mention it instead; see step 19).
- **Preserve existing behavior unless the user's request explicitly changes it.** This applies especially to the many documented invariants in `.claude/project/project-rules.md` — an `[EXPLICIT]` rule should not be broken as a side effect of an unrelated change.
- **Before modifying behavior, identify dependencies and possible regressions** (steps 8–9 exist specifically for this — don't jump straight to editing).

---

## The 19 steps

### 1. Understand the user's request

Restate the task to yourself in concrete terms: what should be true after this change that isn't true now (or vice versa, for a removal)? For a bug report, identify the *expected* vs. *actual* behavior explicitly — don't start fixing until you know what "fixed" looks like. If the request is ambiguous about scope (e.g., "fix the transition colors" — one color? all colors? a specific state?), resolve the ambiguity by reading nearby code/docs first; only ask the user if inspection genuinely can't resolve it.

### 2. Determine what part(s) of the project may be affected

Think in terms of this repo's actual subsystems, not generic layers: does this touch the Command layer, a validator, the ELK layout pipeline, a specific side panel, the Monaco integration, the GitHub/host-API integration, a Zustand store, or purely a test/doc file? A single request can span several — e.g. "renaming should also update X" touches `RenameStateCommand` *and* whatever X is. List every subsystem you think is involved before moving to step 3, and revisit this list after step 8 once you've actually traced the code (it's normal to discover the list was incomplete).

### 3. Identify relevant project knowledge

Use `.claude/index.md`'s registry tables to route yourself:
- The **keyword/symptom table** under "How to find the right feature doc" maps plain-language descriptions to feature docs.
- The **searchable decision index** maps "why does X happen" questions to specific `decisions/*.md` entries.
- The **Known issues** list at the bottom of `index.md` — check it before you start; you may be about to touch a file with an already-confirmed defect nearby, which changes how carefully you need to tread.

Don't read everything — `.claude/index.md` exists precisely so you load only what's relevant.

### 4. Read the relevant architecture documentation

Start with `.claude/project/architecture.md` for the subsystem(s) identified in step 2, and `.claude/project/project-rules.md` for the specific numbered rules governing that area (it's organized by the same categories: React architecture, state management, SCXML semantics, visual diagram, validation, etc.). If your task touches SCXML representation specifically, also read `.claude/project/scxml-rules.md`; if it touches interaction/visual conventions, read `.claude/project/ui-rules.md`; if you're unsure of a domain term, check `.claude/project/terminology.md`.

### 5. Read relevant feature documentation if applicable

Open the specific `.claude/features/*.md` file(s) identified in step 3. Each one has the same section set — pay particular attention to **Known limitations**, **Important edge cases**, and **Things that must NOT be changed** before you touch that feature's code; these sections exist specifically to front-load exactly what you're about to discover the hard way otherwise.

### 6. Read relevant decisions if applicable

Check `.claude/decisions/*.md` for the topical file matching your change (architecture, state-management, scxml, visual-diagram, editing, validation, error-handling, testing, backward-compatibility, configuration, naming-conventions, ui-ux, integrations, performance). A decision record's **Status** matters: `Accepted` means don't casually reverse it; `Superseded` means something failed before in exactly the way you might be about to retry (read what replaced it and why); `Inferred behavior` means it's current reality but not a stated commitment — more room to change it deliberately, but say so explicitly if you do.

### 7. Inspect the current source code

This is the step that actually confirms or corrects everything read in steps 4–6. Read the real files — don't paraphrase from memory of the docs. Specifically check:
- Does the code still match what the doc says? (Docs here were verified at time of writing, but the repo moves.)
- Are there comments explaining *why*, not just *what* — this repo has many (e.g. `visual-diagram.tsx`'s marquee-select rationale, `waypoint-invalidation.ts`'s doc comment) that are load-bearing context.
- Is there a `debugger;` statement, a `console.warn`/`TODO`, or a stale comment nearby that changes your understanding (several confirmed instances exist — see the Known Issues list).

### 8. Trace dependencies and data flow

For this codebase specifically:
- If touching a **Command**, check `.claude/project/coding-rules.md` §1–2 and confirm whether `clearWaypointsForTouchingTransitions` applies (does your change affect a state's rendered size?).
- If touching **validation**, remember the 16 passes run in a fixed, dependency-sensitive order (`.claude/decisions/validation.md` #1) — know what your pass depends on and what depends on it.
- If touching the **diagram/converter**, remember validation and rendering are fully independent pipelines (`.claude/decisions/architecture.md` #3) — a change to one won't automatically affect the other, which can be either the fix or the bug depending on what's being asked.
- If touching **state** (Zustand), identify which of the 7 stores owns the data and whether other stores/hooks read it (`.claude/decisions/state-management.md` #1).
- If touching **`viz:` metadata**, remember two independent read/write layers exist (Commands' direct DOM access vs. `VisualMetadataManager`) — changes to one don't automatically apply to the other (`.claude/features/visual-metadata-namespace.md`).
- Grep for all call sites of anything you're changing — this repo has several genuinely shared utilities (`transition-slot-rules.ts`, `initial-group-utils.ts`, `waypoint-invalidation.ts`) that are deliberately consumed from more than one place; changing one call site without the others reintroduces exactly the kind of drift those shared utilities exist to prevent.

### 9. Identify potential side effects

Cross-check your planned change against:
- `.claude/project/project-rules.md`'s numbered rules for the relevant category — does your change risk violating an `[EXPLICIT]` rule?
- The **Related features** section of every feature doc touched in step 5 — a change rarely affects exactly one feature in this codebase (e.g. anything touching state rename cascades into transitions, initial attributes, and timer tokens simultaneously).
- The **Known issues** list in `index.md` — are you about to touch code adjacent to a confirmed defect? If so, decide explicitly whether to fix it as part of this task (only if in scope) or leave it and note it in your summary (step 19).

### 10. Identify existing tests

Find the test file(s) for whatever you're changing — this repo's convention is a sibling `*.test.ts`/`*.test.tsx` next to the source file (not under `__tests__/` — see step 13's gotcha). Read them before changing behavior: they encode the currently-expected contract, including edge cases you might not think to check otherwise. If no test exists for the area you're changing, say so explicitly rather than assuming coverage exists.

### 11. Create an implementation plan

For anything beyond a trivial change, write down (even briefly, in your own response) what you're about to do and why, before doing it — which files change, which pattern you're following (Command vs. direct object-tree edit; new validator pass vs. extending an existing one; new Zustand field vs. new store), and what you expect to *not* change. This is where you commit to the smallest change that satisfies the request (step 12) rather than a broader rewrite. For a non-trivial or ambiguous task, this is also the point to use a Plan-mode style checkpoint with the user if genuinely warranted — most tasks in this repo don't need one; use judgment.

### 12. Implement the smallest appropriate change

Follow this repo's established patterns exactly (see `.claude/workflows/adding-a-command.md`, `adding-a-validation-rule.md`, `adding-a-side-panel.md` for the three most common extension points). Concretely:
- New undoable SCXML mutation → a `Command` class, not inline manipulation.
- New validation rule → the right validator file, in the right pass position, using shared rule-utilities where one already exists for the concept.
- New UI surface → the existing primitives (`Panel`, `FormActions`, etc.), the single-active-panel model, and the established empty-state/toast conventions.
- Naming → follow `.claude/project/project-rules.md` §22 (state label = id, `note:` prefix reasoning, `conf_`/`this_`/`main_` conventions) rather than inventing new conventions.
Do not refactor adjacent code "while you're in there" unless the refactor is the task.

### 13. Run relevant tests

`npm test` (Vitest). **Know the gotcha**: `vitest.config.ts` excludes `**/__tests__/**` — if your change touches `adaptive-spacing.ts`, `edge-obstacle-utils.ts`, `hub-centroid-nudge.ts`, `node-dimension-calculator.ts`, or `config-overrides.ts`, their tests do **not** run under plain `npm test`; run them explicitly (`npx vitest run <path>`) to get real signal, per `.claude/workflows/running-and-writing-tests.md`. If you added a new test, confirm it's a sibling file, not under `__tests__/`, or it will silently never run.

### 14. Run type checking/linting when applicable

`npm run lint` (ESLint). TypeScript is checked as part of `npm run build` (`tsc` via Next.js) — for a quick type-only check without a full build, use your editor/IDE's TS server or `tsc --noEmit` if invoking the compiler directly is faster than a full `next build` for the scope of your change.

### 15. Review the resulting diff

Read your own diff before calling the task done. Specifically check:
- Does it touch only what step 11's plan said it would?
- Did an editor/formatter reformat unrelated lines? Revert those.
- For a Command: does `execute()`/`undo()` stay symmetric? Does it follow one of the two established undo strategies (inverse-re-execute or snapshot-restore — see `.claude/project/coding-rules.md` §2), not a half-and-half mix (the documented cause of the `ChangeStateTypeCommand` undo defect)?
- For a validator: did you add the rule to the right pass position, and does it use the existing position-lookup helpers rather than new ad hoc line-counting?

### 16. Check for regressions

- Re-run the tests from step 13.
- For anything UI/interaction-related: this repo has **no e2e coverage**, so browser exercise is the only real verification for canvas drag/select/zoom, Monaco autocomplete, and similar behavior (`.claude/decisions/testing.md` #1) — but **Claude does not perform this step itself**. Per rule 17.5 (`.claude/decisions/testing.md` #5), Claude has no tool in this environment that can observe a rendered browser page, so Claude must not start `npm run dev` for this purpose or claim the behavior is verified. Instead, prepare a concrete manual verification checklist for the developer (see step 19) — regression-checking a UI change means re-reading the **Important edge cases** below for what the checklist needs to cover, not exercising it yourself.
- Specifically re-check the **Important edge cases** section of every feature doc touched in step 5 — these are exactly the cases most likely to silently break, and exactly what the handoff checklist in step 19 should ask the developer to confirm.
- If you touched a shared utility (step 8), verify *every* call site still behaves correctly, not just the one you were focused on.

### 17. Check whether project documentation or decisions need updating

Run the **10 trigger questions** in `.claude/workflows/knowledge-maintenance.md` against your change (externally visible behavior, architecture, data flow, invariants, project rules, new/invalidated decisions, newly-important undocumented behavior, tests establishing new expected behavior, integration/dependency changes). That document is the authoritative, detailed version of this step — it also defines the **materiality test** that keeps this from becoming "update docs for every diff": update knowledge only when a future reader would be actively misled or would miss something needed if the docs were left as-is, not simply because code changed.

### 18. Update knowledge when the implementation has meaningfully changed

This is the follow-through on step 17 — actually make the edits, not just note that they're needed. Follow `.claude/workflows/knowledge-maintenance.md`'s category-by-category guidance (which knowledge file, which section, how much to write) and its decision-record template if trigger question 6 or 7 fired. Match existing templates/structure exactly, fix any cross-references you touch, and update `.claude/index.md`'s registries if you added or reclassified anything. For anything you deliberately decided *not* to update, say so in your summary (step 19) rather than leaving it ambiguous whether you considered it.

### 19. Provide a concise summary of the work

State what changed and why, in the terms established by this codebase's own vocabulary (cite the Command/validator/feature/decision by name, not a generic description). Call out:
- Anything from step 9 you deliberately chose *not* to fix (so it's not mistaken for an oversight).
- Any documentation you updated (step 18) or determined didn't need updating.
- Any test gaps you found but didn't fill, if out of scope for the request.
- **If the task changed UI, visual behavior, interaction, layout, or a user-facing workflow**: report the automated checks that passed (typecheck/lint/tests/build) exactly as that — automated results, not UI verification — then give a concrete manual verification checklist (specific page, specific interaction, specific expected outcome; see `.claude/decisions/testing.md` #5 for the worked example). Do not state or imply the UI behavior itself is "verified"/"working" — that determination belongs to the developer, per rule 17.5.
Keep it short — this repo's own conventions (per `.claude/project/coding-rules.md` and general operating norms) favor a tight summary over a restated changelog.

---

## Adapting the workflow by task type

The 19 steps above are the same for every task type — what differs is *emphasis*. Use this table to know which steps deserve the most attention for a given kind of request.

| Task type | Emphasize | Specific things to check |
|---|---|---|
| **Bug fix** | 1, 7, 8, 10, 16 | Reproduce the *expected vs. actual* precisely (step 1) before touching code. Check `index.md`'s Known Issues list first — you may be looking at an already-diagnosed defect with a documented root cause. Trace the exact data flow (step 8) rather than guessing at the fix location. |
| **New feature** | 2, 3, 6, 11, 12, 18 | Check `decisions/*.md` for whether a similar feature was tried and reverted/superseded (e.g. edge bundling, inferred event/condition mode) before re-implementing something similar. Follow `.claude/workflows/adding-a-command.md`/`adding-a-side-panel.md` for the standard extension points. Always add a new `.claude/features/*.md` doc for a genuinely new feature, and add it to `index.md`'s registry. |
| **UI change** | 5, 9, 13, 16, 19 | Check `.claude/project/ui-rules.md` and the relevant feature's **UI behavior** section first — this repo has many specific, tested-by-feedback conventions (single-panel-at-a-time, no context menus, specific keyboard shortcuts, amber not red, no transition animation). Run typecheck/lint/unit tests/build (step 13/14) — Claude does **not** start `npm run dev` or otherwise attempt browser verification itself (rule 17.5, `.claude/decisions/testing.md` #5); end the task with a concrete manual verification checklist for the developer instead (step 19), and never claim the UI behavior is verified until the developer confirms it. |
| **Refactoring** | 0, 7, 9, 15, 16 | The "preserve existing behavior" rule is paramount here — a refactor that changes behavior is actually a feature/bug-fix task wearing a refactor's clothes; call that out explicitly if it happens. Re-run all affected tests, not just the ones near the refactored file, since this repo has several places where logic is deliberately shared across features (step 8/9). |
| **Performance improvement** | 8, 9, 16, 18 | Read `.claude/decisions/performance.md` first — several current "slow" behaviors (full re-parse per change, no incremental diagram updates) are known, documented tradeoffs, not oversights; understand why before "fixing" them. If you introduce debouncing/memoization, follow the existing patterns (`.claude/project/coding-rules.md` §5, `history-manager.ts`'s per-category debounce timers) rather than a new mechanism. |
| **SCXML change** (new element/attribute support, spec compliance) | 4, 6, 7, 8 | Read `.claude/project/scxml-rules.md` and `.claude/decisions/scxml.md` fully — this app layers significant product-specific rules (cross-hierarchy restriction, transition slots, Initial-State groups, `conf_`/`this_`/`main_` conventions) on top of plain SCXML; know which constraint is a W3C rule vs. a product rule vs. a downstream-generator constraint before changing it. |
| **State-machine change** (initial/compound/parallel/transition semantics) | 6, 8, 9 | These are the most cross-cutting concepts in the app — a change here likely touches validators, the converter, Commands, and live UI-blocking simultaneously (see `.claude/decisions/scxml.md` #2, #3, #5). Trace every consumer of the relevant shared utility before changing its behavior. |
| **Validation change** | 4, 6, 8, 10 | Read `.claude/workflows/adding-a-validation-rule.md` and `.claude/decisions/validation.md` #1 (pass ordering) before adding or editing a rule. Check whether the rule needs a live-blocking counterpart (transition slots, Initial groups pattern) — if so, the logic belongs in a shared utility, not duplicated in the validator alone. Verify against a **real loaded file**, not just a hand-constructed test object — this repo has a confirmed case (`.executable[]` shape) where validator logic works on in-memory-constructed data but is dead against real parsed files. |
| **Test change** | 10, 13, 17 | Never place a new test under a `__tests__/` directory (`vitest.config.ts` excludes it — a confirmed, currently-live bug affecting 5 existing files). If you're fixing the exclusion bug itself, move the affected files to sibling locations rather than changing the config to include `__tests__/` (matches the majority convention already used by the other 40+ test files). |
| **Configuration change** | 4, 6 (configuration.md), 9 | Remember this is a static export — new configuration is almost always a build-time `NEXT_PUBLIC_*` env var, not a runtime-read value (`.claude/decisions/architecture.md` #1, `configuration.md` #4). If it's `conf_`-value-related, check the local-edits-win merge precedence (`configuration.md` #2) and the usage-checked-deletion safety rule (`configuration.md` #3) aren't broken. |
| **Integration change** (GitHub, Host API/LoopControl) | 6 (integrations.md), 8, 9 | For GitHub: never call device-flow endpoints directly from the browser (no CORS) — always through the relay. For Host API: any new method a host might call before `onReady` needs a corresponding stub in `src/app/layout.tsx`'s inline pre-init script, or it throws instead of queuing (a confirmed current gap for several existing methods). Decide data ownership deliberately (SCXML-persisted vs. host-store-only — `.claude/decisions/integrations.md` #4) for anything new. |
| **Documentation change** | 3, 6, 7 | Verify against source before writing anything — this knowledge base's entire premise is that stale docs (`DEVELOPER_GUIDE.md`, `.claude/context/CLAUDE.md`) actively mislead. If updating a `.claude/decisions/*.md` entry, preserve its `Status` field's meaning (don't delete a `Superseded` record — it's there so the next person doesn't retry the same abandoned approach). If adding a new feature doc, follow the existing template exactly and add it to `index.md`'s registry tables (alphabetical, thematic, and keyword-lookup). |

---

## Quick-reference checklist

Copy this into your working notes for a non-trivial task:

- [ ] 1. Restated the request in concrete, testable terms
- [ ] 2. Listed affected subsystems
- [ ] 3. Checked `index.md`'s registries for relevant docs
- [ ] 4. Read `project/architecture.md` + `project/project-rules.md` for the area
- [ ] 5. Read the specific `features/*.md` file(s)
- [ ] 6. Read the specific `decisions/*.md` entries
- [ ] 7. Read the actual current source (not just the docs)
- [ ] 8. Traced dependencies / data flow / shared-utility call sites
- [ ] 9. Listed potential side effects and checked against project-rules.md
- [ ] 10. Found and read existing tests
- [ ] 11. Wrote down the implementation plan
- [ ] 12. Implemented the smallest change, following established patterns
- [ ] 13. Ran tests (checked the `__tests__/` exclusion gotcha)
- [ ] 14. Ran lint / type check
- [ ] 15. Reviewed the diff for scope creep
- [ ] 16. Checked for regressions (for UI changes: prepared what the developer needs to check — did not run `npm run dev` myself)
- [ ] 17. Decided whether docs/decisions need updating
- [ ] 18. Made those doc/decision updates
- [ ] 19. Wrote a concise, specific summary (for UI changes: automated-check results reported as such, plus a manual verification checklist — no claim of "verified"/"working" without developer confirmation)
