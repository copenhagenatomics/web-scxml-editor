# Workflow: Cutting a Release

## What actually happens

```bash
npm run release -- patch   # or minor / major
```

This single command (`release.ps1`) does all of the following, and **aborts if the working tree isn't clean or you're not on `main`**:
1. Bumps `package.json`/`package-lock.json` version.
2. Commits with message `chore: bump version to X.Y.Z`.
3. Creates an annotated tag `vX.Y.Z`.
4. Pushes both the commit and the tag to `origin main`.

Pushing the `vX.Y.Z` tag then triggers `.github/workflows/release.yml` (GitHub Actions), which:
1. Checks out full history (`fetch-depth: 0` — needed to diff against the previous tag for the changelog).
2. `npm ci --build-from-source`, then `npm run build` (static export — see `.claude/decisions/architecture.md` #1) with the GitHub OAuth env vars baked in from repo variables (`NEXT_PUBLIC_GITHUB_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT`, `NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT` — these are the **relative/same-origin** LoopControl-embedded endpoints, per the workflow's own comment, not the local-dev `server/` ones).
3. Zips the static `out/` directory as `scxml-editor-vX.Y.Z.zip`, generates a SHA256 checksum.
4. Runs `scripts/generate-release-notes.mjs` to build a categorized "What's New" changelog from **conventional-commit messages** (`feat:`, `fix:`, `refactor:`, etc.) between the previous tag and this one — no manual changelog editing needed, but this means **commit message discipline directly determines release-note quality**.
5. Creates the GitHub Release with the zip + checksum + generated notes attached.

## Before releasing

- Make sure all changes are committed and pushed to `main`, and `git status` is clean — the release script will refuse to run otherwise.
- Decide the bump type: `patch` (bug fixes), `minor` (new features), `major` (breaking changes) — standard semver, no special convention here beyond that.
- If you want to preview the changelog before tagging: `node scripts/generate-release-notes.mjs --to HEAD` (or `--from vX.Y.Z --to vX.Y.Z` to compare two specific existing tags).

## Things to know

- This is a **static export build** — the release artifact is meant to be served by any static file server (the release notes explicitly suggest `python3 -m http.server` or `npx serve`), not run as a Node app. See `.claude/decisions/architecture.md` #1.
- No test run is part of the release workflow itself (`.github/workflows/release.yml` does not call `npm test`) — running `npm test` and verifying manually before releasing is on you, not enforced by CI at release time.
- Write descriptive, conventional-commit-formatted messages for anything you want to show up meaningfully in a release's changelog — this is the only input to `generate-release-notes.mjs`.
