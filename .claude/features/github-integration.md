# Feature: GitHub Integration (OAuth Device Flow, Push/Pull)

## Purpose

Let a user connect a GitHub account, link one specific file in one repo/branch to the currently-open document, and push/pull that single file — without requiring a backend server tied to this app's own hosting (since this app is a static export that can be deployed per-device with no fixed origin — see `.claude/project/architecture.md`).

## User behavior

- **Connect**: click "Connect to GitHub" → shown a short device code + a link to `github.com/login/device` → user enters the code in any browser (even on another device) → the app polls in the background until authorized.
- **Link**: pick a repo (dropdown, user's own repos), pick a branch (auto-selects the repo's default branch), type/pick a file path — the app checks in the background whether that path already exists.
- **Push**: writes the current document's content to the linked file/branch, using the last-known blob sha for optimistic-concurrency (if someone else pushed since your last sync, this fails with a clear "pull first" message rather than silently overwriting).
- **Pull**: fetches the linked file's current GitHub content and **replaces** the local document — gated behind an explicit confirmation step warning that unsaved local changes will be discarded.
- **Disconnect** (from a linked repo) keeps the GitHub auth but drops the link; there's a separate, implicit "sign out" that happens automatically on a 401 (auth clearing also clears the link).

## UI behavior

Strictly phase-gated (`github-panel.tsx`): **not connected** → **connected, not linked** → **linked**. Linking is blocked (`canLink`) until the path-existence check for the *current* repo/branch/path combination has actually completed — not just when all three fields are non-empty — to avoid linking with a stale/unknown sha.

## Internal architecture

