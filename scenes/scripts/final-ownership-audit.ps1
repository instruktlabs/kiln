# -Evidence names the record to write (workspace-relative); the default keeps the M1 record's path.
param([string] $Evidence = 'evidence/m1/final-audit.json')
$ErrorActionPreference = 'Stop'
$sceneWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sceneEvidence = Join-Path $sceneWorkspace $Evidence
$sceneBrowserPids = [System.Collections.Generic.HashSet[int]]::new()
Get-ChildItem -LiteralPath (Join-Path $sceneWorkspace 'evidence') -Recurse -File -Filter '*.json' | ForEach-Object {
  $sceneJson = [System.IO.File]::ReadAllText($_.FullName)
  foreach ($sceneMatch in [regex]::Matches($sceneJson, '"browserPid"\s*:\s*(\d+)')) {
    [void]$sceneBrowserPids.Add([int]$sceneMatch.Groups[1].Value)
  }
}
$sceneStillRunning = @()
foreach ($scenePid in $sceneBrowserPids) {
  # Return metadata only for a recorded PID that still has our workspace in its
  # command line; an unrelated process that reused the PID is not inspected.
  $sceneWqlPath = $sceneWorkspace.Replace('\', '\\')
  $sceneOwned = Get-CimInstance Win32_Process -Filter "ProcessId=$scenePid AND CommandLine LIKE '%$sceneWqlPath%'"
  if ($sceneOwned) { $sceneStillRunning += @{ pid=$scenePid; name=$sceneOwned.Name } }
}
$sceneWqlPath = $sceneWorkspace.Replace('\', '\\')
$sceneOwnedRuntime = @(Get-CimInstance Win32_Process -Filter "(Name='node.exe' OR Name='bun.exe' OR Name='chrome.exe') AND CommandLine LIKE '%$sceneWqlPath%'")
$sceneListeners = @()
foreach ($sceneProcess in $sceneOwnedRuntime) {
  $sceneListeners += @(Get-NetTCPConnection -State Listen -OwningProcess $sceneProcess.ProcessId -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
}
$sceneHashes = @{}
foreach ($sceneInput in @('SPEC.md','INVENTORY.md','DECISIONS.md','node_modules/react-dom/cjs/react-dom-client.production.js')) {
  $sceneHashes[$sceneInput] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sceneWorkspace $sceneInput)).Hash.ToLowerInvariant()
}
$sceneResult = @{
  checkedAt=[DateTime]::UtcNow.ToString('o'); workspace=$sceneWorkspace;
  recordedBrowserPids=@($sceneBrowserPids | Sort-Object);
  recordedBrowsersStillRunning=$sceneStillRunning;
  ownedRuntimeProcesses=@($sceneOwnedRuntime | Select-Object ProcessId,Name);
  ownedListeners=$sceneListeners; sha256=$sceneHashes;
  method='Read-only OS metadata for recorded browser PIDs and workspace-scoped runtime command lines. No socket connection or port probe.'
}
$sceneResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $sceneEvidence -Encoding utf8
Write-Output "Recorded browser processes still running: $($sceneStillRunning.Count); owned runtime processes: $($sceneOwnedRuntime.Count); owned listeners: $($sceneListeners.Count)"
if ($sceneStillRunning.Count -or $sceneOwnedRuntime.Count -or $sceneListeners.Count) { exit 1 }
