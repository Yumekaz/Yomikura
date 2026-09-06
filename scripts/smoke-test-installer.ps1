param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$PreservedStoragePath = ""
)

$ErrorActionPreference = "Stop"
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ((Get-Item -LiteralPath $installer).Length -lt 1MB) { throw "Installer is unexpectedly small: $installer" }

Write-Host "Installing $installer"
$installProcess = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Installer exited with code $($installProcess.ExitCode)" }

if ($PreservedStoragePath) {
  $PreservedStoragePath = [IO.Path]::GetFullPath($PreservedStoragePath)
  New-Item -ItemType Directory -Path $PreservedStoragePath -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $PreservedStoragePath "smoke-sentinel.txt") -Value "Yomikura user data must survive an application uninstall." -NoNewline
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
try {
  $app = Start-Process -FilePath $appPath -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Start-Sleep -Seconds 2
    $app.Refresh()
    if ($app.HasExited) { throw "Installed application exited during launch smoke test (code $($app.ExitCode))" }
  } while ([DateTime]::UtcNow -lt $deadline)
  Write-Host "Application stayed alive for the launch smoke window (PID $($app.Id))"
} finally {
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
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
