param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$PreservedStoragePath = "",
  [switch]$PreseedRuntime,
  [string]$JavaHomePath = "",
  [string]$BackendJarCachePath = "",
  [int]$StartupTimeoutSeconds = 180,
  [int]$MaxCombinedWorkingSetMb = 1536
)

$ErrorActionPreference = "Stop"
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ((Get-Item -LiteralPath $installer).Length -lt 1MB) { throw "Installer is unexpectedly small: $installer" }

$backendJarName = "Suwayomi-Server-v2.3.2243.jar"
$backendJarUrl = "https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.3.2243/Suwayomi-Server-v2.3.2243.jar"
$backendJarSha256 = "821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5"
$managedStorageMarker = ".yomikura-managed-storage"
$managedStorageMarkerContent = "YOMIKURA_MANAGED_STORAGE_V1"

function Get-DescendantProcessIds {
  param([Parameter(Mandatory = $true)][int]$RootProcessId)

  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $pending = [Collections.Generic.Queue[int]]::new()
  $descendants = [Collections.Generic.List[int]]::new()
  $pending.Enqueue($RootProcessId)

  while ($pending.Count -gt 0) {
    $parentId = $pending.Dequeue()
    foreach ($process in ($processes | Where-Object { $_.ParentProcessId -eq $parentId })) {
      $childId = [int]$process.ProcessId
      if (-not $descendants.Contains($childId)) {
        $descendants.Add($childId)
        $pending.Enqueue($childId)
      }
    }
  }

  return $descendants.ToArray()
}

function Get-BackendPort {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [int[]]$OwnedProcessIds,
    [string]$DataPath = ""
  )

  $processes = @(Get-CimInstance Win32_Process | Where-Object {
    $processId = [int]$_.ProcessId
    $commandLine = [string]$_.CommandLine
    $owned = $OwnedProcessIds -and ($OwnedProcessIds -contains $processId)
    $matchesStorage = $DataPath -and $commandLine -and
      $commandLine.IndexOf($DataPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $owned -or $matchesStorage
  })

  foreach ($process in $processes) {
    $match = [regex]::Match([string]$process.CommandLine, 'server\.port=(\d+)')
    if ($match.Success) { return [int]$match.Groups[1].Value }
  }

  $ownedListenPort = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object {
      ($OwnedProcessIds -and $OwnedProcessIds -contains [int]$_.OwningProcess) -and
      [int]$_.LocalPort -ge 4567 -and
      [int]$_.LocalPort -le 65535
    } |
    Select-Object -First 1 -ExpandProperty LocalPort
  if ($ownedListenPort) { return [int]$ownedListenPort }

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
  $runtimeLink = Join-Path $runtimeRoot "ci-java"
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  if (-not (Test-Path -LiteralPath $runtimeLink)) {
    New-Item -ItemType Junction -Path $runtimeLink -Target $resolvedJavaHome | Out-Null
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

Write-Host "Launching $appPath"
$app = $null
$ownedProcessIds = @()
$startupWatch = [Diagnostics.Stopwatch]::StartNew()
try {
  $app = Start-Process -FilePath $appPath -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
  $backendReady = $false
  do {
    Start-Sleep -Seconds 2
    $app.Refresh()
    if ($app.HasExited) { throw "Installed application exited during launch smoke test (code $($app.ExitCode))" }
    if ($PreservedStoragePath) {
      $ownedNow = @(Get-DescendantProcessIds -RootProcessId $app.Id)
      # A Windows child process can outlive the GUI process tree when the
      # packaged runtime starts Java. Prefer the explicit Suwayomi command
      # line and use the owned socket as a fallback instead of assuming the
      # Java PID is always a direct descendant of Yomikura.
      $backendPort = Get-BackendPort -OwnedProcessIds $ownedNow -DataPath $PreservedStoragePath
      if ($backendPort) {
        $backendReady = Test-GraphqlEndpoint -Port $backendPort
      }
      if (-not $backendReady) {
        # If process ancestry and command-line inspection are unavailable,
        # restrict the fallback to ports owned by Java. The runner has many
        # unrelated listeners; probing every local port can consume the full
        # startup timeout without ever testing Suwayomi.
        $javaProcessIds = @(Get-CimInstance Win32_Process |
          Where-Object { [string]$_.Name -match '^(java|javaw)\.exe$' } |
          Select-Object -ExpandProperty ProcessId)
        $candidatePorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
          Where-Object {
            $javaProcessIds -contains [int]$_.OwningProcess -and
            [int]$_.LocalPort -ge 4567 -and
            [int]$_.LocalPort -le 65535
          } |
          Select-Object -ExpandProperty LocalPort -Unique)
        if ($candidatePorts.Count -eq 0) { $candidatePorts = @(4567) }
        foreach ($candidatePort in $candidatePorts) {
          if (Test-GraphqlEndpoint -Port ([int]$candidatePort)) {
            $backendPort = [int]$candidatePort
            $backendReady = $true
            break
          }
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
      $backendLog = Join-Path $PreservedStoragePath "suwayomi.log"
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
  $ownedProcessIds = @(Get-DescendantProcessIds -RootProcessId $app.Id)
  $measuredProcessIds = @($app.Id) + $ownedProcessIds | Select-Object -Unique
  $measuredProcesses = @($measuredProcessIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
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
    if (-not $app.HasExited) {
      Write-Host "Requesting a graceful application close"
      $null = $app.CloseMainWindow()
      if (-not $app.WaitForExit(15000)) {
        Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
        throw "Installed application did not close gracefully within 15 seconds"
      }
    }

    $remaining = @($ownedProcessIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if ($remaining.Count -gt 0) {
      foreach ($processId in $remaining) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
      throw "Owned child processes remained after application close: $($remaining -join ', ')"
    }
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
