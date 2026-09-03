---
name: codebase-exploration
description: Answer "how does X work", "where is Y implemented", or general orientation questions about the SCXML Editor without making a code change. Use when the user wants understanding, not a diff. Enforces checking the existing knowledge base before grepping blindly, and verifying any doc claim against current source since some project docs are known stale.
---

# Codebase Exploration

For read-only investigation and explanation — no code change is being made. This skill exists because this repo has an unusually large pre-built knowledge base (`.claude/`), and the highest-value first move is almost always to consult it rather than re-deriving everything from a cold grep.

## When to use

"How does two-way sync work?" "Where is the ELK layout configured?" "What happens when I rename a state?" "Why does this app have a `server/` directory?" Any question answerable without editing files. Also use this when a user asks you to investigate something as a precursor to a future task ("look into how X works, we might change it later") — the answer should still route through this skill even if a change is anticipated.

## Required investigation steps

1. **Check `.claude/index.md` first** — its keyword/symptom table routes plain-language questions to the right `.claude/features/*.md` file; its searchable decision index does the same for "why" questions.
2. Read the routed feature/decision doc(s). Note their **Status**/confidence — a feature doc's claims were verified against source at time of writing, but the repo moves; a decision's `Status: Inferred behavior` means "this is what happens, not necessarily what anyone intended."
3. **Verify anything load-bearing to your answer against the actual current source** — don't relay a doc's file:line claim without spot-checking it if the question is precise or the answer will inform a subsequent change. Two specific docs are *known* stale project-wide and must never be used as a primary source: `DEVELOPER_GUIDE.md` and `.claude/context/CLAUDE.md`.
4. If the question spans multiple features, use the "Related features"/"Related files" sections to follow the thread rather than guessing at connections.
5. If no existing doc covers the question, investigate directly (Grep/Read/Explore) and answer from source — then consider (per `knowledge-maintenance`) whether the answer is valuable enough to add to the knowledge base for next time.

## Relevant knowledge files

All of `.claude/` is in scope here — this skill's entire job is routing to the right subset of it. `.claude/index.md` is the mandatory starting point.

## Relevant project rules

`.claude/project/project-rules.md`'s closing section ("How to use this document") applies directly: an `[EXPLICIT]` rule is a stronger answer than an `[INFERRED]` one when the question is "is this intentional?"

## Relevant decision records

Whichever `.claude/decisions/*.md` entries the index routes you to. Pay attention to `Alternatives` sections — they answer "why not do it the other way" questions directly, when evidenced.

## Implementation expectations

N/A — no code changes. The "implementation" here is the quality and accuracy of the explanation.

## Testing expectations

N/A — but if the answer depended on tracing behavior you're not fully certain of, say so explicitly ("this is my reading of the code; I have not run it to confirm") rather than presenting an inference as a verified fact.

## Common mistakes to avoid

- Answering purely from `DEVELOPER_GUIDE.md` or `.claude/context/CLAUDE.md` — both contain specific, confirmed-wrong claims (a hypothetical `VisualMetadataManager` static API, a two-stack undo/redo design that was never built, an XState dependency that isn't installed, "no test framework configured" despite 47 Vitest files existing).
- Grepping the whole repo cold when `index.md`'s keyword table would have routed you directly to the answer in one lookup.
- Presenting a feature doc's "Known limitations" or "Inferred behavior" content as if it were confirmed-intentional design, or vice versa.
- Not distinguishing, in your answer, between what the code currently does and what a stale doc *says* it does, when the two diverge — surface the discrepancy explicitly (per `development.md`'s "if documentation conflicts with source code, investigate and identify the discrepancy" rule).
