# scxml-github-auth-server

A small, standalone Express service with a single job: relay the GitHub
**Device Flow** calls (including token refresh) that the editor's browser
code can't make directly, because GitHub's device-flow endpoints don't send
CORS headers.

The editor uses Device Flow instead of the redirect-based Authorization
Code Flow because it's deployed in contexts where a fixed OAuth
`redirect_uri` doesn't work - e.g. embedded per-device inside LoopControl,
where every installation is reached at its own local IP/hostname, and a
classic OAuth App only supports registering a single callback URL. Device
Flow needs no `redirect_uri` at all: the user is shown a short code and
opens `github.com/login/device` (in any browser) to enter it, while the
editor polls in the background until they do.

**This service never handles a client secret.** Device Flow's token-polling
and token-refresh steps don't require one (confirmed against GitHub's own
docs) - this relay exists purely to work around the CORS restriction,
forwarding whatever the browser sends straight to GitHub and returning
GitHub's JSON response verbatim. All the OAuth semantics (interpreting error
codes, polling backoff, refreshing) live entirely in the editor's
browser-side code (`src/lib/github/oauth.ts`).

## 1. Register a GitHub App

A **GitHub App** is used instead of a classic OAuth App specifically so
access can be scoped to the repo(s) a user explicitly grants, rather than
every repo they can reach (OAuth App scopes have no per-repo granularity).

1. Go to [github.com/settings/apps/new](https://github.com/settings/apps/new)
   (or an org's equivalent) and register a new GitHub App.
2. Fill in an application name and homepage URL (your editor's URL). Under
   **Webhook**, uncheck **Active** - this app doesn't need one.
3. Under **Repository permissions**, grant **Contents: Read and write**
   (Metadata: Read-only is included automatically). No other permissions
   are needed.
4. Under **Where can this GitHub App be installed?**, choose "Any account"
   if multiple people/orgs will link repos through this editor, or "Only on
   this account" for single-org internal use.
5. Check **Enable Device Flow** - this must be turned on, or the relay will
   get a `device_flow_disabled` error back from GitHub.
6. Leave **Expire user authorization tokens** checked (the default) - the
   editor refreshes expiring tokens automatically; this is what makes
   GitHub issue a `refresh_token` in the first place.
7. After creating the app, note its **Client ID** (visible on the app's
   settings page - the client secret is not needed anywhere in this setup,
   don't generate one) and its **slug** (from the app's URL,
   `github.com/apps/<slug>`, used to build the install-page link the editor
   shows a user who hasn't installed the app yet).

## 2. Configure environment variables

Copy the example file:

```
cp .env.example .env
```

Edit `.env`:

- `PORT` — port this service listens on (defaults to `4000`).
- `ALLOWED_ORIGIN` — the exact origin (scheme + host + port) of the editor
  frontend that is allowed to call this service, e.g.
  `https://scxml.example.com`. Only this single origin is allowed via CORS.

(There's no client ID or secret to configure here - the Client ID is public
and the editor's frontend sends it directly in each relayed request; see
the root `.env.local.example` / `DEVELOPER_GUIDE.md` for where the frontend
gets it from.)

## 3. Run locally

```
npm install
npm start
```

The service listens on `http://localhost:<PORT>` (default `4000`). Check
`GET /healthz` for a liveness check, and `POST /api/github/device/code` /
`POST /api/github/device/token` for the two relay endpoints used by the
editor.

## Running in production

This is a minimal MVP service: there's no process manager wiring built in
here. In production, run it under a process supervisor so it restarts on
crash/reboot — for example:

```
pm2 start index.js --name scxml-github-auth
```

That's just a suggestion; no `pm2` configuration is included in this repo.

Note: since there's no secret and no registered callback URL involved, this
same GitHub App (and the same running instance of this relay, or a copy of
it) can be reused across as many environments/deployments as you like -
unlike the redirect-based flow this replaced, there's no "one callback URL
per environment" constraint here.
