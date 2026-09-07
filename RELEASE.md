# Release Process

## Steps to Release a New Version

**1. Make sure all changes are committed and pushed to `main`**
```bash
git status   # should be clean
```

**2. Decide the version bump type**
- `patch` — bug fixes (0.1.1 → 0.1.2)
- `minor` — new features (0.1.1 → 0.2.0)
- `major` — breaking changes (0.1.1 → 1.0.0)

**3. Run the release script**
```bash
npm run release -- patch
# replace "patch" with "minor" or "major" as needed
```
This bumps the version in `package.json`/`package-lock.json`, commits with
`chore: bump version to X.Y.Z`, creates the annotated tag `vX.Y.Z`, and pushes
both the commit and the tag to `origin main`. It aborts if the working tree
isn't clean or you're not on `main`.

GitHub Actions will automatically build the app and create a GitHub Release with `scxml-editor-vX.Y.Z.zip` attached.
Check progress at your repo's **Actions** tab (~1 min).

## Changelog

The release body includes a "What's New" section, generated automatically by
`scripts/generate-release-notes.mjs` from the conventional-commit messages
(`feat:`, `fix:`, `refactor:`, etc.) between the previous tag and the new one.
No manual changelog editing is needed — write descriptive commit messages
and the categorized list (New Features / Bug Fixes / Improvements / Breaking
Changes) is built for you on every release.

To preview it locally before releasing:
```bash
node scripts/generate-release-notes.mjs --to HEAD
# or compare two specific tags:
node scripts/generate-release-notes.mjs --from v0.1.2 --to v0.1.3
```
