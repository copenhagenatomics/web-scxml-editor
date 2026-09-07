# External Integration Decisions

Covers GitHub and the LoopControl host-embedding relationship.

---

## 1. GitHub integration uses Device Flow, not Authorization Code Flow

### Context
Each deployed instance of this editor runs on its own physical device (a LoopControl installation), reachable only at its own local IP/hostname, with no shared, fixed public origin.

### Decision
GitHub integration uses **Device Flow** — the user enters a short code at `github.com/login/device` in any browser, while the app polls in the background — rather than a redirect-based Authorization Code Flow. This holds regardless of OAuth App vs GitHub App (see decision #5) — both support Device Flow identically.

### Reason
Explicitly documented, in unusual depth for this codebase: inline comments in `src/lib/github/oauth.ts` and `DEVELOPER_GUIDE.md`'s "GitHub Integration" section both explain that a redirect-based flow only supports one (or a small fixed set of) registered `redirect_uri`, which doesn't work across a fleet of independently-addressed devices, and that Device Flow needs neither a redirect URI nor a client secret (confirmed against GitHub's own documentation).

### Constraints
Requires a same-origin relay service for the device-flow POST calls (code request, token poll, and token refresh — see decision #5), since GitHub's device endpoints don't send CORS headers — either the local `server/` (development) or LoopControl's own equivalent endpoint (production).

### Alternatives
Authorization Code Flow is the explicitly-named, explicitly-rejected alternative — rejected specifically because of the redirect-URI/fixed-origin requirement.

### Evidence
`src/lib/github/oauth.ts` (inline rationale comments), `DEVELOPER_GUIDE.md` §"GitHub Integration", `server/README.md`.

### Status
Accepted.

---

## 5. GitHub integration migrated from an OAuth App to a GitHub App, for per-repo access scoping

### Context
The original integration (decision #1) used a classic OAuth App with scope `repo` — which grants access to every repository the signed-in user can reach, with no way to narrow it. The user asked for access restricted to specific repo(s) only.

### Decision
Switched to a **GitHub App**, installed by the user on exactly the account/repos they choose via a one-time "Install" step on GitHub's own site, in place of the OAuth App. Also opted into GitHub's recommended **expiring user tokens** (8h access token + 6-month refresh token) rather than a non-expiring token, adding a silent-refresh layer (`getValidAccessToken()` in `src/lib/github/token.ts`) that every direct GitHub REST call now goes through instead of reading `accessToken` off the store directly.

### Reason
OAuth App scopes have no per-repo granularity — `repo` is all-or-nothing across every repo the user can access. A GitHub App is the only mechanism GitHub offers where the *user*, not a coarse scope string, decides which repositories a token can reach, enforced by GitHub itself (not just convention).

### Constraints
- Repo listing can no longer use `GET /user/repos` (confirmed against GitHub's docs: it does not reliably reflect GitHub App installation scoping) — it goes through `GET /user/installations` → `GET /user/installations/{id}/repositories` instead (`listInstalledRepos` in `src/lib/github/api.ts`).
- A connected user who hasn't installed the app anywhere (or granted zero repos) needs a distinct UI state — `GithubPanel` shows an "Install on GitHub" prompt (linking to `NEXT_PUBLIC_GITHUB_INSTALL_URL`) instead of the repo picker in that case.
- Expiring tokens require refresh-token handling end to end: new persisted fields on `useGithubStore` (`refreshToken`, `tokenExpiresAt`, `refreshTokenExpiresAt`), a `refreshAccessToken()` function in `oauth.ts`, and the `getValidAccessToken()` choke point. The relay server itself (`server/`) needed **no changes** — a token refresh posts to the exact same `github.com/login/oauth/access_token` URL the existing `/api/github/device/token` route already forwards to, just with a different `grant_type`.

### Alternatives
- Narrowing the OAuth App's `scope` string (e.g. to `public_repo`) — rejected, since OAuth scopes still have no per-repo dimension; it would only narrow *which kinds* of repos, not *which specific one(s)*.
- Non-expiring GitHub App tokens (uncheck "Expire user authorization tokens") — considered as the simpler option (no refresh logic needed, closer to the old OAuth App's behavior), but not chosen: the user opted for GitHub's recommended expiring-token configuration despite the added code.

### Evidence
`src/lib/github/oauth.ts` (`refreshAccessToken`), `src/lib/github/token.ts`, `src/lib/github/api.ts` (`listInstalledRepos`), `src/stores/github-store.ts`, `src/components/ui/github-panel.tsx` (install-prompt state), `server/README.md` §1.

### Status
Accepted.

## 2. A pre-ready command queue (`_q`) lets the host call the API before React mounts

### Context
A host embedding this editor as an iframe might run its own initialization script before this app's React tree has mounted, and needs to call `window.ScxmlEditorAPI` methods immediately without race conditions.

### Decision
`window.ScxmlEditorAPI` is pre-declared by an inline stub script in `src/app/layout.tsx` (running before hydration), which queues any calls made before the real API is ready (`_q: {ready, commands, feedback, channels, hostErrors}`). Once React mounts and the real API is constructed, `use-host-api-bridge.ts` upgrades the stub object **in place** (`Object.assign`) and flushes the queue, rather than replacing `window.ScxmlEditorAPI` with a new object.

### Reason
Not documented in one dedicated note, but the in-place upgrade (rather than reassignment) is clearly deliberate: it means any reference the host already captured early (e.g. `var api = iframe.contentWindow.ScxmlEditorAPI` grabbed immediately on iframe load) automatically gains the real methods without the host needing to re-read the property later.

### Constraints
The inline stub only pre-declares a **subset** of the full API surface (`onReady`, `registerCommand`, `showFeedback`, `setChannels`, `showErrors`, `clearErrors`, `loadScxml`, `getScxml`, `toggleConfigPanel`, `setActiveTab`) — calling an unstubbed method (e.g. `setEvents`, `getChannelMappings`) before React mounts would throw, not queue. Extending the real API without also extending this stub creates exactly this gap.

### Alternatives
None found evidenced (e.g. requiring the host to always wait for `onReady` before calling anything was not the chosen approach — the whole point of the stub is to make *some* calls safe even before that).

### Evidence
`src/app/layout.tsx` (inline stub script), `src/app/_hooks/use-host-api-bridge.ts` (`Object.assign(stub, realApi)`).

### Status
Accepted (with the confirmed partial-stub-surface gap as a known limitation, not a deliberate scoping choice — no comment explains why those specific methods were excluded from the stub).

---

## 3. Embedding detection is deferred to a `useEffect`, never checked during render

### Context
The statically-exported HTML is built with no `window` object present; checking `window.self !== window.top` during render would bake `isEmbedded = false` into the static markup.

### Decision
`use-initial-load.ts` always starts in a loading state and only checks embedding status inside a `useEffect`, which runs exclusively client-side after mount.

### Reason
Explicitly reasoned in the hook's own comment: an early check "would... caus[e] a Welcome-screen flash before hydration corrects it." The existence of `docs/superpowers/plans/2026-05-21-loopcontrol-init-behavior.md` (a dedicated fix-plan) is strong evidence this flash was a **real, previously-observed bug** that this deferred-check pattern was built specifically to fix, not a preemptive design.

### Constraints
Any future embedding-detection logic must follow this same deferred-to-effect pattern, or risk reintroducing the flash bug.

### Alternatives
Checking during render (the simpler, naive approach) is the implicitly-tried-and-fixed prior behavior, evidenced by the existence of a dedicated remediation plan document.

### Evidence
`src/app/_hooks/use-initial-load.ts` (comment), `docs/superpowers/plans/2026-05-21-loopcontrol-init-behavior.md`.

### Status
Accepted (current); the render-time-check behavior is Superseded (fixed as a bug).

---

## 4. Channel Mappings and User Actions/Events are host-side-only data; Config values are persisted into the SCXML document

### Context
Three different host-bridge features (Config, Channel Mapping, Events/User Actions) each involve data shared between this editor and the embedding host, but that data has different natural "ownership."

### Decision
Config values (`conf_` fields) are persisted **inside** the SCXML document itself (as `<data>` elements) and merely *reconciled* against host overrides. Channel Mappings and Events/User Actions are **not** written into the SCXML at all — they exist purely as host-pushed/host-synced state in `useHostAPIStore`, with no representation in the `.scxml` file.

### Reason
Not documented as a single explicit rule, but the differentiation makes sense given each concept's nature: a config *value* (with a default) is meaningfully part of the state machine's own data model and belongs in the portable SCXML artifact; a channel *mapping* or an operator-facing *button definition* is fundamentally about how a specific deployment's physical/UI environment relates to the document, not something intrinsic to the state machine's own logic — and so is treated as deployment-specific metadata that travels with the *host*, not the file.

### Constraints
A future feature must decide deliberately which category new host-bridge data falls into — SCXML-persisted (travels with the file) or host-side-only (travels with the deployment) — since this precedent establishes both patterns exist and are each individually appropriate for different kinds of data.

### Alternatives
Persisting all three kinds of data into the SCXML document uniformly (e.g., a hypothetical `<viz:channel-mapping>` element mirroring the sticky-note pattern) is the implicit alternative not chosen for Channel Mappings/Events.

### Evidence
`src/lib/utils/datamodel-extractor.ts` (Config, SCXML-persisted), `src/stores/host-api-store.ts` (`channelMappings`, `events` — host-store-only, no SCXML read/write path for either).

### Status
Accepted.
