# Load sample recorded beside every indicative timing taken on this PC (TASK.md standing rule: timing here is
# indicative only and carries its load sample: CPU total %, GPU 3D %, and what else is running).
# Output: one JSON line. Read-only: reads performance counters and the process list, starts and stops nothing.
param([int]$Seconds = 1)
$ErrorActionPreference = 'Stop'
$paths = @('\Processor(_Total)\% Processor Time', '\GPU Engine(*engtype_3D)\Utilization Percentage')
$samples = (Get-Counter -Counter $paths -SampleInterval $Seconds -MaxSamples 1).CounterSamples
$cpu = ($samples | Where-Object { $_.Path -like '*\processor(_total)\*' } | Measure-Object -Property CookedValue -Sum).Sum
$gpu3d = ($samples | Where-Object { $_.Path -like '*engtype_3d*' } | Measure-Object -Property CookedValue -Sum).Sum
$names = @('chrome', 'bun', 'node', 'claude', 'python', 'adb')
$groups = Get-Process | Where-Object { $names -contains $_.ProcessName } | Group-Object ProcessName
$processes = [ordered]@{}
foreach ($name in $names) { $group = $groups | Where-Object { $_.Name -eq $name }; $processes[$name] = if ($group) { $group.Count } else { 0 } }
[pscustomobject]@{
  at = (Get-Date).ToString('o')
  seconds = $Seconds
  cpuTotalPercent = [math]::Round([double]$cpu, 1)
  gpu3dPercent = [math]::Round([double][math]::Min(100, $gpu3d), 1)
  processCounts = $processes
  method = 'Get-Counter over the sample window: Processor(_Total) % Processor Time; the sum of GPU Engine engtype_3D utilization (capped at 100, as Task Manager shows 3D); process counts by name'
} | ConvertTo-Json -Compress -Depth 4
