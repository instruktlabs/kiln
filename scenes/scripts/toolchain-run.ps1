# Process-local toolchain selection; no global environment mutation.
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $TaskArguments)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$toolchain = Get-Content -LiteralPath (Join-Path $workspace 'toolchain.json') -Raw | ConvertFrom-Json
if ([string]$toolchain.node -notmatch '^\d+\.\d+\.\d+$') {
  throw 'toolchain.json must pin a stable Node release.'
}
$nodeInstall = $null
if ($env:APPDATA) {
  $candidate = Join-Path $env:APPDATA "fnm/node-versions/v$($toolchain.node)/installation"
  if (Test-Path -LiteralPath (Join-Path $candidate 'node.exe') -PathType Leaf) {
    $nodeInstall = $candidate
  }
}
$previousPath = $env:PATH
try {
  # Prefer the pinned per-user fnm install when present; otherwise keep PATH's Node.
  $entries = @((Join-Path $workspace 'node_modules/.bin'))
  if ($nodeInstall) { $entries += $nodeInstall }
  $entries += $previousPath
  $env:PATH = $entries -join [System.IO.Path]::PathSeparator
  $nodeVersion = (& node --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne "v$($toolchain.node)") {
    throw "Node $($toolchain.node) is required; selected $nodeVersion. Install the pinned version with fnm or select it on PATH."
  }
  $env:npm_config_cache = "$workspace/.tmp/npm-cache"
  $env:BUN_INSTALL_CACHE_DIR = "$workspace/.tmp/bun-cache"
  $env:TEMP = "$workspace/.tmp"
  $env:TMP = "$workspace/.tmp"
  Push-Location -LiteralPath $workspace
  try { & bun @TaskArguments; exit $LASTEXITCODE } finally { Pop-Location }
} finally { $env:PATH = $previousPath }
