# Knowledge Maintenance Workflow

This is the detailed, mechanical procedure for deciding whether a completed piece of development work requires updating `.claude/` (or the other project docs it points to), and for actually making that update correctly. It specializes `.claude/workflows/development.md` steps 17–18 into a standalone, self-contained process, and is the process the `knowledge-maintenance` skill (`.claude/skills/knowledge-maintenance/SKILL.md`) invokes.

**Why this exists**: this repository has two documents (`DEVELOPER_GUIDE.md`, `.claude/context/CLAUDE.md`) that are living proof of what happens when documentation isn't maintained alongside code — both are now confirmed to actively mislead rather than merely lag. The entire `.claude/` knowledge base was built to replace them, and it is only trustworthy for as long as it's kept accurate. This workflow is the mechanism that keeps it that way.

**Why the opposite failure mode matters too**: a knowledge base that grows a new file or a new decision record for every trivial change becomes noisy, hard to navigate, and — paradoxically — *less* trustworthy, because a reader can no longer tell which entries are load-bearing and which are clutter. Under-maintenance and over-maintenance are both failures. This workflow's job is to hit the narrow target between them.

---

## The materiality test (apply this before anything else)

> **Update knowledge only when a future reader of the docs — including a future Claude session with no memory of this conversation — would be actively misled, or would miss something they needed, if the docs were left as they are.**

This is stricter than "did code change" and looser than "did the user explicitly ask for a doc update." Concretely, a change clears this bar when it does at least one of:

- Changes something a `.claude/features/*.md` file **currently asserts** about behavior.
- Changes, adds, or removes an **invariant** — something other code, or a human, currently relies on being true.
- Reflects a genuine **decision** (a choice made between real alternatives, or a reversal of a previous choice) rather than a routine implementation detail.
- Closes or newly confirms one of the entries in `.claude/index.md`'s "Known issues" list.
- Introduces a **new shared concept** (a term, a naming convention, a cross-cutting rule) that isn't self-explanatory from reading the changed code alone.

A change does **not** clear this bar merely because:
- Code was touched (most diffs are implementation detail with no documented-behavior claim attached to them).
- A variable, file, or function was renamed with no behavior change.
- A test was added for existing, already-correctly-documented behavior.
- A refactor made code cleaner without changing what it does (see `.claude/skills/refactoring/SKILL.md` — behavior preservation is the explicit goal there).

When genuinely unsure, prefer a smaller, targeted update (one sentence added to an existing section) over either silence or a new full document — see "Proportionality" near the end of this file.

---

## The 10 trigger questions

Run every one of these against the change. Most will be "no" for a typical change — that's expected, not a sign you're doing this wrong. Answering "no" explicitly (even just to yourself) is what prevents both under- and over-documentation; don't skip a question because it seems obviously irrelevant.

| # | Question | If yes, affected knowledge categories | How to check |
|---|---|---|---|
| 1 | Did **externally visible behavior** change (what a user sees/can do, what an API/Host method returns, what a validation rule flags)? | Feature docs, possibly Project overview | Compare the feature doc's "User behavior"/"UI behavior" sections against the new behavior. |
| 2 | Did **architecture** change (a new mutation strategy, a new store, a new pipeline, a component moved between layers)? | Architecture documentation, possibly Project rules | Check `.claude/project/architecture.md` and the relevant numbered section(s) of `project-rules.md`. |
| 3 | Did **data flow** change (what reads/writes what, a new dependency between stores/pipelines, a changed sync mechanism)? | Architecture documentation, Feature docs | Check the "Data flow"/"Internal architecture" section of every feature doc touching the changed path. |
| 4 | Did an **important invariant** change (something else in the codebase assumes this stays true)? | Project rules, Decisions, Feature docs' "Things that must NOT be changed" | Grep `project-rules.md` and the relevant feature docs for the old invariant's statement. |
| 5 | Did a **project rule** change (an `[EXPLICIT]` or `[INFERRED]` rule in `project-rules.md` is now different)? | Project rules, and the Decision that rule was based on if one exists | Find the specific numbered rule; update its text and re-check its tag (`[EXPLICIT]`/`[INFERRED]`). |
| 6 | Was a **new design decision** introduced (a real choice was made between genuine alternatives, or a new non-obvious constraint was deliberately accepted)? | Decisions (new entry) | Use the template at the bottom of this file. |
| 7 | Was an **old decision invalidated** (you did something a `decisions/*.md` entry says not to, deliberately and for a good reason)? | Decisions (update `Status`) | Find the entry; do not delete it — see "Superseding a decision" below. |
| 8 | Did a **previously undocumented behavior become important** (an edge case that used to be obscure is now something a developer needs to know)? | Feature docs ("Important edge cases" / "Known limitations") | Add it where it now matters; don't retroactively invent history for it. |
| 9 | Did a **test establish a new expected behavior** (not just cover existing, already-documented behavior)? | Feature docs, possibly Decisions | If the test encodes a contract nobody wrote down before, write it down now. |
| 10 | Did an **integration or dependency** change (a new library, a changed API version, a new environment variable, a changed build/deploy step)? | Architecture documentation, Configuration/Integration decisions, Workflows | Check `decisions/configuration.md`, `decisions/integrations.md`, and `workflows/release-process.md`/`local-github-integration-setup.md` for anything now inaccurate. |

