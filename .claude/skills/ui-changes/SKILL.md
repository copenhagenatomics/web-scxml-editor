---
name: ui-changes
description: Change anything the user directly sees or interacts with — the ReactFlow canvas, Monaco editor, side panels, toolbar, theme, keyboard shortcuts, colors, animations. Use for visual/interaction requests. Encodes this repo's specific, feedback-driven UI conventions (several traced to real user complaints in git history). Claude runs non-browser automated checks only and hands the developer a manual verification checklist — Claude does not start the dev server or claim browser verification itself.
---

# UI / Interaction Changes

Specializes `.claude/workflows/development.md` for anything visual or interaction-facing. This repo has an unusually well-documented UI decision history — many current visual choices (amber not red, no transition animation, notes behind other elements, stronger trackpad zoom) are traced to specific, verbatim user-feedback commit messages, not arbitrary style choices. Treat these as constraints, not defaults to casually override.

## When to use

Any request touching what's rendered or how the user interacts with it: diagram node/edge appearance, panel layout, toolbar buttons, keyboard shortcuts, drag/select/zoom/pan behavior, theme, Monaco editor appearance/behavior, empty-state copy, toast messages.

## Required investigation steps

1. Read `.claude/project/ui-rules.md` in full — it's short and covers the cross-cutting conventions (single-panel model, keyboard shortcuts, state-type visuals, no context menu) that apply regardless of which specific feature you're changing.
2. Find the specific feature doc via `.claude/index.md`'s keyword table and read its **UI behavior** section.
3. Check `.claude/decisions/visual-diagram.md` and `.claude/decisions/ui-ux.md` for whether the current behavior is traced to a specific past decision or user-feedback commit — if so, understand *why* before changing it, and treat changing it as reversing a decision (update its `Status` — see `knowledge-maintenance`), not as a routine tweak.
4. For anything canvas/ReactFlow-related, check whether the interaction you're touching is one of the two documented browser-specific workarounds (Windows pinch-zoom, post-`ControlButton`-click scroll drift) — these look like they could be deleted as dead code but aren't.
5. Confirm there's no existing mechanism you're about to duplicate — this app deliberately has **no context menu anywhere** (verified absence, `.claude/features/context-menus.md`); don't add a one-off right-click menu for a single feature without recognizing that as a new, precedent-setting pattern.

## Relevant knowledge files

`.claude/project/ui-rules.md`, `.claude/features/diagram-interaction.md`, `selection.md`, `zoom-pan-controls.md`, `state-node-types.md`, `transitions-editing.md`, `labels.md`, `theme-and-appearance.md`, `monaco-code-editor.md`, `context-menus.md`, `sticky-notes.md` — whichever apply to the specific surface you're touching.

## Relevant project rules

`.claude/project/project-rules.md` §9 (Visual diagram behavior), §13 (User interaction), §21 (UI/UX conventions) are the primary sections. §2 (React architecture) if the change involves a new component.

## Relevant decision records

`.claude/decisions/visual-diagram.md` (especially #7, #9, #10, #11, #12 — the feedback-driven ones) and `.claude/decisions/ui-ux.md` in full.

## Implementation expectations

- Selection/click handling must go through the existing `handleStateClick` disambiguation logic, not native ReactFlow click semantics (§project-rules 9.5, 13.1).
- New side panels must fit the single-active-panel model and use shared primitives — see the `feature-development` skill's guidance and `.claude/workflows/adding-a-side-panel.md`.
- Any change to theme logic must keep the pre-hydration blocking script in `src/app/layout.tsx` and `src/lib/theme/theme.ts` manually in sync (no shared contract between them).
- Do not add animation to transitions, or change the conditional-transition color back toward red, without confirming the underlying user preference has changed — both were deliberate removals/changes in response to specific feedback.

## Testing expectations

Per `.claude/project/project-rules.md` rule 17.5 and `.claude/decisions/testing.md` #5 — this is a hard split of responsibility, not a suggestion:

- **Claude runs**: `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` where relevant. If the change touches a component with existing RTL coverage (`events-panel`, `github-panel`, `state-actions-panel`, `multi-select-toolbar`, `transition-panel`), update or extend that test.
- **Claude does NOT run `npm run dev`** to attempt browser verification, and does not claim the UI change is "verified," "tested," or "working" based on its own inspection — Claude has no tool in this environment that can observe rendered/interactive browser behavior, so any such claim would be unverifiable.
- **Claude ends the task with a concrete manual verification checklist** for the developer: name the specific page/panel, the specific interaction sequence, and the specific expected outcome — not a generic "please check the UI." See the worked example in `decisions/testing.md` #5.
- **The developer** starts the app, runs the checklist, and confirms the result. Only then is the UI behavior itself considered verified — not when Claude finishes implementing.

## Common mistakes to avoid

- Treating a documented, feedback-driven visual choice as an arbitrary default that's safe to "improve" (see `.claude/decisions/visual-diagram.md` #9–12 for concrete examples of exactly this kind of prior back-and-forth).
- Removing the Windows pinch-zoom or scroll-drift workarounds as apparent dead code.
- Adding a right-click context menu for one feature in isolation, when none exists anywhere else in the app.
- Forgetting that the Monaco editor is hardcoded to `vs-dark` regardless of the app's light/dark theme — a known, confirmed inconsistency, not something to assume is "supposed to" follow the theme toggle without deliberately fixing it as its own task.
- Starting `npm run dev` "just to check" — that responsibility belongs to the developer for this project; report automated-check results and a verification checklist instead.
- Saying or implying a UI change "works" or "is verified" before the developer has actually confirmed it.
