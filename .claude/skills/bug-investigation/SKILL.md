---
name: bug-investigation
description: Diagnose and fix a reported defect in the SCXML Editor, including runtime debugging when the cause isn't obvious. Use for "X is broken", "Y doesn't work", "I expected A but got B" type requests. Covers both investigation (root-causing) and debugging (tracing runtime behavior) as one skill, since this repo has no dedicated debug tooling beyond console logging and manual browser inspection.
---

# Bug Investigation & Debugging

Specializes `.claude/workflows/development.md` for defect reports. Investigation and debugging are one skill here — this repo has no distinct debugger/instrumentation layer (no Zustand devtools middleware wired up despite `DEVELOPER_GUIDE.md` mentioning it; that doc is stale), so "investigating a bug" and "debugging" are the same activity: read code, add temporary logging if needed, reproduce manually.

## When to use

Any report of incorrect behavior — a crash, wrong output, a UI element not responding, an undo that doesn't restore state correctly, a validation error that shouldn't fire (or doesn't fire when it should). Also use this for "why is X happening" questions where X is undesirable, even if the user hasn't confirmed it's a bug yet.

## Required investigation steps

1. **State expected vs. actual behavior precisely** before reading any code — this determines what "fixed" means and prevents fixing the wrong thing.
2. **Check `.claude/index.md`'s "Known issues" list first.** This repo has a substantial list of already-confirmed, already-diagnosed defects (broken `ChangeStateTypeCommand` undo, `viz:xywh` separator inconsistency, the double-`#` color bug, the `__tests__/` exclusion gap, the silent clean-export fallback, the State Actions panel's silent data loss for `<raise>`/`<log>`/`<script>`, and more). If the report matches one of these, you already have the root cause and the relevant file:line — skip straight to deciding a fix, don't re-diagnose from scratch.
3. If not a known issue, find the relevant `.claude/features/*.md` doc via `index.md`'s keyword table and read its **Known limitations** and **Important edge cases** sections — many "bugs" turn out to be documented, intentional behavior (e.g. "compound states don't show nested children" is a deliberate decision, not a rendering bug).
4. Trace the actual data flow for the failing behavior (per `development.md` step 8) — for this codebase, that usually means identifying which of the two mutation strategies produced the bad state, which of the 7 stores holds the relevant data, or which of the two independent pipelines (validation vs. diagram rendering) is misbehaving.
5. If the cause still isn't clear from static reading, and the bug can be reproduced through a pure-function unit test (a Command, validator, or utility), write that test rather than reaching for logging — it's faster to iterate on and becomes permanent regression coverage. If the bug only manifests through UI/canvas interaction, Claude does not start `npm run dev` itself (rule 17.5, `.claude/decisions/testing.md` #5) — add temporary `console.log`/`console.warn` statements at the suspected boundary if needed, then ask the developer to reproduce the interaction and report back what was logged/observed (including the browser console, since a "silent failure with no error UI" is consistent with an uncaught exception the app's `ErrorBoundary` can't catch — see point 6). Remove any temporary logging before finishing (see Common mistakes).
6. Check whether the bug is in event-handler code — this repo's single `ErrorBoundary` does **not** catch event-handler errors, only render-phase ones (`.claude/decisions/error-handling.md` #1), so a "silent failure with no error UI" symptom is consistent with an uncaught exception inside a Command execution or a click handler.

## Relevant knowledge files

- `.claude/index.md` — Known issues list (check this first, always).
- The specific `.claude/features/*.md` file for the affected area — Known limitations / Important edge cases sections especially.
- `.claude/decisions/*.md` — check whether the "buggy" behavior is actually a recorded, intentional decision before treating it as a defect.

## Relevant project rules

Whichever numbered section of `.claude/project/project-rules.md` covers the affected subsystem — rules marked `[EXPLICIT]` that the bug appears to violate are strong signal for where the fix belongs; rules marked `[INFERRED]` are more likely to be the actual bug (unintended behavior with no one having decided it should work that way).

## Relevant decision records

Any decision in `.claude/decisions/*.md` whose **Status** is `Inferred behavior` in the affected area is a candidate root cause list — these are documented as "current reality, not intended," which is exactly the shape of a real bug. Start there before assuming a fresh root cause.

## Implementation expectations

- Fix the smallest thing that addresses the stated expected-vs-actual gap — do not use a bug report as license for a broader refactor (that's a separate task; mention it instead of doing it).
- If the fix touches a shared utility (`transition-slot-rules.ts`, `initial-group-utils.ts`, `waypoint-invalidation.ts`, etc.), verify every call site, not just the one that surfaced the bug.
- If the root cause is a Command's undo logic, verify both `execute()` and `undo()` remain symmetric after the fix (see the `ChangeStateTypeCommand` case as the canonical example of what asymmetry looks like).

## Testing expectations

- Add a regression test reproducing the exact reported failure, as a sibling test file (not under `__tests__/`).
- If the bug was in a pure function (validator, command, utility), a unit test is sufficient and preferred.
- If the bug was in canvas/Monaco interaction, there is no automated coverage for this class of bug and Claude does not verify it in a browser itself (rule 17.5) — report the automated-check results and give the developer a specific repro-and-confirm checklist (open X, do Y, confirm Z no longer happens).

## Common mistakes to avoid

- Leaving temporary debug `console.log`/`debugger;` statements in the final diff — this repo already has several *unintentional* `debugger;` statements left in shipped code (`adaptive-spacing.ts`, `hub-centroid-nudge.ts`, `initial-group-utils.ts`); don't add more.
- Treating a documented, intentional limitation as a bug to silently "fix" (e.g. "compound states should show nested children" contradicts a deliberate decision — see `.claude/decisions/visual-diagram.md` #1).
- Fixing only the symptom's call site when the actual defect is in a shared utility used elsewhere too.
- Assuming `ErrorBoundary` would have caught a silent failure — it structurally cannot catch event-handler/async errors, so "no error UI appeared" is not evidence the bug is upstream of where you think it is.
