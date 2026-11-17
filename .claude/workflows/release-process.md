# Workflow: Cutting a Release

## Two builds per release

From v0.4.0, each release ships two builds with the same fixes (full steps in `RELEASE.md`):
- `vX.Y.Z` (without `<parallel>`) is cut from `release/no-parallel`, which never creates a `<parallel>` (no `normalizeContent()` in editor-store).
- `vX.Y.Z-p` (with `<parallel>`) is cut from `main` and published as a GitHub **pre-release**.

Run the release once on each branch with the same version. `package.json` stays a plain `X.Y.Z` on both. Keep `release.ps1` and `.github/workflows/release.yml` identical on both branches, because a tag builds with the workflow file at the tagged commit.

## What actually happens

```bash
npm run release -- patch   # or minor / major / exact X.Y.Z
```

This single command (`release.ps1`) does all of the following. It **aborts if the working tree isn't clean, you're not on `main` or `release/no-parallel`, or the tag already exists**:
1. Bumps `package.json`/`package-lock.json` version.
2. Commits with message `chore: bump version to X.Y.Z` (`X.Y.Z-p` on `main`).
3. Creates an annotated tag: `vX.Y.Z-p` on `main`, `vX.Y.Z` on `release/no-parallel`.
4. Pushes both the commit and the tag to the current branch on `origin`.

Pushing the tag then triggers `.github/workflows/release.yml` (GitHub Actions), which:
1. Checks out full history (`fetch-depth: 0` — needed to diff against the previous tag for the changelog).
2. `npm ci --build-from-source`, then `npm run build` (static export — see `.claude/decisions/architecture.md` #1) with the GitHub App env vars baked in from repo variables (`NEXT_PUBLIC_GITHUB_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_INSTALL_URL`, `NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT`, `NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT` — the endpoint values are the **relative/same-origin** LoopControl-embedded endpoints, per the workflow's own comment, not the local-dev `server/` ones).
3. Zips the static `out/` directory as `scxml-editor-<tag>.zip`, generates a SHA256 checksum.
4. Runs `scripts/generate-release-notes.mjs` to build a categorized "What's New" changelog from **conventional-commit messages** (`feat:`, `fix:`, `refactor:`, etc.) between the previous tag and this one — no manual changelog editing needed, but this means **commit message discipline directly determines release-note quality**.
5. Creates the GitHub Release with the zip + checksum + generated notes attached. A tag containing `-` (i.e. `-p`) is marked as a pre-release.

## Before releasing

- Make sure all changes are committed and pushed to `main`, and `git status` is clean — the release script will refuse to run otherwise.
- Decide the bump type: `patch` (bug fixes), `minor` (new features), `major` (breaking changes) — standard semver, no special convention here beyond that.
- If you want to preview the changelog before tagging: `node scripts/generate-release-notes.mjs --to HEAD` (or `--from vX.Y.Z --to vX.Y.Z` to compare two specific existing tags).

## Things to know

- This is a **static export build** — the release artifact is meant to be served by any static file server (the release notes explicitly suggest `python3 -m http.server` or `npx serve`), not run as a Node app. See `.claude/decisions/architecture.md` #1.
- No test run is part of the release workflow itself (`.github/workflows/release.yml` does not call `npm test`) — running `npm test` and verifying manually before releasing is on you, not enforced by CI at release time.
- Write descriptive, conventional-commit-formatted messages for anything you want to show up meaningfully in a release's changelog — this is the only input to `generate-release-notes.mjs`.
