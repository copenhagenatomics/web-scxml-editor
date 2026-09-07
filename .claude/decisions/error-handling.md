# Error Handling Decisions

---

## 1. A single, app-wide React `ErrorBoundary` catches render-time exceptions

### Context
An unhandled exception anywhere in the render tree would otherwise produce a blank/frozen page with no recovery path.

### Decision
`ErrorBoundary` (a class component, as required by React's error-boundary API) wraps the entire application once, at the top of `src/app/page.tsx`, showing a default fallback UI (error details + "Try again" button) rather than a custom per-feature fallback.

### Reason
Not documented in a dedicated note. React error boundaries can only be class components (no hook equivalent), which explains the implementation choice; wrapping the whole app once (rather than many smaller boundaries) is the simpler of the two options and appears to be what was actually built.

### Constraints
**Structurally, this cannot catch errors thrown from event handlers, async code, or timers** — only render/lifecycle/constructor errors. A large share of this app's logic runs inside event handlers (every Command invocation from `visual-diagram.tsx`), so most runtime errors in the actual mutation code path are not covered by this boundary at all.

### Alternatives
A more granular, multi-boundary strategy (e.g. one boundary around the diagram, one per side panel) is not implemented — whether it was considered and rejected, or simply not pursued, is not documented.

### Evidence
`src/components/ui/error-boundary.tsx`, `src/app/page.tsx` (single top-level wrap).

### Status
Accepted (current, single-boundary approach) — its narrow catch-scope (render-phase only) should be treated as an important, easy-to-overlook constraint, not as evidence of intentionally-limited coverage.

---

## 2. XML syntax checking is deliberately duplicated (a hand-rolled checker plus the library's own validator)

### Context
`fast-xml-parser`'s own `XMLValidator.validate()` already reports malformed-XML errors.

### Decision
`SCXMLParser` runs a custom, hand-rolled character-scanning syntax checker (`validateXMLSyntax`) **first**, then also runs `fast-xml-parser`'s own validator as a second, deduplicated opinion.

### Reason
Not documented in a dedicated note, but the sheer amount of custom logic invested (CDATA/comment/processing-instruction-aware state tracking, a heuristic to avoid false "unclosed tag" errors while a user is still mid-typing) strongly implies the library's own error messages/positions were found insufficiently precise or user-friendly for this app's real-time-as-you-type validation UX.

### Constraints
Both checks currently run on every validation pass (every 500ms debounce tick) — a real, small, ongoing performance cost accepted in exchange for better error precision.

### Alternatives
Relying solely on `fast-xml-parser`'s validator is the implicit alternative that was not (or is no longer) considered sufficient — no commit isolates this as a from-scratch decision, but the custom checker's specific value-adds (mid-typing tolerance, viz-namespace-aware leniency) go beyond what a generic library validator would provide out of the box.

### Evidence
`src/lib/parsers/scxml-parser.ts` (`validateXMLSyntax`, `XMLValidator.validate()` called as a second pass, deduplication logic).

### Status
Accepted.

---

## 3. Clean-export failure has a three-tier fallback chain, ending in "silently return the original content"

### Context
Stripping `viz:` metadata for a W3C-compliant export can fail if the document doesn't parse cleanly.

### Decision
"Clean SCXML" export first tries structural stripping (`SCXMLParser.parse` → `serialize(data, false)`), falls back to regex-based stripping (`removeVisualMetadataFromXML`) if parsing fails, and — if even that throws — falls back to downloading the **original, unmodified** content while still presenting the action as having produced a clean file (same "-clean" filename suffix, same button).

### Reason
Not documented in a dedicated note. The first two tiers are a reasonable, deliberate robustness chain (structural preferred, regex as a safety net). The third tier (silently serving un-stripped content) reads as an unintended edge case of "always give the user *something* rather than a hard failure," rather than a deliberately accepted risk — no comment acknowledges that this specific final fallback could leak visual metadata into what's presented as a clean, production-ready export.

### Constraints
Do not treat the current three-tier chain as fully safe — the third tier is a known, real risk (silent metadata leakage with no error shown to the user), not a deliberately accepted tradeoff.

### Alternatives
Failing loudly (showing an error instead of silently substituting un-stripped content) is the implicit alternative not chosen for the final tier — whether this was a conscious choice or simply how the `try/catch` nesting fell out during implementation is not documented.

### Evidence
`src/app/_hooks/use-download.ts` (`handleDownloadClean`), `src/components/file-operations/visual-metadata-export.tsx` (a second, unused implementation of the identical fallback chain).

### Status
Accepted for tiers 1–2; tier 3 (silent original-content fallback) is Inferred behavior — a real risk, not a deliberate, accepted design choice.

---

## 4. Commands report failure via a return value, never by throwing

### Context
A Command's `execute()`/`undo()` can fail to find its target element, encounter unparseable XML, etc.

### Decision
Every Command signals failure via `{success: false, error: string}` in its return value (`createFailureResult`), never by throwing an exception — callers check `.success` before using `.content`.

### Reason
Not documented in a dedicated note, but this is a deliberate, consistent contract across all 16 command classes — a thrown exception from deep inside a command would not be caught by the app's `ErrorBoundary` anyway (see #1, event-handler-triggered errors aren't caught), so a return-value contract is the only way command failures can be handled gracefully by the calling component.

### Constraints
New commands must follow this contract — throwing instead of returning `{success: false}` would produce an uncaught exception with no user-facing recovery, given the `ErrorBoundary`'s documented blind spot.

### Alternatives
None found evidenced (no command throws in the current codebase).

### Evidence
`src/lib/commands/base-command.ts` (`createSuccessResult`/`createFailureResult`), consistent `{success, content, error}` shape across all command files.

### Status
Accepted.

---

## 5. GitHub push conflicts (HTTP 409) are surfaced with a specific, actionable message rather than a generic error

### Context
Pushing to a linked GitHub file can fail with a 409 if the file changed on GitHub since the app's last known sha (optimistic concurrency).

### Decision
`github-panel.tsx`'s push handler specifically checks for `err instanceof GithubApiError && err.status === 409` and shows a dedicated message ("The file on GitHub has changed since you last synced — pull first") rather than falling through to the generic error-toast path used for other failures.

### Reason
Not documented in a dedicated note, but this is a clear case of anticipating a specific, meaningful failure mode (a real collaboration hazard — someone else pushed in the meantime) and giving the user the specific correct next action, rather than a generic "something went wrong."

### Constraints
Any change to the push error-handling path must preserve this specific-case check, or users would lose the actionable "pull first" guidance for what is likely the single most common real-world push failure mode (concurrent edits).

### Alternatives
Falling through to a generic error message is the implicit "default" alternative, explicitly not used for this specific, anticipated case.

### Evidence
`src/components/ui/github-panel.tsx` (`handlePush`, the 409-specific branch), `src/lib/github/api.ts` (`GithubApiError`).

### Status
Accepted.
