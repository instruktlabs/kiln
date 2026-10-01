<#
.SYNOPSIS
  Deploy the reviewed local build of the Kiln site (site/dist) to Cloudflare Pages by direct upload. Run after release authorization.

.DESCRIPTION
  Hosting decision S-4 (site-build/DECISIONS.md): the site is a direct upload of the build that was reviewed on this PC,
  so the deployed bytes are the reviewed bytes. This script checks that dist/ is that build, prints what it is about to
  upload, and runs

    wrangler pages deploy <dist> --project-name <name> --branch production --commit-hash <HEAD> --commit-dirty=false

  It refuses when dist/index.html is missing, when dist/build-info.json (written by the build's last step,
  site/scripts/build-info.mjs) is missing or names another commit, when the build was made from a tree with
  uncommitted changes, or when the site checkout has uncommitted or untracked changes now. It uses the wrangler that
  is installed and installs nothing. It never logs in, creates a project, uploads to R2 or changes DNS: those are the
  owner's one-time steps in site/DEPLOYMENT.md.

.PARAMETER Site
  The site directory (defaults to this repository's site directory).

.PARAMETER ProjectName
  The Cloudflare Pages project, created once by the owner with `production` as its production branch.

.PARAMETER Wrangler
  wrangler to run. Defaults to `wrangler` on PATH, then Bun's global bin (~/.bun/bin/wrangler.exe).

.PARAMETER AllowPacksOff
  Deploy a build made with KILN_SITE_PACKS=0 (the pre-upload build without Commons downloads). Without this switch
  only a launch-mode build (KILN_SITE_PACKS=1) is deployed.

.PARAMETER DryRun
  Run every check, print the command, then exit without deploying.

.EXAMPLE
  pwsh -NoProfile -File site/scripts/deploy.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Site = (Join-Path $PSScriptRoot '..'),
  [string]$ProjectName = 'kilnstudio',
  [string]$Wrangler,
  [switch]$AllowPacksOff,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Site = (Resolve-Path -LiteralPath $Site).Path
$dist = Join-Path $Site 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) {
  throw "No production build at $dist (index.html is missing). Build the site first; this script does not build."
}

# wrangler: -Wrangler, else PATH, else Bun's global bin. Only its version is read here.
if (-not $Wrangler) {
  $onPath = Get-Command wrangler -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $Wrangler = if ($onPath) { $onPath.Source } else { Join-Path $HOME '.bun\bin\wrangler.exe' }
}
if (-not (Test-Path -LiteralPath $Wrangler)) {
  throw "wrangler was not found (tried $Wrangler). Install it yourself or pass -Wrangler; this script installs nothing."
}
$wranglerVersion = ((& $Wrangler --version 2>$null) | Where-Object { $_ -match '\d+\.\d+' } | Select-Object -First 1)
if (-not $wranglerVersion) { throw "$Wrangler --version printed no version." }

# The checkout: clean, including untracked files (an untracked source file could have been built into dist/).
$head = (& git -C $Site rev-parse HEAD).Trim()
$short = (& git -C $Site rev-parse --short HEAD).Trim()
$status = @(& git -C $Site status --porcelain)
if ($status.Count) {
  throw "The site checkout has uncommitted or untracked changes ($($status.Count) entries; first: $($status[0].Trim())). Commit or remove them, rebuild, review, then deploy."
}

# The build: made from this commit, from a clean tree.
$infoFile = Join-Path $dist 'build-info.json'
if (-not (Test-Path -LiteralPath $infoFile)) {
  throw "dist/ has no build-info.json, so it cannot be tied to a commit. Rebuild with the site's build script."
}
$info = Get-Content -LiteralPath $infoFile -Raw | ConvertFrom-Json
if ($info.commit -ne $short) {
  throw "dist/ was built from commit $($info.commit), but the checkout is at $short. Rebuild and review this commit first."
}
if ($info.treeClean -ne $true) {
  throw "dist/ was built from a tree with uncommitted changes (build-info.json treeClean: $($info.treeClean)). Rebuild from the clean commit."
}
if ($info.kilnSitePacks -ne '1' -and -not $AllowPacksOff) {
  throw "dist/ was built with KILN_SITE_PACKS=$($info.kilnSitePacks), not the launch mode (1). Pass -AllowPacksOff to deploy it anyway."
}

$files = @(Get-ChildItem -LiteralPath $dist -Recurse -File)
$bytes = ($files | Measure-Object -Property Length -Sum).Sum
$largest = $files | Sort-Object Length -Descending | Select-Object -First 1

# Pages' direct-upload limits, as the installed wrangler enforces them: 20,000 files and 25 MiB per file.
if ($files.Count -gt 20000) { throw "dist/ has $($files.Count) files; a Pages deployment takes at most 20,000." }
if ($largest.Length -gt 25MB) { throw "$($largest.FullName) is $($largest.Length) bytes; Pages takes files up to 25 MiB." }

Write-Host "wrangler:        $Wrangler ($($wranglerVersion.Trim()))"
Write-Host "dist:            $dist"
Write-Host ("files:           {0:N0} files, {1:N0} bytes; largest {2} ({3:N0} bytes)" -f $files.Count, $bytes, $largest.FullName.Substring($dist.Length + 1), $largest.Length)
Write-Host "build:           commit $($info.commit), KILN_SITE_PACKS=$($info.kilnSitePacks), docs $($info.docs.commit), skills $($info.skills.commit), built $($info.builtAt)"
Write-Host "project:         $ProjectName (branch production)"

$arguments = @('pages', 'deploy', $dist, '--project-name', $ProjectName, '--branch', 'production', '--commit-hash', $head, '--commit-dirty=false')
$command = "`"$Wrangler`" $($arguments -join ' ')"
if ($DryRun) {
  Write-Host "Dry run, not deployed: $command"
  return
}

Write-Host "Deploying: $command"
& $Wrangler @arguments
exit $LASTEXITCODE
