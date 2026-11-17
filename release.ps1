param(
    [string]$BumpType
)

$ErrorActionPreference = "Stop"

# Accepts a bump type, or an exact X.Y.Z so both release lines can be set to
# the same version (e.g. `npm run release -- 0.4.0` on each branch).
$validTypes = @("patch", "minor", "major")
if (-not $BumpType -or ($validTypes -notcontains $BumpType -and $BumpType -notmatch '^\d+\.\d+\.\d+$')) {
    Write-Host "Usage: npm run release -- <patch|minor|major|X.Y.Z>" -ForegroundColor Yellow
    exit 1
}

# Working tree must be clean
$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean. Commit or stash your changes before releasing."
    exit 1
}

# The branch decides which build is released:
#   main                -> vX.Y.Z-p  (with <parallel>, published as a pre-release)
#   release/no-parallel -> vX.Y.Z    (without <parallel>)
# package.json keeps a plain X.Y.Z on both; only the tag carries "-p".
$branch = git rev-parse --abbrev-ref HEAD
switch ($branch) {
    "main"                { $suffix = "-p" }
    "release/no-parallel" { $suffix = "" }
    default {
        Write-Error "Release from 'main' (vX.Y.Z-p) or 'release/no-parallel' (vX.Y.Z), not '$branch'."
        exit 1
    }
}

# Bump version in package.json / package-lock.json
npm version $BumpType --no-git-tag-version
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm version failed."
    exit 1
}

$version = (Get-Content package.json | ConvertFrom-Json).version
$tag = "v$version$suffix"

# Refuse to reuse a tag that already exists
git rev-parse -q --verify "refs/tags/$tag" | Out-Null
if ($LASTEXITCODE -eq 0) {
    git checkout -- package.json package-lock.json
    Write-Error "Tag $tag already exists. Version change reverted."
    exit 1
}

# Commit the bump
git add package.json package-lock.json
git commit -m "chore: bump version to $version$suffix"

# Tag the release
git tag -a $tag -m "Release $tag"

# Push the commit and the tag
git push origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Error "git push origin $branch failed."
    exit 1
}

git push origin $tag
if ($LASTEXITCODE -ne 0) {
    Write-Error "git push origin $tag failed."
    exit 1
}

Write-Host ""
Write-Host "Version bumped to $version, tagged as $tag on $branch, and pushed to origin." -ForegroundColor Green
Write-Host "GitHub Actions will build the app and create a GitHub Release with scxml-editor-$tag.zip attached."
Write-Host ""
