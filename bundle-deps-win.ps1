# bundle-deps-win.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Pre-build script: assembles the self-contained `python/` bundle that gets
# packed into the Windows installer via electron-builder extraResources.
#
# Bundles:
#   • Python 3.12 embeddable (portable, no system install needed)
#   • pip packages: pymupdf, pytesseract, pillow, pikepdf
#   • Tesseract OCR binary + English tessdata
#
# Run once before `npm run dist:win`.  Safe to re-run (skips existing files).
#
# Requirements (one-time, on the BUILD machine only – NOT on end-user machines):
#   • Tesseract installed at C:\Program Files\Tesseract-OCR
#     → https://github.com/UB-Mannheim/tesseract/releases
#   • Internet access (downloads Python embeddable if not already present)
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$PythonVersion = "3.12.9",
    [switch]$Force           # Re-download / re-install everything
)

$ErrorActionPreference = "Stop"
$ScriptDir  = $PSScriptRoot
$PythonDest = Join-Path $ScriptDir "python"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DraftoSLP – Windows dependency bundler" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

# ── 1. Python embeddable ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "── Python $PythonVersion embeddable ────────────────────────────────" -ForegroundColor Cyan

$PythonExe = Join-Path $PythonDest "python.exe"
$PythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonZip    = Join-Path $env:TEMP "python-embed-amd64.zip"

if ($Force -or -not (Test-Path $PythonExe)) {
    Write-Host "  Downloading Python $PythonVersion embeddable..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $PythonDest -Force | Out-Null
    Invoke-WebRequest -Uri $PythonZipUrl -OutFile $PythonZip -UseBasicParsing
    Write-Host "  Extracting..." -ForegroundColor Gray
    Expand-Archive -Path $PythonZip -DestinationPath $PythonDest -Force
    Remove-Item $PythonZip -Force
    Write-Host "  ✅ Python extracted" -ForegroundColor Green
} else {
    Write-Host "  ✅ Already present – skipping download" -ForegroundColor Green
}

# ── 2. Enable site-packages (required for pip-installed packages) ─────────────
$pthFile = Get-ChildItem $PythonDest -Filter "python*._pth" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pthFile) {
    $content = Get-Content $pthFile.FullName -Raw
    if ($content -match '#import site') {
        $content = $content -replace '#import site', 'import site'
        Set-Content -Path $pthFile.FullName -Value $content -NoNewline
        Write-Host "  ✅ Enabled site-packages in $($pthFile.Name)" -ForegroundColor Green
    }
}

# ── 3. Bootstrap pip ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "── pip bootstrap ────────────────────────────────────────────────" -ForegroundColor Cyan

$PipExe = Join-Path $PythonDest "Scripts\pip.exe"
if ($Force -or -not (Test-Path $PipExe)) {
    $GetPip = Join-Path $env:TEMP "get-pip.py"
    Write-Host "  Downloading get-pip.py..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPip -UseBasicParsing
    Write-Host "  Installing pip into embeddable Python..." -ForegroundColor Gray
    & $PythonExe $GetPip --no-warn-script-location 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    Remove-Item $GetPip -Force
    if (-not (Test-Path $PipExe)) { throw "pip installation failed" }
    Write-Host "  ✅ pip installed" -ForegroundColor Green
} else {
    Write-Host "  ✅ pip already present" -ForegroundColor Green
}

# ── 4. Install Python packages ────────────────────────────────────────────────
Write-Host ""
Write-Host "── Python packages ──────────────────────────────────────────────" -ForegroundColor Cyan

$packages = @("pymupdf", "pytesseract", "pillow", "pikepdf")
foreach ($pkg in $packages) {
    # Check if already installed (look for the package folder in site-packages)
    $sitePackages = Join-Path $PythonDest "Lib\site-packages"
    $installed = $Force -eq $false -and (Get-ChildItem $sitePackages -Filter "$pkg*" -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
    if (-not $installed) {
        Write-Host "  Installing $pkg..." -ForegroundColor Gray
        & $PipExe install $pkg --no-warn-script-location --quiet
        Write-Host "  ✅ $pkg installed" -ForegroundColor Green
    } else {
        Write-Host "  ✅ $pkg already installed" -ForegroundColor Green
    }
}

# Verify imports work
Write-Host "  Verifying imports..." -ForegroundColor Gray
$verify = & $PythonExe -c "import fitz; import pytesseract; from PIL import Image; import pikepdf; print('OK')" 2>&1
if ($verify -match "OK") {
    Write-Host "  ✅ All packages importable" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Import check: $verify" -ForegroundColor Yellow
}

# ── 5. Tesseract OCR ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "── Tesseract OCR ────────────────────────────────────────────────" -ForegroundColor Cyan

$TesseractSrc  = "C:\Program Files\Tesseract-OCR"
$TesseractDest = Join-Path $PythonDest "tesseract"
$TesseractExe  = Join-Path $TesseractDest "tesseract.exe"

if (-not (Test-Path $TesseractSrc)) {
    Write-Host "  ❌ Tesseract not found at: $TesseractSrc" -ForegroundColor Red
    Write-Host "     Install it from: https://github.com/UB-Mannheim/tesseract/releases" -ForegroundColor Yellow
    Write-Host "     Download: tesseract-ocr-w64-setup-5.x.x.exe  then re-run this script." -ForegroundColor Yellow
    exit 1
}

if ($Force -or -not (Test-Path $TesseractExe)) {
    Write-Host "  Copying Tesseract executables + DLLs..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $TesseractDest -Force | Out-Null

    # Copy exe and all DLLs (skip sub-directories)
    Get-ChildItem $TesseractSrc -File | Where-Object { $_.Extension -in '.exe', '.dll' } |
        Copy-Item -Destination $TesseractDest -Force

    # Copy tessdata – English + OSD only (skip 100+ language packs to keep size small)
    $TessdataDest = Join-Path $TesseractDest "tessdata"
    New-Item -ItemType Directory -Path $TessdataDest -Force | Out-Null
    foreach ($td in @('eng.traineddata', 'osd.traineddata')) {
        $src = Join-Path $TesseractSrc "tessdata\$td"
        if (Test-Path $src) {
            Copy-Item $src $TessdataDest -Force
            Write-Host "  Copied tessdata\$td" -ForegroundColor DarkGray
        } else {
            Write-Host "  ⚠️  $td not found – OCR may fail" -ForegroundColor Yellow
        }
    }

    $exeSize = [math]::Round((Get-Item $TesseractExe).Length / 1MB, 1)
    Write-Host "  ✅ Tesseract bundled (tesseract.exe = $exeSize MB)" -ForegroundColor Green
} else {
    Write-Host "  ✅ Already bundled – skipping copy" -ForegroundColor Green
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
$pythonSize    = [math]::Round((Get-ChildItem $PythonDest -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 0)
Write-Host "  Bundle complete!  python/ = $pythonSize MB" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    npm run dist:win   (builds the installer)" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
