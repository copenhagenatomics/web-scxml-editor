# Workflow: Running GitHub Integration Locally

The GitHub push/pull feature (`.claude/features/github-integration.md`) needs a same-origin relay service for the OAuth Device Flow (GitHub's device endpoints send no CORS headers — see `.claude/decisions/integrations.md` #1). For local development, that's the standalone Express app in `server/`.

## Steps

1. **Register a GitHub OAuth App with Device Flow enabled.** Follow `server/README.md` for the exact steps (App creation, enabling Device Flow, obtaining the Client ID — no client secret is ever needed for this flow).
2. **Configure the editor's environment.** Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_GITHUB_CLIENT_ID` — the OAuth App's Client ID (safe to expose in the browser bundle, not a secret).
   - `NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT=http://localhost:4000/api/github/device/code`
   - `NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT=http://localhost:4000/api/github/device/token`
3. **Configure the relay's environment.** The relay needs `ALLOWED_ORIGIN` set (it refuses to start without it when run standalone) — matching wherever your local Next.js dev server runs (typically `http://localhost:3000`).
4. **Run both processes side by side**, in two terminals:
   ```bash
   # Terminal 1 — the relay
   cd server
   npm install
   npm start

   # Terminal 2 — the editor, from the repo root
   npm run dev
   ```
5. **Test the flow**: open the GitHub panel, click Connect, and complete the device code prompt at `github.com/login/device` in any browser tab.

## If GitHub integration seems broken locally

- **"Failed to start sign-in" or similar immediately on Connect**: check that all three `NEXT_PUBLIC_GITHUB_*` env vars are actually set in `.env.local` and that you restarted `npm run dev` after adding them (Next.js only reads `.env.local` at server start).
- **Network errors reaching the relay**: confirm `server/` is actually running on port 4000 and that `ALLOWED_ORIGIN` matches your dev server's actual origin exactly (including protocol and port) — a CORS mismatch here will manifest as an opaque browser-side network error, not a clear message.
- **Do not attempt to skip the relay and call GitHub's device endpoints directly from the browser** — this cannot work; GitHub's device-flow endpoints don't send CORS headers, so the browser will block the request regardless of how correctly everything else is configured.
- For the relay's own test suite: see `server/test/*` and `server/README.md` — these run independently of the root `npm test` (see `.claude/workflows/running-and-writing-tests.md`).

## Production/embedded deployment note

A LoopControl-embedded deployment does **not** use the standalone `server/` — it points the two `NEXT_PUBLIC_GITHUB_DEVICE_*_ENDPOINT` env vars (baked in at build time, per `.claude/workflows/release-process.md`) at LoopControl's own equivalent same-origin relay endpoints instead. Don't assume `server/` needs to be deployed alongside every LoopControl installation — it's a local-dev convenience matching the same relay contract LoopControl implements natively.
