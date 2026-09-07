# Claude Skills for the SCXML Editor — Design Rationale

This document records the analysis behind which recurring development activities in this repository got a dedicated Claude skill, and — just as important — which didn't, and why. Skills live under `.claude/skills/<name>/SKILL.md`.

## Design principle

**Skills encode HOW Claude should work. The knowledge base (`.claude/project/`, `.claude/features/`, `.claude/decisions/`) encodes WHAT the project contains.** A skill is a thin process wrapper: when to use it, what to investigate before touching code, which knowledge files/rules/decisions are relevant, what "done" looks like, and what mistakes are known to happen in this exact codebase. A skill should never restate feature or decision content at length — if a skill file starts copying paragraphs out of a `.claude/features/*.md` doc, that's a sign it should be a pointer instead.

Every skill here is a **specialization of the general workflow** in `.claude/workflows/development.md`, not a replacement for it. `development.md`'s 19 steps still apply; each skill below adds activity-specific emphasis, extra investigation steps, and known gotchas at the relevant points in that same sequence.

## Skills created (10)

| Skill | Covers |
|---|---|
| [feature-development](feature-development/SKILL.md) | Adding new capability — the default skill for "add X" requests that don't fit a more specific one below |
| [bug-investigation](bug-investigation/SKILL.md) | Diagnosing and fixing a reported defect, including runtime debugging (no separate "debugging" skill — see below) |
| [codebase-exploration](codebase-exploration/SKILL.md) | Answering "how does X work" / orientation questions with no code change |
| [ui-changes](ui-changes/SKILL.md) | Canvas (ReactFlow), Monaco, panel, and interaction changes |
| [scxml-representation](scxml-representation/SKILL.md) | SCXML parsing, serialization, the `viz:` namespace, spec compliance |
| [state-machine-semantics](state-machine-semantics/SKILL.md) | Initial/compound/parallel state rules, transition rules, cross-hierarchy/slot/group logic |
| [validation-rules](validation-rules/SKILL.md) | Adding or editing `SCXMLValidator` rules |
| [test-writing](test-writing/SKILL.md) | Adding or changing tests correctly in this repo's specific setup |
| [refactoring](refactoring/SKILL.md) | Behavior-preserving structural change |
| [knowledge-maintenance](knowledge-maintenance/SKILL.md) | Keeping `.claude/` itself accurate after a change, or on explicit request |

## Categories considered but deliberately NOT given a dedicated skill

- **Code review.** A generic `/code-review` skill already exists at the host level and handles diff-based review broadly. Building a competing project-scoped "code-review" skill would be redundant. Instead, this project's specific regression-prone patterns (Command undo symmetry, `viz:xywh` comma-format, waypoint invalidation, the `__tests__/` exclusion trap, etc.) live in `.claude/project/project-rules.md` and are pulled in by name from the "Implementation expectations" section of `feature-development`, `refactoring`, and the domain-specific skills — so they get checked as part of normal work without a separate invocation step.

- **Performance improvements.** This repo's performance behavior is dominated by a small number of already-identified, deliberate tradeoffs (`.claude/decisions/performance.md`: debouncing, full re-parse per change, per-level ELK layout, the traffic-aware handle-assignment cost model) rather than an open-ended optimization practice with its own investigation shape. It's handled as a task-type row in `.claude/workflows/development.md` directly; there isn't enough repo-specific *process* (as opposed to *facts already documented*) to justify a dedicated skill.

- **One skill per feature.** None of the 37 documented features (`.claude/features/*.md`) have development behavior complex or unique enough to warrant their own skill on top of `feature-development` + that feature's own doc. The two areas that came closest — SCXML representation and state-machine semantics — got dedicated skills not because they're "features" but because they're cross-cutting *domains* with their own investigation shape spanning many features at once (a state-machine-semantics change routinely touches a validator, the converter, a Command, and live UI-blocking simultaneously — see `.claude/project/project-rules.md` §10–11).

- **Configuration changes, integration changes, documentation-only changes.** Each of these is a single row in `.claude/workflows/development.md`'s task-type table with a small, fixed set of gotchas (build-time env vars; the Host API stub surface; doc staleness). That table-row treatment is proportionate — none of them have enough distinct *investigation steps* to earn a full skill of their own.

## Relationship to the rest of `.claude/`

```
.claude/workflows/development.md   ← the 19-step process every skill specializes
.claude/project/*.md               ← architecture + the rules constitution (project-rules.md)
.claude/features/*.md              ← what each feature does today
.claude/decisions/*.md             ← why it does that, and what was tried and abandoned
.claude/skills/*/SKILL.md          ← how to approach a recurring kind of task (this directory)
```

When in doubt about which skill applies, start from `.claude/index.md`'s registries to find the relevant feature/decision docs, then pick the skill whose "When to use" section matches your task shape.
