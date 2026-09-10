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

---

## 6. Host-originated `'error'`-level toasts are unconditionally redirected to the persistent Host Alerts panel, sanitized at the `window.ScxmlEditorAPI` boundary — never by message length

### Context
The LoopControl host calls `window.ScxmlEditorAPI.showFeedback(message, 'error')` to report operational failures (observed case: an "Apply"/"Generate Program" action failing, with `message` being the raw exception text — anything from a multi-KB C# compiler dump with embedded generated-code snippets down to a single-sentence .NET `Process.Start` exception). The transient toast (`feedbackQueue`, auto-dismisses after 4s, `max-w-lg`) is unsuitable for this content regardless of its length — a user reported it rendering as an oversized, unreadable wall of text.

### Decision
`src/app/_hooks/use-host-api-bridge.ts` wraps the host-facing `showFeedback` in a `hostShowFeedback` function (used for both the live `realApi.showFeedback` assignment and the pre-ready `_q.ops` queue replay — see decision #7 below for the queue's ordered-replay mechanism). Any call with `level === 'error'` is unconditionally split: the full, unmodified message is pushed into the persistent Host Alerts panel via `showErrors` (`useHostAPIStore.hostErrors`), and the toast itself is replaced with a fixed string, `"Host reported an error. See Error Panel for details."` — regardless of the original message's length, wording, or which host operation produced it (see decision #8 — this string was originally operation-specific and was generalized). `useHostAPIStore`'s own `showFeedback` action stays an unconditional passthrough; this repo's ~20 other `showFeedback('error', ...)` call sites (GitHub push/pull, state-actions-panel, transition-panel, config/events panels, `executeCommand`'s own catch block) all call the store directly and are unaffected.

### Reason
Two more targeted approaches were tried first and both failed on real examples from this app, which is why the fix ended up at this specific boundary with no length condition:
1. **Shortening only inside `executeCommand`'s `catch` block** (host-registered command throws → caught → toast shortened). Failed because the host's "Apply"/"Generate" command's `run()` catches its own error internally and calls `showFeedback` directly — it never throws, so this catch never fires for the reported case.
2. **A message-length threshold inside the shared `useHostAPIStore.showFeedback`** (redirect to Host Alerts only above N characters). Failed because no threshold can separate "detailed exception dump" from "legitimate long message" — a genuine 228-character host exception message needed redirecting, while this repo already has a legitimate, curated 156-character error toast (`use-github-connect.ts`'s GitHub-not-configured message) that must **not** be redirected. Content length doesn't correlate with whether a message belongs in a toast; origin does — every one of this repo's own toasts is short by construction because a developer wrote it, and only the host's messages are raw, unbounded exception text.

### Constraints
- `hostShowFeedback` (not the store's `showFeedback`) must remain the assignment target for both `realApi.showFeedback` and the `_q.ops` queue replay in `use-host-api-bridge.ts` — reverting either to call the store's `showFeedback` directly reopens this bug.
- Do not reintroduce a length- or content-pattern-based heuristic for deciding whether to redirect a toast — see the two failed alternatives above.
- The fixed toast string must stay operation-agnostic (currently `"Host reported an error. See Error Panel for details."`) — see decision #8 for why an earlier, operation-specific wording ("Failed generating program...") was replaced.
- `executeCommand`'s own `catch` block (`src/stores/host-api-store.ts`) independently does the same redirect-to-Host-Alerts pattern for a command that *throws*, using `` `${command.label} failed. See Error Panel for details.` `` instead of the fixed host-boundary string — kept as a defensive fallback for a command that violates the "catch your own errors" pattern the host currently follows, and to keep `executeCommand` failures out of the toast regardless of which layer eventually calls `showFeedback`.

### Alternatives
See "Reason" above — both rejected alternatives are described there with the concrete evidence that broke each one, since that evidence is the point of this record.

### Evidence
`src/app/_hooks/use-host-api-bridge.ts` (`hostShowFeedback`), `src/app/_hooks/use-host-api-bridge.test.ts`, `src/stores/host-api-store.ts` (`executeCommand`'s catch), `src/stores/host-api-store.test.ts`. Triggering conversation: a user screenshot of a multi-KB CS8510 compiler-error toast, followed by a second screenshot (after the first fix) of a 228-character `.NET` `Process.Start` exception toast that a length threshold had missed.

### Status
Accepted.

---

## 7. The pre-ready `_q` host-API queue replays calls as a single ordered list, not per-method buckets — and `clearHostErrors()` resets the pending Host Alerts tab request together with the error list

### Context
The `_q` pre-ready queue (see `host-api-embedding.md`) originally stored `showFeedback`/`showErrors`/`clearErrors` calls in separate buckets (`feedback: [...]`, `hostErrors: [...]`, `clearErrors: boolean`) and replayed them in a fixed hardcoded order once React mounted, rather than the host's actual call order. A host that reports an error and then calls `clearErrors()` before React mounts (or the reverse) would have that interleaving silently discarded.

Fixing that surfaced a second, previously-latent bug in `useHostAPIStore.clearHostErrors()`: `showErrors()` sets both `hostErrors` and `requestedValidationTab: 'host-alerts'` (see decision #6 above), but `clearHostErrors()` only cleared `hostErrors`. Once queued calls could genuinely be replayed in the host's original order (`showErrors` then `clearErrors`), the leftover `requestedValidationTab: 'host-alerts'` would still force-open the Host Alerts tab on mount even though the error list was already empty.

### Decision
`window.ScxmlEditorAPI._q` (defined by `src/lib/host-api/pre-ready-stub.ts`'s stub script, embedded into `src/app/layout.tsx` before React mounts) has a single `ops: QueuedOp[]` field instead of separate `feedback`/`hostErrors`/`clearErrors` fields; each queued `showFeedback`/`showErrors`/`clearErrors` call pushes one typed op (`{type:'feedback',...}` / `{type:'showErrors',...}` / `{type:'clearErrors'}`). `use-host-api-bridge.ts`'s stub-upgrade code replays `queue.ops` in original array order, dispatching each op to the same store actions the live API would call. Separately, `useHostAPIStore.clearHostErrors()` now resets `requestedValidationTab` to `null` alongside `hostErrors`, so a `showErrors()` immediately followed by `clearHostErrors()` — live or replayed from the pre-ready queue — leaves no pending tab-switch request behind.

### Reason
No rationale beyond direct correctness: the previous bucketed queue and the `hostErrors`-only clear were both bugs once call ordering actually mattered — previously masked because a pre-ready `clearErrors`/`showErrors` interleaving was untested and unlikely with a single reported error. The `requestedValidationTab` leak was confirmed via a GitHub Copilot automated PR-review comment on the ops-queue change, then verified against source and fixed.

### Constraints
- Any new `window.ScxmlEditorAPI` method callable before React mounts must push its own `QueuedOp` variant onto `_q.ops` (`src/lib/host-api/pre-ready-stub.ts`) and be handled in `use-host-api-bridge.ts`'s `queue.ops.forEach` — do not add a parallel bucket field; that is exactly the pattern this decision replaced.
- Any store action that sets `requestedValidationTab` as a side effect (currently only `showErrors`) must be paired with the action that clears the corresponding state (`clearHostErrors`) also resetting it — do not let the two fields drift independently again.

### Alternatives
The previous per-method-bucket queue (`feedback`/`hostErrors`/`clearErrors` as separate arrays/flag, replayed in a fixed hardcoded order) is the rejected prior implementation, replaced because it structurally cannot preserve call order across different methods.

### Evidence
`src/lib/host-api/pre-ready-stub.ts` (`_q` stub script, embedded by `src/app/layout.tsx`), `src/app/_hooks/use-host-api-bridge.ts` (`QueuedOp`, `queue.ops.forEach`), `src/app/_hooks/use-host-api-bridge.test.ts` (ordering tests), `src/stores/host-api-store.ts` (`clearHostErrors`), `src/stores/host-api-store.test.ts`. Triggering: a GitHub Copilot automated PR review comment flagging the `requestedValidationTab` leak in the `clearErrors`-after-`showErrors` case.

### Status
Accepted.

---

## 8. The host-originated error toast's fixed string is operation-agnostic, not "Failed generating program"

### Context
Decision #6 originally used the fixed toast string `"Failed generating program. See Error Panel for details."`, under the assumption — noted as a known, structurally-unenforced risk in that decision's Constraints — that program generation/apply was the sole real-world use of `window.ScxmlEditorAPI.showFeedback(message, 'error')`. That assumption was already contradicted by this repo's own test suite: `use-host-api-bridge.test.ts`'s "redirects a short host error message too" test used `'Invalid channel mapping.'` as the raw error text while still asserting the "Failed generating program" toast — a channel-mapping failure, not a generation failure. `showFeedback` is a fully generic host API method (also documented as used for confirmation toasts in `events-user-actions-panel.md`/`state-actions-panel.md`), so nothing prevents a host from reporting a channel/event/config-load failure through it.

### Decision
The fixed toast string in `hostShowFeedback` (`src/app/_hooks/use-host-api-bridge.ts`) is now `"Host reported an error. See Error Panel for details."` — it no longer names a specific operation. The behavior otherwise (full message routed to `hostErrors`, fixed short toast, unconditional on level `'error'`) is unchanged from decision #6.

### Reason
Confirmed via a GitHub Copilot automated PR-review comment pointing out the test/code contradiction above, then verified against `host-api-embedding.md`'s own description of `showFeedback` as a generic API before making the fix.

### Constraints
- Do not reintroduce operation-specific wording (e.g. "generating program", "applying changes") in this fixed string — `showFeedback('error', ...)` is a generic host API call with no way to know which operation actually failed.

### Alternatives
None — the only change is the literal string; the redirect mechanism itself (decision #6) is unaffected.

### Evidence
`src/app/_hooks/use-host-api-bridge.ts` (`hostShowFeedback`), `src/app/_hooks/use-host-api-bridge.test.ts` (both the long- and short-message tests now assert the operation-agnostic string).

### Status
Accepted.
