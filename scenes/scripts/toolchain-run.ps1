# Process-local toolchain selection; no global environment mutation.
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $TaskArguments)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$nodeInstall = 'C:/Users/Mattm/AppData/Roaming/fnm/node-versions/v22.23.2/installation'
$previousPath = $env:PATH
try {
  $env:PATH = "$workspace/node_modules/.bin;$nodeInstall;$previousPath"
  $env:npm_config_cache = "$workspace/.tmp/npm-cache"
  $env:BUN_INSTALL_CACHE_DIR = "$workspace/.tmp/bun-cache"
  $env:TEMP = "$workspace/.tmp"
  $env:TMP = "$workspace/.tmp"
  Push-Location -LiteralPath $workspace
  try { & bun @TaskArguments; exit $LASTEXITCODE } finally { Pop-Location }
} finally { $env:PATH = $previousPath }