### OAuth Device Flow (`src/lib/github/oauth.ts`)
Chosen specifically because this app is deployed per-device (each LoopControl installation reachable at its own local IP/hostname) — a classic Authorization Code flow needs one fixed `redirect_uri`, which doesn't work across a fleet of independently-addressed devices. Device Flow needs **no redirect URI and no client secret** (confirmed against GitHub's own docs — this app never holds a secret).
- `requestDeviceCode()` → POSTs to a **same-origin relay endpoint**, not `github.com` directly (GitHub's device endpoints send no CORS headers, so the browser can't call them directly).
- `pollForDeviceToken()` → loops sleep→POST→inspect: `authorization_pending` (keep polling), `slow_down` (add 5s to interval per GitHub's documented backoff), `expired_token`/`access_denied`/`device_flow_disabled` (typed `GithubOAuthError` with a `reason` field), `access_token` (done). An `AbortController` lets the user cancel mid-poll.

### The relay server (`server/`)
A minimal standalone Express app (separate `package.json`, not part of the Next.js build) whose **only** job is forwarding the two device-flow POST calls to GitHub and returning GitHub's response verbatim — CORS-locked to one configured `ALLOWED_ORIGIN`. It never sees or needs a client secret. For local dev, run it separately (`cd server && npm install && npm start`, port 4000); a LoopControl-embedded deployment instead points at LoopControl's own equivalent same-origin relay endpoints (see `.claude/workflows/local-github-integration-setup.md`).

### REST API (`src/lib/github/api.ts`)
Ordinary `https://api.github.com` calls (these **do** send CORS headers, no relay needed) — `getAuthenticatedUser`, `listUserRepos` (first 100 repos only, documented MVP limitation), `listBranches`, `getFileContent` (returns `null`, not a throw, on 404 — lets the UI offer "file doesn't exist yet" rather than erroring), `createOrUpdateFile` (sha omitted = create, present = update; a 409 means someone else changed the file since — surfaced as a distinct, friendlier message by the panel).

### State (`src/stores/github-store.ts`)
Zustand + `persist` (localStorage). **Persisted**: `accessToken`, `user`, `linkedRepo` (`{owner, repo, branch, path, lastKnownSha}` — `lastKnownSha: null` means "doesn't exist yet, push will create"). **Not persisted** (reset every load): `isConnecting`, `isSyncing`, `error`, `deviceCode` — deliberately, so a stale `isSyncing: true` can never survive a page reload.

## Relevant components

`src/components/ui/github-panel.tsx` (all three phases, including the push/pull/disconnect logic — there is **no separate `use-github-push` hook**; push is implemented inline in this component, unlike connect/pull which do have dedicated hooks).

## Relevant state/store

`useGithubStore` (as above).

## Relevant utilities

`src/lib/github/oauth.ts`, `api.ts`, `commit-message.ts` (`generateDefaultCommitMessage` — deliberately no timestamp, since git already records commit time), `types.ts`.

## Relevant hooks

`src/app/_hooks/use-github-connect.ts` (`connect()`/`cancel()`), `src/app/_hooks/use-github-pull.ts` (`pull()` — applies the **same** load-time normalization as file upload: `annotateLegacyConfTypes` → `mergeDuplicateTransitionsByEventInDocument` → `mergeDuplicateTransitionsInDocument`, then re-initializes history and navigates to root).

## SCXML behavior

Pull applies the full normalization pipeline (same as `file-import-export.md`'s upload path) before setting the pulled content as the new document. **The stored `lastKnownSha` is for the raw, un-normalized GitHub content**, not the locally-displayed normalized version — this is what a future push's conflict check diffs against, and is a deliberate (if subtle) choice: the push conflict check cares about "did the file on GitHub change," which is independent of what normalization this editor applies locally for display/editing.

## Validation rules

None specific — push/pull content goes through the same validation pipeline as any other content once loaded/before being pushed as-is (no pre-push validation gate currently blocks pushing an invalid document).

## Related features

- `file-import-export.md` — pull is a third content-load entry point, sharing the same normalization sequence as upload.
- `undo-redo-history.md` — pull calls `historyManager.initialize(...)`, resetting history rather than appending to it (same as any fresh load).

## Related files

`src/lib/github/*`, `src/stores/github-store.ts`, `src/app/_hooks/use-github-connect.ts`, `use-github-pull.ts`, `src/components/ui/github-panel.tsx`, `server/*`.

## Tests

`src/lib/github/api.test.ts`, `oauth.test.ts`, `commit-message.test.ts`, `src/stores/github-store.test.ts`, `src/app/_hooks/use-github-connect.test.ts`, `use-github-pull.test.ts`, `src/components/ui/github-panel.test.tsx`, plus `server/test/*` for the relay itself.

## Known limitations

- `listUserRepos` only fetches the first 100 repositories (one page) — a user/org with more repos than that cannot select one beyond the first page in the repo picker. Documented as a known MVP limitation in code comments.
- Single-file, single-repo/branch/path linking only — no multi-file sync, no working with more than one linked file at a time.
- No pre-push validation gate — a document with active errors can still be pushed to GitHub.
- Push logic lives inline in `github-panel.tsx` rather than in a dedicated hook (asymmetric with connect/pull, which do have hooks) — a minor architectural inconsistency worth normalizing if this component grows further.

## Important edge cases

- A 401 from **any** of the panel's direct API calls (repos, branches, path-check, push) triggers `clearAuth()`, which also clears `linkedRepo` — a user whose token expires mid-session loses their link, not just their auth, and must relink after reconnecting.
- The path-existence check uses an incrementing counter ref (`pathCheckIdRef`) to discard stale in-flight responses from a superseded repo/branch/path combination — without this, rapidly changing the path field could show a stale "file doesn't exist" result for a path the user has since changed away from.
- Pushing with `linkedRepo.lastKnownSha` still set to an outdated value (because the file changed on GitHub without going through this app's pull) is exactly the 409 conflict case — the fix is always "pull first," there is no auto-merge.

## Things that must NOT be changed

- Do not remove the `server/` relay or attempt to call GitHub's device-flow endpoints directly from the browser — they don't send CORS headers; this will simply fail silently/with an opaque network error in the browser, not a GitHub-side rejection.
- Do not persist `isConnecting`/`isSyncing`/`deviceCode` — they're excluded from `persist` deliberately to avoid a stuck-`true` state surviving a reload.
- Do not change `lastKnownSha` to track the *normalized* (locally displayed) content's hash instead of GitHub's actual raw content — this would break the optimistic-concurrency check's whole purpose.

## Previous design decisions

`.claude/decisions/integrations.md` #1 (and the extensive inline comments in `oauth.ts`/`DEVELOPER_GUIDE.md`'s GitHub section) document the Device-Flow-over-Authorization-Code choice explicitly and thoroughly — this is one of the best-documented architectural decisions in the whole codebase, directly traceable to the per-device/no-fixed-origin deployment model described in `.claude/project/overview.md`.
