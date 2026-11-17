# Release Process

## Two builds per release

Starting with v0.4.0, every release ships as two builds with the same fixes:

| Tag        | Build                      | Branch                | GitHub Release |
| ---------- | -------------------------- | --------------------- | -------------- |
| `vX.Y.Z`   | without `<parallel>`       | `release/no-parallel` | Latest         |
| `vX.Y.Z-p` | with `<parallel>`          | `main`                | Pre-release    |

Every fix must land on both branches. Develop on `main`, then
`git cherry-pick -x` the commits onto `release/no-parallel`, leaving out
anything about `<parallel>` or `<final>` states. Keep parallel-specific work in
its own commits so the rest cherry-picks cleanly.

`package.json` holds a plain `X.Y.Z` on both branches. Only the tag carries
the `-p`.

## Steps to Release a New Version

**1. Make sure all changes are committed and pushed on both branches**
```bash
git status   # should be clean
```

**2. Decide the version**
- `patch` — bug fixes (0.1.1 → 0.1.2)
- `minor` — new features (0.1.1 → 0.2.0)
- `major` — breaking changes (0.1.1 → 1.0.0)
- `X.Y.Z` — an exact version. Use this when the two branches are on
  different versions and need to be brought to the same number.

**3. Release the no-parallel build**
```bash
git checkout release/no-parallel
npm run release -- patch    # or minor / major / 0.4.0
```

**4. Release the parallel build, with the same version**
```bash
git checkout main
npm run release -- patch    # same bump or version as step 3
```

Check that both branches ended up on the same version. If they didn't, use an
exact `X.Y.Z` on the second one.

On each branch the script:
- bumps the version in `package.json`/`package-lock.json`;
- commits with `chore: bump version to X.Y.Z` (`X.Y.Z-p` on `main`);
- creates the annotated tag `vX.Y.Z` or `vX.Y.Z-p`;
- pushes the commit and the tag to the current branch on `origin`.

It aborts if:
- the working tree isn't clean;
- you're not on `main` or `release/no-parallel`;
- the tag already exists (the version change is reverted).

For each tag, GitHub Actions builds the app and creates a GitHub Release with
`scxml-editor-<tag>.zip` attached. The `-p` release is marked as a
pre-release, so the no-parallel build stays as "Latest". Check progress in
your repo's **Actions** tab (~1 min per build).

## Changelog

The release body includes a "What's New" section, generated automatically by
`scripts/generate-release-notes.mjs` from the conventional-commit messages
(`feat:`, `fix:`, `refactor:`, etc.) between the previous tag and the new one.
No manual changelog editing is needed. Write descriptive commit messages and
the categorized list (New Features / Bug Fixes / Improvements / Breaking
Changes) is built for you on every release.

Each build's changelog compares against the previous tag on its own branch:
`vX.Y.Z-p` against the last `main` tag, and `vX.Y.Z` against the last
`release/no-parallel` tag. The two branches share no tags after v0.3.5.

To preview it locally before releasing (run on the branch you're releasing):
```bash
node scripts/generate-release-notes.mjs --to HEAD
# or compare two specific tags:
node scripts/generate-release-notes.mjs --from v0.1.2 --to v0.1.3
```
