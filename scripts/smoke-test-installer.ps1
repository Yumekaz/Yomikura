param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$PreservedStoragePath = "",
  [int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ((Get-Item -LiteralPath $installer).Length -lt 1MB) { throw "Installer is unexpectedly small: $installer" }

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
  param([Parameter(Mandatory = $true)][int[]]$OwnedProcessIds)

  foreach ($process in (Get-CimInstance Win32_Process | Where-Object { $OwnedProcessIds -contains [int]$_.ProcessId })) {
    $match = [regex]::Match([string]$process.CommandLine, 'server\.port=(\d+)')
    if ($match.Success) { return [int]$match.Groups[1].Value }
  }

  $ownedListenPort = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object {
      $OwnedProcessIds -contains [int]$_.OwningProcess -and
      [int]$_.LocalPort -ge 4567 -and
      [int]$_.LocalPort -le 65535
    } |
    Select-Object -First 1 -ExpandProperty LocalPort
  if ($ownedListenPort) { return [int]$ownedListenPort }

  return $null
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

Write-Host "Installing $installer"
$installProcess = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Installer exited with code $($installProcess.ExitCode)" }

if ($PreservedStoragePath) {
  $PreservedStoragePath = [IO.Path]::GetFullPath($PreservedStoragePath)
  New-Item -ItemType Directory -Path $PreservedStoragePath -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $PreservedStoragePath "smoke-sentinel.txt") -Value "Yomikura user data must survive an application uninstall." -NoNewline
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
      $backendPort = Get-BackendPort -OwnedProcessIds $ownedNow
      if ($backendPort) {
        try {
          $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$backendPort/api/graphql" -Method Post -ContentType "application/json" -Body '{"query":"{ __typename }"}' -TimeoutSec 5
          if ($health.StatusCode -ge 200 -and $health.StatusCode -lt 300) { $backendReady = $true }
        } catch {
          # The Java process can bind before the GraphQL endpoint is ready.
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
  if ($PreservedStoragePath) {
    Write-Host "Local Suwayomi GraphQL endpoint is ready on port $backendPort"
  }
  $ownedProcessIds = @(Get-DescendantProcessIds -RootProcessId $app.Id)
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
