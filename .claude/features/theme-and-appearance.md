# Feature: Theme (Light/Dark Mode)

## Purpose

Let the app match the user's system preference or explicit choice for light vs. dark appearance, persisted across sessions, without a flash of the wrong theme while the page loads.

## User behavior

- On first visit, the app matches the OS/browser's `prefers-color-scheme` setting.
- Clicking the theme toggle (moon/sun icon in the toolbar) switches between light and dark immediately.
- The choice persists across reloads (via `localStorage`), overriding the system preference from then on until toggled again.

## UI behavior

- No "system" third option — it's a strict light/dark toggle; system preference is only consulted as the *initial* default when no explicit choice has been stored yet.
- The toggle icon shows the icon for the mode you'd switch **to** (sun while in dark mode, moon while in light mode), not the current mode.

## Internal architecture

- **Storage/detection**: `src/lib/theme/theme.ts` — `getInitialTheme()` reads `localStorage.getItem('theme')`, falling back to `window.matchMedia('(prefers-color-scheme: dark)')` if nothing stored. `applyTheme(theme)` toggles a `dark` class on `document.documentElement` and writes the choice back to `localStorage` (wrapped in a try/catch — silently ignores storage failures, e.g. in a private-browsing mode that blocks `localStorage`).
- **Flash-of-wrong-theme prevention**: `src/app/layout.tsx` inlines a **synchronous blocking `<script>`** (via `dangerouslySetInnerHTML`) that runs *before* React hydrates, reading `localStorage`/`matchMedia` and adding the `dark` class to `<html>` immediately if needed — this is why the theme appears correct even on the very first paint, before any React component (including `ThemeToggle`) has mounted. `<html suppressHydrationWarning>` is set specifically because this script mutates the DOM before React's hydration check would otherwise flag a client/server mismatch.
- **Live tracking**: `src/lib/theme/use-is-dark.ts` (`useIsDark()`) doesn't read a store — it observes the `.dark` class on `<html>` directly via a `MutationObserver`, returning `false` during SSR/first-paint-before-effect and syncing afterward. This is the mechanism other components use to reactively adapt to theme changes without needing `ThemeToggle` to broadcast anything through a store.
- **Toggle component**: `src/components/ui/theme-toggle.tsx` keeps its **own local `useState<Theme>`** (seeded by reading the DOM class directly, same technique as `useIsDark`) rather than reading from `useIsDark()` or a shared store — meaning the toggle button and any other `useIsDark()` consumer are two independently-synced observers of the same underlying DOM class, not one shared reactive source.
- Actual color values are defined via CSS custom properties (Tailwind v4 + `dark:` variant classes, referenced throughout components as `bg-elevated`, `text-muted`, `border-default`, etc. — semantic Tailwind utility names, not raw colors) — this document does not enumerate the full palette; see `src/app/globals.css` if exact color values are needed for a specific change.

## Relevant components

`src/components/ui/theme-toggle.tsx`, `src/app/layout.tsx` (the blocking script).

## Relevant state/store

**No Zustand store** — theme state lives in `localStorage` + a DOM class (`document.documentElement.classList`), read independently by each consumer (`ThemeToggle`'s local state, `useIsDark()`'s `MutationObserver`). This is a deliberate departure from this app's usual Zustand-store pattern (see `.claude/project/architecture.md` §7), presumably because theme needs to be readable synchronously before React even mounts (the blocking script), which a Zustand store cannot provide.

## Relevant utilities

`src/lib/theme/theme.ts`, `src/lib/theme/use-is-dark.ts`.

## SCXML behavior

None — theme is pure UI presentation, never touches the SCXML document.

## Validation rules

None.

## Related features

- Every panel/component that needs to render theme-aware content (e.g. Monaco's fixed `vs-dark` — see `.claude/features/monaco-code-editor.md`'s note that the code editor does **not** actually follow this app-wide theme, a confirmed inconsistency) should be cross-checked against this feature when auditing "does X respect the theme."

## Related files

`src/lib/theme/theme.ts`, `src/lib/theme/use-is-dark.ts`, `src/components/ui/theme-toggle.tsx`, `src/app/layout.tsx`.

## Tests

No dedicated test file for theme logic was found in this pass — `localStorage`/`matchMedia`/`MutationObserver`-based logic is plausible but non-trivial to unit test in jsdom; this appears to be entirely manually-verified functionality.

## Known limitations

- **Confirmed inconsistency**: the Monaco code editor (`xml-editor.tsx`) hardcodes `'vs-dark'` regardless of this app-wide theme setting (see `.claude/features/monaco-code-editor.md`) — a user in light mode still sees a dark code editor, a real, verified UI inconsistency.
- No "follow system" option once a user has made an explicit choice — there's no way to return to "always match OS setting" short of manually clearing the `theme` key from `localStorage`.
- Two independent DOM-class observers (`ThemeToggle`'s local state and `useIsDark()`'s `MutationObserver`) rather than one shared reactive source — functionally fine (both react to the same underlying class correctly) but a small amount of duplicated "watch the DOM" logic that a shared store could have consolidated.

## Important edge cases

- `applyTheme`'s `localStorage.setItem` failure (private browsing mode blocking storage) is silently swallowed — the theme still applies visually for the current page load (the DOM class is still toggled), it just won't persist to the next reload, with no user-visible indication that persistence failed.
- The blocking inline script in `layout.tsx` and `theme.ts`'s `getInitialTheme()`/`applyTheme()` implement **the same localStorage/matchMedia logic twice**, once as a string literal inside `dangerouslySetInnerHTML` and once as real TypeScript — these two implementations must be kept in sync manually; a change to the fallback logic in one without the other would cause a real (if subtle) flash-of-wrong-theme regression on next load.

## Things that must NOT be changed

- Do not remove the blocking inline script in `layout.tsx` in favor of "just use the React theme hook" — the entire point of the inline script is to run before hydration; moving theme detection into a `useEffect` alone would reintroduce a flash-of-wrong-theme on every load, which is exactly what this pattern exists to prevent.
- Do not remove `suppressHydrationWarning` from the `<html>` tag without also removing the theme-mutating inline script — the two exist together as one mechanism (the script's pre-hydration DOM mutation is exactly what would otherwise trigger React's hydration mismatch warning).
- If you change the fallback/detection logic in `theme.ts`, mirror the identical change in the inline script string in `layout.tsx` (and vice versa) — they must stay in sync by hand, there's no shared build-time code generation between them.

## Previous design decisions

The choice to use `localStorage` + a DOM class + a blocking inline script (rather than this app's usual Zustand-store pattern) is a pragmatic, common technique for avoiding theme-flash in SSR/static-export React apps — no dedicated plan/spec document addresses it, but the implementation is a well-known, deliberate pattern (not an accidental deviation from the app's normal state-management convention).
