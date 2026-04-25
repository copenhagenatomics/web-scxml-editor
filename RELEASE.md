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

**3. Bump the version in `package.json`**
```bash
npm version patch --no-git-tag-version
# replace "patch" with "minor" or "major" as needed
```

**4. Commit the version bump**
```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.1.2"
```

**5. Create a git tag**
```bash
git tag -a v0.1.2 -m "Release v0.1.2"
```

**6. Push the commit and the tag**
```bash
git push origin main
git push origin v0.1.2
```

GitHub Actions will automatically build the app and create a GitHub Release with `scxml-editor-v0.1.2.zip` attached.
Check progress at your repo's **Actions** tab (~1 min).
