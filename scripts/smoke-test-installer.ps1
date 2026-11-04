param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$PreservedStoragePath = "",
  [switch]$PreseedRuntime,
  [string]$JavaHomePath = "",
  [string]$BackendJarCachePath = "",
  [int]$StartupTimeoutSeconds = 240,
  [int]$MaxCombinedWorkingSetMb = 1536
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "smoke-process-ownership.ps1")
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ((Get-Item -LiteralPath $installer).Length -lt 1MB) { throw "Installer is unexpectedly small: $installer" }

$backendJarName = "Suwayomi-Server-v2.3.2243.jar"
$backendJarUrl = "https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.3.2243/Suwayomi-Server-v2.3.2243.jar"
$backendJarSha256 = "821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5"
$managedStorageMarker = ".yomikura-managed-storage"
$managedStorageMarkerContent = "YOMIKURA_MANAGED_STORAGE_V1"

function Get-RecordedBackendPort {
  param([Parameter(Mandatory = $true)][string]$PidRecordPath)

  if (-not (Test-Path -LiteralPath $PidRecordPath -PathType Leaf)) { return $null }
  $recordedPid = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $PidRecordPath -Raw).Trim(), [ref]$recordedPid)) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $recordedPid" -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  $match = [regex]::Match([string]$process.CommandLine, 'server\.port=(\d+)')
  if ($match.Success) { return [int]$match.Groups[1].Value }
  return $null
}

function Test-GraphqlEndpoint {
  param([Parameter(Mandatory = $true)][int]$Port)

  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/graphql" -Method Post -ContentType "application/json" -Body '{"query":"{ __typename }"}' -TimeoutSec 5
    return $health.StatusCode -ge 200 -and $health.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Write-TestSettings {
  param([Parameter(Mandatory = $true)][string]$StoragePath)

  $configDirectory = Join-Path $env:APPDATA "app.yomikura"
  New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
  $settings = [ordered]@{
    state = [ordered]@{
      serverDataPath = $StoragePath
      serverBaseUrl = "http://127.0.0.1:4567"
      mockMode = $false
      portableMode = $false
    }
    version = 0
  } | ConvertTo-Json -Depth 5
  Set-Content -LiteralPath (Join-Path $configDirectory "yomikura-settings.json") -Value $settings -Encoding UTF8
}

function Initialize-SmokeRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$StoragePath,
    [Parameter(Mandatory = $true)][string]$JavaHome,
    [Parameter(Mandatory = $true)][string]$JarCachePath
  )

  $resolvedJavaHome = (Resolve-Path -LiteralPath $JavaHome).Path
  $javaBinary = Join-Path $resolvedJavaHome "bin\java.exe"
  if (-not (Test-Path -LiteralPath $javaBinary -PathType Leaf)) {
    throw "Java 21 runtime was not found at $javaBinary"
  }

  $javaVersion = & $javaBinary -version 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or $javaVersion -notmatch 'version "(?:1\.)?(2[1-9]|[3-9][0-9])') {
    throw "The smoke test requires Java 21 or newer. Detected: $($javaVersion.Trim())"
  }

  New-Item -ItemType Directory -Path $StoragePath -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $StoragePath $managedStorageMarker) -Value $managedStorageMarkerContent -NoNewline

  $runtimeRoot = Join-Path $StoragePath "jre"
  $runtimeHome = Join-Path $runtimeRoot "ci-java"
  if (Test-Path -LiteralPath $runtimeRoot) {
    throw "Smoke-test Java runtime path unexpectedly exists: $runtimeRoot"
  }
  New-Item -ItemType Directory -Path $runtimeHome -Force | Out-Null
  # Use real runtime files rather than a directory junction. Executing the
  # hosted JDK through a junction breaks Suwayomi's runtime classpath scan on
  # GitHub's Windows image and leaves the GraphQL schema empty.
  & robocopy.exe $resolvedJavaHome $runtimeHome /E /NFL /NDL /NJH /NJS /NC /NS /NP
  $robocopyExitCode = $LASTEXITCODE
  if ($robocopyExitCode -gt 7) {
    throw "Could not prepare the isolated Java runtime (robocopy exit code $robocopyExitCode)"
  }
  # Robocopy codes 0-7 are successful outcomes. Do not leak its common
  # "files copied" code (1) as this script's final process exit code.
  $global:LASTEXITCODE = 0
  if (-not (Test-Path -LiteralPath (Join-Path $runtimeHome "bin\java.exe") -PathType Leaf)) {
    throw "Copied Java runtime is incomplete: $runtimeHome"
  }

  $cacheDirectory = Split-Path -Parent $JarCachePath
  New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
  $cacheIsValid = (Test-Path -LiteralPath $JarCachePath -PathType Leaf) -and
    ((Get-FileHash -LiteralPath $JarCachePath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $backendJarSha256)
  if (-not $cacheIsValid) {
    if (Test-Path -LiteralPath $JarCachePath) {
      Remove-Item -LiteralPath $JarCachePath -Force
    }
    $partialJar = "$JarCachePath.part"
    if (Test-Path -LiteralPath $partialJar) {
      Remove-Item -LiteralPath $partialJar -Force
    }
    Write-Host "Fetching pinned Suwayomi backend for the deterministic installer smoke test"
    & curl.exe -fL --retry 2 --retry-max-time 600 --connect-timeout 30 --max-time 300 -o $partialJar $backendJarUrl
    if ($LASTEXITCODE -ne 0) {
      Remove-Item -LiteralPath $partialJar -Force -ErrorAction SilentlyContinue
      throw "Could not fetch the pinned Suwayomi backend (curl exit code $LASTEXITCODE)"
    }
    $downloadedHash = (Get-FileHash -LiteralPath $partialJar -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($downloadedHash -ne $backendJarSha256) {
      Remove-Item -LiteralPath $partialJar -Force
      throw "Pinned Suwayomi backend checksum mismatch: expected $backendJarSha256, got $downloadedHash"
    }
    Move-Item -LiteralPath $partialJar -Destination $JarCachePath -Force
  }

  $storageJar = Join-Path $StoragePath $backendJarName
  Copy-Item -LiteralPath $JarCachePath -Destination $storageJar -Force
  Write-Host "Prepared verified Java 21 and Suwayomi runtime for installed-app validation"
}

Write-Host "Installing $installer"
$installProcess = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Installer exited with code $($installProcess.ExitCode)" }

if ($PreservedStoragePath) {
  $PreservedStoragePath = [IO.Path]::GetFullPath($PreservedStoragePath)
  New-Item -ItemType Directory -Path $PreservedStoragePath -Force | Out-Null
  if ($PreseedRuntime) {
    if (-not $JavaHomePath) { throw "JavaHomePath is required when PreseedRuntime is enabled" }
    if (-not $BackendJarCachePath) { throw "BackendJarCachePath is required when PreseedRuntime is enabled" }
    Initialize-SmokeRuntime -StoragePath $PreservedStoragePath -JavaHome $JavaHomePath -JarCachePath $BackendJarCachePath
  }
  Write-TestSettings -StoragePath $PreservedStoragePath
}

$uninstallRoots = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
$entry = Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq "Yomikura" -and $_.UninstallString } |
  Select-Object -First 1
