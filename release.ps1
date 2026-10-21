param(
    [string]$BumpType
)

$ErrorActionPreference = "Stop"

$validTypes = @("patch", "minor", "major")
if (-not $BumpType -or $validTypes -notcontains $BumpType) {
    Write-Host "Usage: npm run release -- <patch|minor|major>" -ForegroundColor Yellow
    exit 1
}

# Working tree must be clean
$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean. Commit or stash your changes before releasing."
    exit 1
}

# Must be on main
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "main") {
    Write-Error "You must be on 'main' to release (currently on '$branch')."
    exit 1
}

# Bump version in package.json / package-lock.json
npm version $BumpType --no-git-tag-version
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm version failed."
    exit 1
}

$version = (Get-Content package.json | ConvertFrom-Json).version
$tag = "v$version"

# Commit the bump
git add package.json package-lock.json
git commit -m "chore: bump version to $version"

# Tag the release
git tag -a $tag -m "Release $tag"

# Push the commit and the tag
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "git push origin main failed."
    exit 1
}

git push origin $tag
if ($LASTEXITCODE -ne 0) {
    Write-Error "git push origin $tag failed."
    exit 1
}

Write-Host ""
Write-Host "Version bumped to $version, tagged as $tag, and pushed to origin." -ForegroundColor Green
Write-Host "GitHub Actions will build the app and create a GitHub Release with scxml-editor-$tag.zip attached."
Write-Host ""
