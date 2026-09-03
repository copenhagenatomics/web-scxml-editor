# Project Overview

## What this is

A browser-based visual editor for **SCXML** (State Chart XML, W3C statechart standard), built for **Copenhagen Atomics**. It provides a Monaco XML code editor and a ReactFlow visual diagram editor for the *same* document, kept in two-way sync, plus SCXML validation, ELK auto-layout, undo/redo, and GitHub push/pull.

Package name in `package.json` is still `scxml-parser` (historical — the product is the full editor, not just a parser).

## Who it's for and why it exists

This is **not a generic SCXML tool**. It exists to author state machines for **Copenhagen Atomics' "LoopControl"** industrial control platform. The authored SCXML is compiled by a downstream **C# code generator** and run on **Raspberry Pi-based control hardware** (pumps, valves, heaters, sensors — see the real-world example `argon_supply.scxml` referenced in `docs/invalid-event-identifiers.md`). This drives several product decisions that would look unusual in a generic SCXML tool:

- **Two deployment/run modes**: standalone (Welcome screen, upload/create-new) and **embedded** as an iframe inside LoopControl, which pushes/pulls SCXML through a `window.ScxmlEditorAPI` bridge. See `.claude/project/architecture.md` §Host API and `.claude/features/host-api-embedding.md`.
- **Validation rules that exist to protect the downstream C# generator**, not just the SCXML spec: event names can't be C# reserved words or start with a digit, `assign/@location` can't contain a wildcard, two event names can't sanitize to the same generated identifier. Source: `docs/invalid-event-identifiers.md` (a real postmortem from testing `argon_supply.scxml`).
- **Domain-specific datamodel naming conventions** layered on plain SCXML (`conf_`, `this_`, `main_` prefixes — see `.claude/project/terminology.md`).
- **The "Events" panel is labeled "User Actions"** and defines operator-facing UI buttons with physical engineering units (V, A, l/min, °C, bar, ppm, rpm — `src/components/ui/events-panel.tsx:11`) for a separate LoopControl "operate" page.

## Ground truth vs. stale docs

Two pre-existing docs in this repo **do not match the current implementation** and should not be trusted as architecture references:
- `DEVELOPER_GUIDE.md` — describes a hypothetical `VisualMetadataManager` static API, a two-stack `HistoryManager`, a `viz:handles` JSON attribute, and other things that don't exist in code.
- `.claude/context/CLAUDE.md` — claims "no test framework configured" (false: Vitest + 47 test files exist) and an XState 5.21.0 dependency (not installed).
- `.claude/context/milestones.md` — a historical 5-week planning doc from when this was envisioned as a VS Code plugin port using D3.js/react-tabs/cmdk; almost none of those libraries ended up in the real stack (ReactFlow + Zustand + Tailwind were used instead). Useful only as history, not as current architecture.

**This `.claude/` knowledge base (project/, features/, decisions/, workflows/) is the corrected, code-verified replacement.** `PROJECT_ANALYSIS.md` at the repo root is the full-detail research document this knowledge base was distilled from — consult it for exhaustive file:line detail beyond what's summarized here.

## The real changelog

`docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` (23 dated pairs) are the closest thing to a changelog — each documents one shipped feature with its design rationale. They are the best source for **why** a feature works the way it does. Referenced throughout `.claude/features/*.md`.

## Current branch context

Branch `new-requirements-ui`, based on `main`. Recent history (`git log`) shows active work on: automated release/changelog tooling, time-event token renaming on state rename, and event-name validation for space-separated values — consistent with an actively maintained, still-evolving product.