if (-not $entry) { throw "Yomikura uninstall registration was not created" }

$appPath = $null
if ($entry.DisplayIcon) { $appPath = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"') }
if (-not $appPath -or -not (Test-Path -LiteralPath $appPath)) {
  $appPath = Join-Path $entry.InstallLocation "Yomikura.exe"
}
if (-not (Test-Path -LiteralPath $appPath)) { throw "Installed executable was not found (InstallLocation: $($entry.InstallLocation))" }

# Verify the shortcut a reader actually uses, as well as the executable's icon.
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Yomikura.lnk'
if (-not (Test-Path -LiteralPath $desktopShortcut -PathType Leaf)) { throw 'Desktop shortcut was not created' }
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($desktopShortcut)
if (-not (Test-Path -LiteralPath $shortcut.TargetPath -PathType Leaf)) { throw "Desktop shortcut target does not exist: $($shortcut.TargetPath)" }
if (-not [string]::Equals([IO.Path]::GetFullPath($shortcut.TargetPath), [IO.Path]::GetFullPath($appPath), [StringComparison]::OrdinalIgnoreCase)) { throw 'Desktop shortcut targets a different executable' }
$shortcutIconPath = [Environment]::ExpandEnvironmentVariables(($shortcut.IconLocation -replace ',\s*-?\d+$', '').Trim('"'))
if ($shortcutIconPath -and -not (Test-Path -LiteralPath $shortcutIconPath -PathType Leaf)) { throw "Desktop shortcut icon source does not exist: $shortcutIconPath" }
Add-Type -AssemblyName System.Drawing
$installedIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($appPath)
if (-not $installedIcon) { throw 'Installed executable does not expose an icon' }
$installedIcon.Dispose()
Write-Host 'Desktop shortcut targets the installed executable and its icon is available'

Write-Host "Launching $appPath"
$app = $null
$ownedProcesses = @()
$startupWatch = [Diagnostics.Stopwatch]::StartNew()
try {
  if ($PreservedStoragePath) {
    $env:YOMIKURA_SMOKE_AUTOSTART_DATA_PATH = $PreservedStoragePath
  }
  try {
    $app = Start-Process -FilePath $appPath -PassThru
    $null = $app.SafeHandle
  } finally {
    Remove-Item Env:YOMIKURA_SMOKE_AUTOSTART_DATA_PATH -ErrorAction SilentlyContinue
  }
  $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
  $backendReady = $false
  $backendPort = 4567
  $backendPidRecord = Join-Path $env:LOCALAPPDATA "app.yomikura\backend.pid"
  $backendLog = if ($PreservedStoragePath) { Join-Path $PreservedStoragePath "suwayomi.log" } else { "" }
  $pollCount = 0
  do {
    Start-Sleep -Seconds 2
    $pollCount++
    $app.Refresh()
    if ($app.HasExited) { throw "Installed application exited during launch smoke test (code $($app.ExitCode))" }
    if ($PreservedStoragePath) {
      # A clean runner normally uses 4567, so probe it directly. The previous
      # implementation enumerated every Windows process and listening socket
      # every two seconds; those global CIM/network scans could starve the app
      # being measured and made readiness coincide with the test deadline.
      $backendReady = Test-GraphqlEndpoint -Port $backendPort
      if (-not $backendReady -and ($pollCount % 5 -eq 0)) {
        $nativeStartupError = Join-Path $PreservedStoragePath "yomikura-smoke-startup-error.log"
        if (Test-Path -LiteralPath $nativeStartupError -PathType Leaf) {
          $nativeError = Get-Content -LiteralPath $nativeStartupError -Raw
          throw "Yomikura native smoke startup failed: $nativeError"
        }
        if ($backendLog -and (Test-Path -LiteralPath $backendLog -PathType Leaf)) {
          $fatalStartup = Select-String -LiteralPath $backendLog -Pattern 'InvalidPackagesException|MigrationsRunFailure|Shutting Down Suwayomi-Server' -Quiet
          if ($fatalStartup) {
            Write-Host "Fatal Suwayomi startup output:"
            Get-Content -LiteralPath $backendLog -Tail 60 | Write-Host
            throw "Suwayomi reported a fatal startup error before GraphQL became ready"
          }
        }
        $recordedPort = Get-RecordedBackendPort -PidRecordPath $backendPidRecord
        if ($recordedPort) {
          $backendPort = $recordedPort
          $backendReady = Test-GraphqlEndpoint -Port $backendPort
        }
      }
    } else {
      $backendReady = $true
    }
  } while (-not $backendReady -and [DateTime]::UtcNow -lt $deadline)
  if (-not $backendReady) {
    $settingsFile = Join-Path $env:APPDATA "app.yomikura\yomikura-settings.json"
    if (Test-Path -LiteralPath $settingsFile) {
      Write-Host "Persisted test settings:"
      Get-Content -LiteralPath $settingsFile | Write-Host
    }
    if ($PreservedStoragePath) {
      if (Test-Path -LiteralPath $backendLog) {
        Write-Host "Recent Suwayomi log output:"
        Get-Content -LiteralPath $backendLog -Tail 40 | Write-Host
      }
    }
    throw "Installed application did not bring the local Suwayomi GraphQL endpoint online within $StartupTimeoutSeconds seconds"
  }
  $startupWatch.Stop()
  if ($PreservedStoragePath) {
    # The storage contract requires a new folder to be empty before Yomikura
    # initializes and marks it. Create the sentinel only after that contract
    # has been satisfied so this test verifies uninstall preservation rather
    # than accidentally testing rejection of a non-empty folder.
    Set-Content -LiteralPath (Join-Path $PreservedStoragePath "smoke-sentinel.txt") -Value "Yomikura user data must survive an application uninstall." -NoNewline
    Write-Host "Local Suwayomi GraphQL endpoint is ready on port $backendPort"
  }
  Write-Host "Verifying the supported Suwayomi GraphQL contract"
  node (Join-Path $PSScriptRoot "verify-suwayomi-contract.mjs") "--base-url=http://127.0.0.1:$backendPort"
  if ($LASTEXITCODE -ne 0) {
    throw "Installed Suwayomi backend does not satisfy Yomikura's supported GraphQL contract"
  }
  if ($app.HasExited) { throw "Installed application exited during the GraphQL contract check (code $($app.ExitCode))" }
  $ownedProcesses = @(Get-SmokeOwnedProcesses -Root $app)
  $measuredProcesses = @($app) + @($ownedProcesses | Where-Object { Test-SmokeProcessIdentity $_ } | ForEach-Object { $_.Process })
  if ($PreservedStoragePath -and $measuredProcesses.Count -lt 2) {
    throw "Could not verify a live child process for the installed application"
  }
  $combinedWorkingSetBytes = ($measuredProcesses | Measure-Object -Property WorkingSet64 -Sum).Sum
  if ($null -eq $combinedWorkingSetBytes) { $combinedWorkingSetBytes = 0 }
  $combinedWorkingSetMb = [Math]::Round($combinedWorkingSetBytes / 1MB, 1)
  if ($combinedWorkingSetMb -gt $MaxCombinedWorkingSetMb) {
    throw "Installed application exceeded the $MaxCombinedWorkingSetMb MB working-set baseline: $combinedWorkingSetMb MB"
  }
  if ($PreservedStoragePath) {
    [ordered]@{
      startupSeconds = [Math]::Round($startupWatch.Elapsed.TotalSeconds, 2)
      combinedWorkingSetMb = $combinedWorkingSetMb
      measuredProcessCount = $measuredProcesses.Count
      backendPort = $backendPort
      startupLimitSeconds = $StartupTimeoutSeconds
      workingSetLimitMb = $MaxCombinedWorkingSetMb
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PreservedStoragePath "smoke-metrics.json") -Encoding UTF8
  }
  Write-Host "Performance baseline: startup $([Math]::Round($startupWatch.Elapsed.TotalSeconds, 2))s; combined working set $combinedWorkingSetMb MB across $($measuredProcesses.Count) processes"
  Write-Host "Application and local engine stayed alive through the launch smoke window (PID $($app.Id))"
} finally {
  if ($app) {
    $app.Refresh()
    $closeTimedOut = $false
    $ownershipReadError = $null
    if (-not $app.HasExited) {
      # Include children started since the working-set measurement. This also
      # captures any surviving child when startup failed before measurement.
      try {
        $ownedProcesses += @(Get-SmokeOwnedProcesses -Root $app)
      } catch {
        # A failed snapshot still needs to close the app and check all children
        # captured earlier. Surface the diagnostic after that cleanup.
        $ownershipReadError = $_
      }
      Write-Host "Requesting a graceful application close"
      $null = $app.CloseMainWindow()
      if (-not $app.WaitForExit(15000)) {
        Stop-Process -InputObject $app -Force -ErrorAction SilentlyContinue
        $closeTimedOut = $true
      }
    }

    # The main window can exit before WebView2 has finished draining its child
    # processes. Give every process that belonged to this app a short bounded
    # grace period; this still fails if anything genuinely remains resident.
    $childExitDeadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
      $remaining = @($ownedProcesses | Where-Object { Test-SmokeProcessIdentity $_ } |
        Sort-Object Id, StartTimeUtc -Unique)
      if ($remaining.Count -eq 0) { break }
      if ([DateTime]::UtcNow -ge $childExitDeadline) { break }
      Start-Sleep -Milliseconds 500
    } while ($true)

    if ($remaining.Count -gt 0) {
      $remainingDetails = @($remaining | ForEach-Object { "$($_.Id):$($_.Process.ProcessName) ($($_.StartTimeUtc.ToString('o')))" })
      foreach ($record in $remaining) {
        if (Test-SmokeProcessIdentity $record) {
          Stop-Process -InputObject $record.Process -Force -ErrorAction SilentlyContinue
        }
      }
      throw "Owned child processes remained 15 seconds after application close: $($remainingDetails -join ', ')"
    }
    if ($closeTimedOut) { throw "Installed application did not close gracefully within 15 seconds" }
    if ($ownershipReadError) { throw $ownershipReadError }
    Write-Host "Application and owned child processes exited cleanly"
  }
}

$uninstallCommand = $entry.QuietUninstallString
if (-not $uninstallCommand) { $uninstallCommand = $entry.UninstallString }
if (-not $uninstallCommand) { throw "Yomikura uninstall command was not registered" }
$uninstaller = ([regex]::Match($uninstallCommand, '^\s*"([^"]+)"').Groups[1].Value)
if (-not $uninstaller) { $uninstaller = ($uninstallCommand -split '\s+')[0].Trim('"') }
if (-not (Test-Path -LiteralPath $uninstaller)) { throw "Registered uninstaller was not found: $uninstaller" }

Write-Host "Uninstalling $uninstaller"
$uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
if ($uninstallProcess.ExitCode -ne 0) { throw "Uninstaller exited with code $($uninstallProcess.ExitCode)" }
Start-Sleep -Seconds 2
if (Test-Path -LiteralPath $appPath) { throw "Application executable remains after uninstall: $appPath" }
if ($PreservedStoragePath -and -not (Test-Path -LiteralPath (Join-Path $PreservedStoragePath "smoke-sentinel.txt"))) {
  throw "User-selected storage was removed during uninstall: $PreservedStoragePath"
}
Write-Host "Installer lifecycle smoke test passed"
exit 0
