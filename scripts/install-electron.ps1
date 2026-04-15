# install-electron.ps1
# Downloads Electron binary to AppData (AV-whitelisted) and wires up path.txt

$ErrorActionPreference = "Stop"

$version    = "28.3.3"
$platform   = "win32"
$arch       = "x64"
$zipName    = "electron-v$version-$platform-$arch.zip"
$url        = "https://github.com/electron/electron/releases/download/v$version/$zipName"

$destDir    = "$env:LOCALAPPDATA\electron-dist\$version"
$exePath    = "$destDir\electron.exe"
$zipTemp    = "$env:TEMP\$zipName"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$pathTxt    = "$projectDir\node_modules\electron\path.txt"

Write-Host "=== Electron $version installer ==="

# ── Download if not cached ──────────────────────────────────────────────────
if (Test-Path $exePath) {
    Write-Host "[OK] Binary already at $exePath"
} else {
    Write-Host "[1/3] Downloading $url ..."
    Invoke-WebRequest -Uri $url -OutFile $zipTemp -UseBasicParsing
    Write-Host "[2/3] Extracting to $destDir ..."
    if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipTemp, $destDir)
    Remove-Item $zipTemp -Force
    Write-Host "[OK] Extracted."
}

# ── Wire up path.txt (must contain only the exe filename, not full path) ────
if (-not (Test-Path (Split-Path $pathTxt))) {
    Write-Host "[ERR] node_modules\electron not found. Run 'npm install --ignore-scripts' first."
    exit 1
}

# index.js does: path.join(__dirname, 'dist', executablePath)
# ELECTRON_OVERRIDE_DIST_PATH bypasses 'dist' and does: path.join(overridePath, executablePath)
# So path.txt = "electron.exe" and ELECTRON_OVERRIDE_DIST_PATH = destDir
Set-Content -Path $pathTxt -Value "electron.exe" -NoNewline
Write-Host "[3/3] path.txt -> electron.exe"
Write-Host "      ELECTRON_OVERRIDE_DIST_PATH = $destDir"
Write-Host ""
Write-Host "Saving env config to .electron-env ..."
Set-Content -Path "$projectDir\.electron-env" -Value $destDir -NoNewline
Write-Host ""
Write-Host "Done! Run: npm run electron:serve"
