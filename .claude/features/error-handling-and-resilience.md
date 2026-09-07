# Feature: Error Boundary / Application Resilience

## Purpose

Prevent an unexpected JavaScript exception anywhere in the render tree from producing a completely blank/broken page — catch it, show a recoverable error screen, and let the user retry without a full page reload.

## User behavior

If something throws during rendering (a bug, an unexpected data shape, a third-party library error), the user sees a dedicated "Something went wrong" panel with an expandable error-details section (message + stack trace) and a "Try again" button, instead of a blank white screen or a frozen UI.

## UI behavior

- The default fallback UI shows an alert-triangle icon, a generic message, a collapsible `<details>` block with the raw error message/stack (visible to any user, not gated behind a dev-mode flag — worth knowing if stack traces are considered sensitive in this deployment context), and a "Try again" button that resets the boundary's state (does not reload the page — just re-attempts rendering the children).

## Internal architecture

- `src/components/ui/error-boundary.tsx` — a **class component** (`ErrorBoundary extends React.Component`), since React error boundaries can only be implemented as classes (`getDerivedStateFromError`/`componentDidCatch` have no hook equivalent as of the React version this app uses).
- `componentDidCatch` logs to `console.error` and stores `{error, errorInfo}` in state; `getDerivedStateFromError` is what actually flips `hasError: true` to trigger the fallback render (React's own two-phase error-boundary contract — `getDerivedStateFromError` for the render-phase state update, `componentDidCatch` for the side-effect logging).
- Accepts an optional `fallback` prop (a component receiving `{error, resetError}`) — allows a custom fallback for specific subtrees, though **the only confirmed usage in this app wraps the entire application once**, at the top of `src/app/page.tsx`, with no custom `fallback` supplied (always using `DefaultErrorFallback`) — verify whether any other part of the tree also uses a scoped boundary with a custom fallback before assuming this is the only instance.
- `resetError()` just clears the error state back to `hasError: false` — if the underlying bug is still present and the same code path re-executes on the retry, the boundary will simply catch the same error again; this is a "let the user dismiss and retry" mechanism, not a fix.

## Relevant components

`src/components/ui/error-boundary.tsx`, wrapping usage in `src/app/page.tsx`.

## Relevant state/store

None — purely local React component state (`hasError`, `error`, `errorInfo`).

## Relevant utilities

None dedicated — uses `Button` from `src/components/ui/primitives`.

## SCXML behavior

None directly — though in practice, an unhandled error while parsing/converting/rendering a malformed or unusual SCXML document is exactly the kind of failure this boundary is positioned to catch, preventing a bad document from crashing the entire app.

## Validation rules

None — this is a render-time safety net, unrelated to SCXML semantic validation (`.claude/features/scxml-validation.md`).

## Related features

Indirectly relevant to every feature — this is the outermost safety net for the whole app. Most directly relevant to `.claude/features/two-way-sync.md` and `.claude/features/scxml-parsing.md`/`.claude/features/auto-layout-elk.md`, since a genuinely malformed document triggering an unexpected exception during conversion/layout is the most plausible real-world trigger for this boundary firing in production.

## Related files

`src/components/ui/error-boundary.tsx`, `src/app/page.tsx`.

## Tests

No dedicated test file for `error-boundary.tsx` was found in this pass — testing a React error boundary requires deliberately throwing from a child component in a test, which adds some setup complexity; this may explain the gap, but it leaves the app's single most important safety-net component unverified by automated tests.

## Known limitations

- **Only one boundary, at the very top of the tree** (as far as confirmed in this pass) — an error deep in, say, the Transition panel crashes the *entire* app (Code editor, diagram, everything), not just that one panel. A more granular boundary strategy (e.g. one around the diagram, one around each side panel) would let an isolated failure in one feature leave the rest of the app usable — verify current scoping before assuming finer-grained boundaries already exist somewhere.
- Full error message and stack trace are shown to **any** user by default (not gated behind a development-only flag) — for a deployed industrial tool, this could expose internal implementation details (file paths, function names) to an end user; verify whether this is an accepted tradeoff (useful for support/bug-reporting in a specialized industrial context) or worth gating behind an environment check.
- `resetError()` doesn't clear whatever bad state caused the error in the first place (e.g. malformed `content` in `useEditorStore`) — if the triggering state persists, clicking "Try again" will likely just immediately re-throw the same error.

## Important edge cases

- An error thrown inside an **event handler** (not during render) is **not** caught by this boundary — React error boundaries only catch errors during rendering, lifecycle methods, and constructors of the tree below them, not in event handlers, async code, or `setTimeout`/`setInterval` callbacks. Given how much of this app's logic runs inside event handlers (every Command invocation from `visual-diagram.tsx`, for instance), a large class of potential runtime errors would **not** be caught by this boundary at all — they'd instead surface as an uncaught exception in the browser console with no user-facing recovery UI whatsoever. This is a significant, easy-to-overlook limitation of the boundary's actual coverage.

## Things that must NOT be changed

- Do not assume this boundary catches command-execution errors or other event-handler-triggered exceptions — per the edge case above, it structurally cannot. Any error handling needed for those paths (e.g. a Command's `execute()` throwing unexpectedly rather than returning `{success: false}`) needs its own try/catch at the call site, not reliance on this boundary.

## Previous design decisions

No plan/spec document specifically addresses error-boundary strategy — its single-boundary-at-the-top placement appears to be the straightforward default choice for a moderately-sized SPA rather than a deliberately-scoped, multi-boundary resilience strategy.
