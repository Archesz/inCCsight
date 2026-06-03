# scripts/build_package.ps1
# Build the pip-installable wheel for inCCsight (Windows PowerShell version).
#
# Usage:
#   .\scripts\build_package.ps1           # full build
#   .\scripts\build_package.ps1 -NoNpm   # skip React build

param(
    [switch]$NoNpm
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Step 1: React build
if (-not $NoNpm) {
    Write-Host "[1/3] Building React app (npm run build)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "npm run build failed"; exit 1 }
} else {
    Write-Host "[1/3] Skipping React build (-NoNpm)"
}

if (-not (Test-Path "build\index.html")) {
    Write-Error "[ERROR] build\index.html not found. Run npm run build first."
    exit 1
}

# Step 2: Copy to package data
Write-Host "[2/3] Copying build\ -> inccsight\static\ ..."
if (Test-Path "inccsight\static") { Remove-Item -Recurse -Force "inccsight\static" }
Copy-Item -Recurse "build" "inccsight\static"

# Step 3: Build Python wheel
Write-Host "[3/3] Building Python wheel..."
python -m build --wheel
if ($LASTEXITCODE -ne 0) { Write-Error "python -m build failed"; exit 1 }

Write-Host ""
Write-Host "[OK] Done. Wheel is in dist\"
Get-ChildItem dist\*.whl | Select-Object Name, Length
Write-Host ""
Write-Host "Install with:"
$whl = (Get-ChildItem dist\*.whl | Select-Object -Last 1).Name
Write-Host "  pip install dist\$whl"