---

## Category-by-category guidance

For each "yes" from the table above, use this section to decide *what exactly* to touch and how much.

### Project overview (`.claude/project/overview.md`)
Update only for a change to the project's *identity*: what it is, who it's for, why it exists, which stack/deployment model it uses, or which existing docs are stale. This file changes rarely — most development work never touches it. Example of something that *would* warrant an update: the app gaining a genuinely new deployment target beyond standalone/LoopControl-embedded. Example of something that would *not*: adding a new panel.

### Architecture documentation (`.claude/project/architecture.md`, `scxml-rules.md`, `ui-rules.md`, `coding-rules.md`)
Update when the *shape* of the system changed: a new store, a new mutation strategy, a new pipeline, a changed sync mechanism, a changed directory-to-concern mapping. Do not update for a change entirely internal to one function's implementation. If a new pattern was established that future work should follow (e.g., a new kind of shared utility), add it to `coding-rules.md` as a rule, not just as a mention in a feature doc.

### Feature documentation (`.claude/features/*.md`)
This is the most frequently updated category. Update the specific section that's now wrong:
- **Purpose/User behavior/UI behavior** — only if what the feature does or how it's used changed.
- **Internal architecture/Relevant components/state/utilities** — if the implementation mechanism changed in a way another developer extending this feature would need to know (not every internal refactor qualifies — see the materiality test).
- **Known limitations** — remove an entry you fixed; add one you discovered but didn't fix (and cross-check `.claude/index.md`'s "Known issues" list, which must stay in sync with this).
- **Important edge cases** — add a newly-discovered or newly-introduced one; do not pad this section with hypotheticals that haven't actually been observed or reasoned through concretely.
- **Things that must NOT be changed** — add an entry only when you've confirmed (not guessed) that changing it would break something; this section's credibility depends on every entry being real.
- If the feature is genuinely new (not an extension of an existing documented feature), create a new file following the exact template of an existing one — do not invent a different structure — and add it to all three relevant tables in `.claude/index.md` (alphabetical, thematic, keyword-lookup).

