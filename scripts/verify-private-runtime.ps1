param([Parameter(Mandatory = $true)][string]$Destination)

$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true' -or !$env:RUNNER_TEMP) { throw 'Run the private-runtime probe on the disposable CI runner only.' }
$runtimeRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
$runtimeDestination = [IO.Path]::GetFullPath($Destination)
if (!$runtimeDestination.StartsWith($runtimeRoot, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $runtimeDestination)) {
  throw 'Choose a fresh directory inside RUNNER_TEMP.'
}
$nativeSource = Get-Content -LiteralPath 'src-tauri/src/lib.rs' -Raw
$runtimePin = [regex]::Match($nativeSource, '(?s)\("windows",\s*"x86_64"\)\s*=>\s*\(\s*"(?<url>https://[^"]+)",\s*"(?<hash>[a-f0-9]{64})"')
if (!$runtimePin.Success) { throw 'The production Windows runtime pin could not be read.' }
New-Item -ItemType Directory -Path $runtimeDestination | Out-Null
$archive = Join-Path $runtimeDestination 'runtime.zip'
Invoke-WebRequest -Uri $runtimePin.Groups['url'].Value -OutFile $archive
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($digest -ne $runtimePin.Groups['hash'].Value) { throw 'Private runtime archive hash does not match production.' }
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtimeDestination 'extracted')
$privateBinaries = @(Get-ChildItem -LiteralPath (Join-Path $runtimeDestination 'extracted') -Recurse -File -Filter 'java.exe')
if ($privateBinaries.Count -ne 1) { throw 'The verified archive must contain exactly one Java launcher.' }
$privateJava = $privateBinaries[0]
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $privateJava.FullName
$start.ArgumentList.Add('--version')
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.Environment['PATH'] = Join-Path $env:SystemRoot 'System32'
$start.Environment.Remove('JAVA_HOME') | Out-Null
$start.Environment.Remove('JRE_HOME') | Out-Null
$runtimeProcess = [Diagnostics.Process]::Start($start)
$stdout = $runtimeProcess.StandardOutput.ReadToEndAsync()
$stderr = $runtimeProcess.StandardError.ReadToEndAsync()
if (!$runtimeProcess.WaitForExit(10000)) { $runtimeProcess.Kill(); throw 'Private Java version check timed out.' }
$version = $stdout.Result + $stderr.Result
if ($runtimeProcess.ExitCode -ne 0 -or $version -notmatch '(?m)^(?:openjdk|java)(?: version)?[ "]+21[.\s"]') { throw "Private Java 21 could not start: $version" }
$privateHome = $privateJava.Directory.Parent.FullName
Write-Output "Verified production-pinned private Java 21 without system Java on PATH: $digest"
Write-Output $version.Trim()
if ($env:GITHUB_OUTPUT) { "java_home=$privateHome" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append }
