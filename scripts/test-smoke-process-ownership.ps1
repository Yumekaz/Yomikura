$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "smoke-process-ownership.ps1")

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -cne $Expected) { throw "$Message (expected '$Expected', got '$Actual')" }
}

function New-ProcessRow([int]$Id, [int]$ParentId, [datetime]$Created) {
  [pscustomobject]@{ ProcessId = [uint32]$Id; ParentProcessId = [uint32]$ParentId; CreationDate = $Created }
}

$appCreated = [datetime]::SpecifyKind([datetime]'2026-11-03T17:30:00', [DateTimeKind]::Utc)
$snapshot = @(
  (New-ProcessRow 100 1 $appCreated)
  (New-ProcessRow 200 100 $appCreated.AddTicks(10))
  (New-ProcessRow 201 200 $appCreated.AddSeconds(2))
  # This process still points to the PID of its former parent, which now
  # belongs to the app. Its branch is unrelated even if a leaf is newer.
  (New-ProcessRow 300 100 $appCreated.AddSeconds(-1))
  (New-ProcessRow 301 300 $appCreated.AddSeconds(1))
  # A stale child of a recycled intermediate PID is unrelated too.
  (New-ProcessRow 302 200 $appCreated)
)

$descendants = @(Find-SmokeDescendants -RootProcessId 100 -RootStartTime $appCreated.AddTicks(7) -Snapshot $snapshot)
Assert-Equal (($descendants.ProcessId | Sort-Object) -join ',') '200,201' 'Only time-consistent descendants belong to the app'
$reusedRoot = @(Find-SmokeDescendants -RootProcessId 100 -RootStartTime $appCreated.AddSeconds(5) -Snapshot $snapshot)
Assert-Equal $reusedRoot.Count 0 'A reused root PID cannot claim the old process tree'

$process = [pscustomobject]@{ Id = 200; StartTime = $appCreated.AddTicks(19); HasExited = $false }
$process | Add-Member -MemberType ScriptMethod -Name Refresh -Value {}
$record = [pscustomobject]@{ Id = 200; Process = $process; StartTimeUtc = $process.StartTime }
Assert-Equal (Test-SmokeProcessIdentity $record) $true 'A matching live process is counted'
$process.StartTime = $process.StartTime.AddTicks(1)
Assert-Equal (Test-SmokeProcessIdentity $record) $false 'A reused PID cannot pass the final exact start-time check'
$process.StartTime = $record.StartTimeUtc
$process.HasExited = $true
Assert-Equal (Test-SmokeProcessIdentity $record) $false 'An exited process is neither counted nor stopped'

Write-Host 'Installer process-ownership checks passed'
