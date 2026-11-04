function Get-SmokeCreationTicks {
  param([Parameter(Mandatory)][datetime]$Created)

  # CIM's DMTF creation time has microsecond precision. Process.StartTime can
  # retain the final 100ns digit. Compare at the precision shared by both.
  $ticks = $Created.ToUniversalTime().Ticks
  return $ticks - ($ticks % 10)
}

function Find-SmokeDescendants {
  param(
    [Parameter(Mandatory)][int]$RootProcessId,
    [Parameter(Mandatory)][datetime]$RootStartTime,
    [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Snapshot
  )

  $root = $Snapshot | Where-Object { $_.ProcessId -eq $RootProcessId } | Select-Object -First 1
  if (-not $root -or -not $root.CreationDate -or
      (Get-SmokeCreationTicks $root.CreationDate) -ne (Get-SmokeCreationTicks $RootStartTime)) {
    return
  }

  $children = $Snapshot | Group-Object -Property ParentProcessId -AsHashTable
  $pending = [Collections.Generic.Queue[object]]::new()
  $visited = [Collections.Generic.HashSet[int]]::new()
  $pending.Enqueue($root)
  $null = $visited.Add($RootProcessId)

  while ($pending.Count -gt 0) {
    $parent = $pending.Dequeue()
    $parentCreated = Get-SmokeCreationTicks $parent.CreationDate
    foreach ($child in $children[$parent.ProcessId]) {
      if (-not $child.CreationDate -or (Get-SmokeCreationTicks $child.CreationDate) -lt $parentCreated) { continue }
      if ($visited.Add([int]$child.ProcessId)) {
        $pending.Enqueue($child)
        $child
      }
    }
  }
}

function Get-SmokeOwnedProcesses {
  param([Parameter(Mandatory)][Diagnostics.Process]$Root)

  if ($Root.HasExited) { return }
  $snapshot = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)
  foreach ($record in (Find-SmokeDescendants -RootProcessId $Root.Id -RootStartTime $Root.StartTime -Snapshot $snapshot)) {
    $process = Get-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $keep = $false
    try {
      # Keep this instance's handle open. Later operations must not resolve
      # the PID again, even if this process exits while the test is running.
      $null = $process.SafeHandle
      $startTime = $process.StartTime.ToUniversalTime()
      if (-not $process.HasExited -and (Get-SmokeCreationTicks $startTime) -eq (Get-SmokeCreationTicks $record.CreationDate)) {
        $keep = $true
        [pscustomobject]@{ Process = $process; Id = $process.Id; StartTimeUtc = $startTime }
      }
    } catch [InvalidOperationException], [ComponentModel.Win32Exception] {
      # The snapshot process exited or became inaccessible before we bound it.
    } finally {
      if (-not $keep) { $process.Dispose() }
    }
  }
}

function Test-SmokeProcessIdentity {
  param([Parameter(Mandatory)]$Record)

  try {
    $Record.Process.Refresh()
    return -not $Record.Process.HasExited -and
      $Record.Process.Id -eq $Record.Id -and
      $Record.Process.StartTime.ToUniversalTime() -eq $Record.StartTimeUtc
  } catch [InvalidOperationException], [ComponentModel.Win32Exception] {
    return $false
  }
}