### Project rules (`.claude/project/project-rules.md`)
Update a numbered rule when the behavior it describes changed, or add a new numbered rule (in the correct one of the 23 categories, at the end of that category's list — do not renumber existing rules) when a change establishes a new invariant significant enough that violating it in the future would be a real regression. Always set the `[EXPLICIT]`/`[INFERRED]` tag deliberately: `[EXPLICIT]` only if there's a stated reason (a comment, a test, a commit message, a decision record); `[INFERRED]` if it's consistently true but nobody decided it on purpose.

### Design decisions (`.claude/decisions/*.md`)
See the dedicated "Recording a new decision" section and template below. Two special cases:
- **Superseding a decision**: never delete a `Superseded` or previously-`Accepted`-now-reversed entry. Change its `Status` to `Superseded`, and add one sentence noting what replaced it (with a pointer to the new decision, if there is one). The historical record of "this was tried and abandoned" is exactly what prevents a future session from retrying it blind.
- **Confirming an `Inferred behavior` as intentional**: if you investigate a decision marked `Inferred behavior` and confirm (with real evidence — a commit, a comment, a stakeholder statement relayed by the user) that it *was* actually deliberate, upgrade its `Status` to `Accepted` and add the evidence you found. Don't upgrade the status without new evidence just because it "seems reasonable."

### Workflows (`.claude/workflows/*.md`)
Update `development.md` or a specific workflow file when the *general process* changed — a new verification command exists, a new gotcha needs to be added to a task-type row, a step in `adding-a-command.md`/`adding-a-validation-rule.md`/`adding-a-side-panel.md` no longer matches the established pattern. Do not update a workflow file to mention one specific feature's details — that belongs in a feature doc, referenced from the workflow if relevant.

### Skills (`.claude/skills/*/SKILL.md`)
Update a skill only when *how to approach* that category of work changed — a new investigation step is now necessary, a common mistake was newly discovered, a knowledge file it points to was renamed or split. Do not update a skill just because a feature it might touch changed; skills are process wrappers and should stay stable across most feature-level churn (see `.claude/skills/README.md`'s design principle). If an entirely new recurring activity shape emerges that doesn't fit any of the 10 existing skills, consider whether it clears the same bar the original skill set was designed against (`.claude/skills/README.md`'s "Categories considered but deliberately NOT given a dedicated skill" section) before adding an 11th.

### Terminology (`.claude/project/terminology.md`)
Add an entry when a change introduces a new term, prefix convention, acronym, or concept name that isn't self-explanatory from the code alone and that other documentation will need to reference (following the existing `conf_`/`this_`/`main_`, "Initial State group," "transition slot" precedents). Do not add an entry for an ordinary variable/function name that's already clear from context.

### Other knowledge files
- **`PROJECT_ANALYSIS.md`** (repository root) is a point-in-time research snapshot, not a living document — it is not incrementally maintained the way `.claude/` is. Leave it as historical record unless a change makes one of its specific claims actively dangerous to trust (rare); if so, prefer noting the discrepancy in the relevant `.claude/features/*.md`/`decisions/*.md` file rather than editing the snapshot itself.
- **`README.md`** (repository root) is genuinely user-facing — update it when a change affects what it documents (keyboard shortcuts, feature descriptions, setup steps, the release process) so an actual end user isn't misled.
- **`DEVELOPER_GUIDE.md`, `.claude/context/*.md`** are confirmed stale and explicitly superseded by `.claude/`. Do not spend effort incrementally patching them — that would legitimize them as a maintained source when they aren't. If you're touching one of these, the right action is almost always "point future readers to `.claude/` instead," not "fix this specific claim."

---

## The practical workflow (run this after finishing development work)

1. **Gather what changed.** Look at your actual diff (`git diff`), not your memory of your intentions — the two can differ by the time you're done.
2. **Run the 10 trigger questions** against that diff. Answer each one explicitly; "no" is a valid, complete answer.
3. **For every "yes," identify the specific affected file(s)** using the category guidance above — not just "features," but the exact `.claude/features/<name>.md` file and the exact section within it.
4. **Apply the materiality test** to each candidate update. If it fails the test, do not make the edit — but do not silently drop it either; note in your final summary that you considered it and decided it wasn't material (this is what distinguishes "diligently decided not to update" from "forgot to check").
5. **Make the edits**, following the existing template/structure for whatever file you're touching exactly (feature docs, decision records, and rules all have an established shape — match it, don't improvise a new one).
6. **Fix cross-references.** If you renamed a section, added a new decision number, or moved content, grep for anything that references the old location (`.claude/index.md`'s tables, other feature docs' "Related features"/"Related files" sections, other decisions' crosslinks) and update them. A stale cross-reference is its own form of drift.
7. **Update `.claude/index.md` if needed**: a new feature doc needs all three of its table entries (alphabetical, thematic, keyword-lookup); a new or status-changed decision needs its "searchable decision index" row updated or added; a fixed "Known issue" needs to be removed from that list.
8. **Re-read what you wrote** as if you were a future session with no memory of this conversation — does it stand alone, or does it assume context only you currently have?
9. **Report what you updated and what you deliberately did not**, in your summary to the user — this is what step 4's "note it" instruction is for; it turns a silent judgment call into a visible, reviewable one.

---

## Proportionality — match the edit size to the change size

- A one-line behavior tweak that's still worth documenting gets a one- or two-sentence edit to an existing section, not a rewritten file.
- A change that closes a documented "Known limitation" gets that bullet removed (and the fix noted, briefly) — not a new "Resolved Issues" section invented for the occasion.
- A change substantial enough to need a new `.claude/features/*.md` file is substantial enough to also earn a moment's thought about whether it needs a new `decisions/*.md` entry (why was it built this way) — but needing one does not imply needing both every time.
- Never restructure an existing file's established template while making an unrelated content update — if the template itself seems wrong, that's a separate, deliberate task (see `.claude/skills/knowledge-maintenance/SKILL.md`'s common-mistakes list), not something to fold into an incidental edit.

---

## Recording a new decision — template

Use this whenever trigger question 6 or 7 fires. Append it as the next numbered entry in the correct one of the 14 topical files under `.claude/decisions/` (`architecture.md`, `state-management.md`, `scxml.md`, `visual-diagram.md`, `editing.md`, `validation.md`, `error-handling.md`, `testing.md`, `backward-compatibility.md`, `configuration.md`, `naming-conventions.md`, `ui-ux.md`, `integrations.md`, `performance.md`) — never create a new single-topic decision file; that structure was deliberately consolidated away from (see `decisions/architecture.md`'s own history for why the file layout looks the way it does).

```markdown
## N. <Short, specific title — describes the decision, not just the area it's in>

### Context
<What problem, requirement, bug, or prior limitation led to this. Be concrete — cite the
triggering issue, request, or constraint, not a generic restatement of the area.>

### Decision
<What the project now does, stated precisely enough that a future reader could verify it
against the code without guessing.>

### Reason
<Why this approach was chosen, if known. If there is no stated rationale anywhere (no
comment, commit message, test, or prior conversation confirms intent), write exactly
that — "No explicit rationale found; this is the observed behavior" — and set Status to
`Inferred behavior` instead of `Accepted`. Do not invent a plausible-sounding reason.>

### Constraints
<What must remain true for this decision to keep holding. What other code/behavior
depends on it. What would break, and how, if it were violated.>

### Alternatives
<Include this section ONLY if there is real evidence an alternative was actually tried,
proposed, or rejected — a reverted commit, a prior implementation, an explicit prior
design later replaced. Omit the section entirely otherwise; do not fabricate
alternatives that were never genuinely considered.>

### Evidence
<File paths (with line numbers where precise), test names, commit hashes/messages,
related plan/spec docs, or direct quotes from the requesting conversation.>

### Status
<One of: Accepted / Deprecated / Superseded / Inferred behavior>
```

**After adding the entry:**
1. Add a row to `.claude/index.md`'s "Searchable decision index" table (a plain-language "why does X happen" phrasing → `decisions/<topic>.md #N`).
2. If this decision reverses an earlier one, go update that earlier entry's `Status` to `Superseded` and add a one-line pointer to the new entry — do not leave the old entry looking current.
3. If a `.claude/features/*.md` file's "Previous design decisions" section should now cite this, add the cross-reference there too.

### Status field — how to choose

| Status | Use when |
|---|---|
| `Accepted` | Current, deliberate, and still in force. The default for a newly-made decision with a real, evidenced reason. |
| `Deprecated` | Still in force today, but the project intends to move away from it (rare — most things here are either `Accepted` or already `Superseded`, not in a transitional state). |
| `Superseded` | No longer in force — something else replaced it. Keep the entry; do not delete it. |
| `Inferred behavior` | This is what the code does, but no evidence was found that anyone decided it on purpose. Do not upgrade to `Accepted` without new evidence. |
