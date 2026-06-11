# Yomikura local desktop readiness check (lightweight — no full Tauri release build)
# Full installers are built on GitHub Actions; this script validates your dev machine.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$ok = 0
$warn = 0
$fail = 0

function Pass($msg) { Write-Host "[OK]   $msg" -ForegroundColor Green; $script:ok++ }
function Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow; $script:warn++ }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:fail++ }

Write-Host "`n=== Yomikura Desktop Readiness ===" -ForegroundColor Cyan
Write-Host "Project: $root`n"

# Node.js
try {
  $nodeVer = (node -v 2>$null).Trim()
  if ($nodeVer -match "v(\d+)") {
    $major = [int]$Matches[1]
    if ($major -ge 20) { Pass "Node.js $nodeVer" } else { Warn "Node.js $nodeVer (recommend v20+)" }
  } else { Fail "Node.js not found" }
} catch { Fail "Node.js not found" }

# pnpm
try {
  $pnpmVer = (pnpm -v 2>$null).Trim()
  if ($pnpmVer) { Pass "pnpm $pnpmVer" } else { Fail "pnpm not found" }
} catch { Fail "pnpm not found — run: corepack enable && corepack prepare pnpm@11.1.2 --activate" }

# Java (needed for local Suwayomi backend when running Tauri)
try {
  $javaVer = (java -version 2>&1 | Select-Object -First 1)
  if ($javaVer -match "version") { Pass "Java: $javaVer" } else { Warn "Java not found — Tauri backend needs Java 17+ (CI bundles JRE for releases)" }
} catch { Warn "Java not found — install Temurin 21 for local Tauri dev" }

# Rust (optional locally — CI builds Tauri)
try {
  $rustVer = (rustc --version 2>$null).Trim()
  if ($rustVer) {
    Pass "Rust $rustVer"
    if ($root -match " ") {
      Warn "Project path contains spaces — local 'cargo build' may fail on Windows; use GitHub Actions for release builds"
    }
  } else { Warn "Rust not installed — skip local Tauri builds; GitHub Actions handles releases" }
} catch { Warn "Rust not installed — GitHub Actions handles Tauri/release builds" }

# Dependencies
if (Test-Path "node_modules") { Pass "node_modules present" } else { Warn "Run: pnpm install" }

# Typecheck + frontend build (your CPU — fast)
Write-Host "`n--- Running typecheck ---" -ForegroundColor Cyan
pnpm run typecheck
if ($LASTEXITCODE -eq 0) { Pass "TypeScript check passed" } else { Fail "TypeScript check failed" }

Write-Host "`n--- Running frontend build ---" -ForegroundColor Cyan
pnpm run build
if ($LASTEXITCODE -eq 0) { Pass "Vite production build passed" } else { Fail "Frontend build failed" }

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $ok  Warnings: $warn  Failed: $fail"

if ($fail -gt 0) {
  Write-Host "`nFix failures above before developing." -ForegroundColor Red
  exit 1
}

Write-Host "`nYour desktop is ready for local web dev:  pnpm dev" -ForegroundColor Green
Write-Host "For Tauri desktop testing: pnpm tauri dev (Rust required; path-with-spaces may block Windows builds)" -ForegroundColor Gray
Write-Host "Release installers: push to main — GitHub Actions publish.yml builds all platforms.`n" -ForegroundColor Gray
exit 0