# Onboarding — Start Here

This is the one file a brand-new developer (human or Claude) should read first. It exists to reduce onboarding time and human knowledge-transfer — that is this project's stated reason for having a `.claude/` knowledge base at all. Keep this file short: it gives the first-day mental model and links out to the detailed knowledge rather than restating it. If you're tempted to add more than a sentence or two about one specific feature here, that content belongs in `.claude/features/*.md` instead — link to it, don't inline it.

## What this is, in three sentences

A browser-based visual editor for **SCXML** (the W3C statechart standard), built for Copenhagen Atomics' **LoopControl** industrial control platform. It keeps a Monaco XML code editor and a ReactFlow visual diagram in two-way sync for the same document, with validation, ELK auto-layout, undo/redo, and GitHub push/pull. It's a static-exported Next.js app (no server at runtime) that can run standalone or embedded as an iframe inside LoopControl.

For the full picture: [`.claude/project/overview.md`](../project/overview.md) → [`.claude/project/architecture.md`](../project/architecture.md) → [`.claude/project/terminology.md`](../project/terminology.md).

## The one rule that matters most

**`.claude/` is the single source of truth for AI/developer knowledge about this project — read it before assuming, and trust current source code over any doc when the two disagree.** Two pre-existing documents look like documentation but are **confirmed stale and actively misleading**: `DEVELOPER_GUIDE.md` and `.claude/context/CLAUDE.md` (both describe designs — a two-stack history manager, an XState dependency, no test framework — that don't match the real code). Don't build a mental model from them. Start from [`.claude/index.md`](../index.md) instead — it's the map into everything else (architecture, features, decisions, rules, workflows, skills).

## Local setup

- `npm install`
- `npm run dev` — local dev server (Turbopack). Don't run this to "verify a UI change works" on Claude's behalf — see the UI-verification note below.
- `npm test` — Vitest. **Gotcha**: `vitest.config.ts` excludes `**/__tests__/**`, so a handful of real test files never run under plain `npm test` — see [`.claude/workflows/running-and-writing-tests.md`](../workflows/running-and-writing-tests.md) before assuming something is covered.
- `npm run lint` — ESLint. TypeScript is checked as part of `npm run build` (or run `tsc --noEmit` directly for a quicker type-only check).
- GitHub integration needs a local OAuth relay to test against — see [`.claude/workflows/local-github-integration-setup.md`](../workflows/local-github-integration-setup.md).

## How development actually works here

Every task — bug fix, feature, refactor, UI tweak, SCXML change — follows [`.claude/workflows/development.md`](../workflows/development.md): understand → find relevant knowledge → inspect real source → plan → implement → test → review the diff → **update the knowledge base if the change materially affects future understanding** → summarize. That last part isn't optional busywork tacked onto the end — it's how `.claude/` stays trustworthy instead of decaying the way `DEVELOPER_GUIDE.md` did. The mechanics of *when* and *how* to update knowledge live in [`.claude/workflows/knowledge-maintenance.md`](../workflows/knowledge-maintenance.md).

You (or Claude) don't need to manually pick which knowledge file applies — [`.claude/skills/`](../skills/) match automatically to the shape of the task (a bug report routes to `bug-investigation`, a visual change to `ui-changes`, and so on), and each skill points at the exact feature docs, rules, and decisions relevant to it. See `.claude/index.md`'s "How Claude finds the right context without being told" section for the full routing explanation.

## Things that will trip you up early

- **UI/browser behavior is never verified by Claude itself** — there's no browser-automation tool in this environment. Claude runs typecheck/lint/tests/build and hands you a manual verification checklist; you confirm it in an actual browser. See `.claude/project/project-rules.md` rule 17.5.
- **SCXML mutation goes through exactly one of two mechanisms** (the Command pattern, or a narrow direct object-tree edit path) — never a third approach. See `.claude/project/project-rules.md` §1.2.
- **This app has real, confirmed defects that are already documented, not undiscovered** — check `.claude/index.md`'s "Known issues" list before assuming something you notice is new.
- **`docs/superpowers/plans/*.md` and `specs/*.md`** are the closest thing to a changelog and explain *why* a feature works the way it does — worth checking before assuming a quirky behavior is accidental.

## Where to go next

- Full architecture and rules: [`.claude/project/`](../project/)
- What a specific feature does: [`.claude/index.md`](../index.md)'s feature registry
- Why something was built a certain way: [`.claude/decisions/`](../decisions/)
- How to do a specific kind of task: [`.claude/workflows/`](../workflows/) and [`.claude/skills/`](../skills/)
