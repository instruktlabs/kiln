<#
.SYNOPSIS
  Compatibility entrypoint for the portable, receipt-verifying Pages deploy script.
.DESCRIPTION
  Run after release authorization. Node owns all checks and the exact Wrangler pin.
  -DryRun performs the complete offline preflight without package preparation or upload.
  -AllowPacksOff is retained only to report its removal: production requires packs=1.
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
$arguments = @((Join-Path $PSScriptRoot 'deploy.mjs'), '--site', $Site, '--project-name', $ProjectName)
if ($Wrangler) { $arguments += @('--wrangler', $Wrangler) }
if ($AllowPacksOff) { $arguments += '--allow-packs-off' }
if ($DryRun) { $arguments += '--dry-run' }
& node @arguments
exit $LASTEXITCODE
