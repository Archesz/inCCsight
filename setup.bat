@echo off
setlocal EnableDelayedExpansion
title inCCsight Setup

echo.
echo ================================================
echo   inCCsight -- Local Setup
echo ================================================
echo.

:: ── Check Python ─────────────────────────────────────────────────────────────
echo [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found.
    echo        Install from https://www.python.org/downloads/
    echo        Make sure to check "Add Python to PATH" during install.
    pause & exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo   Python %PY_VER% found.

:: Block Python 3.13+ — the pinned stack (torch 2.4.1, scipy 1.11, pandas 2.1)
:: has no pre-built wheels for it, so the install would fail midway.
for /f %%m in ('python -c "import sys; print(sys.version_info.minor)"') do set PY_MINOR=%%m
for /f %%M in ('python -c "import sys; print(sys.version_info.major)"') do set PY_MAJOR=%%M
if %PY_MAJOR% EQU 3 (
    if %PY_MINOR% GEQ 13 (
        echo.
        echo   ERROR: Python %PY_VER% is not supported.
        echo   inCCsight needs Python 3.10, 3.11 or 3.12 ^(PyTorch 2.4 and the
        echo   pinned scientific packages have no builds for Python 3.13+^).
        echo   Install Python 3.11 from https://www.python.org/downloads/
        echo   and run setup.bat again.
        echo.
        pause
        exit /b 1
    )
)

:: ── Create Python venv ────────────────────────────────────────────────────────
echo.
echo [2/5] Creating Python virtual environment...
python -m venv methods\venv
if errorlevel 1 ( echo ERROR creating venv. & pause & exit /b 1 )
call methods\venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
echo   Virtual environment: methods\venv

:: ── Install PyTorch ───────────────────────────────────────────────────────────
echo.
echo [3/5] Installing PyTorch...
set TORCH_URL=https://download.pytorch.org/whl/cpu

nvidia-smi >nul 2>&1
if not errorlevel 1 (
    echo   NVIDIA GPU detected.
    echo   Checking CUDA version...
    for /f "tokens=9" %%c in ('nvidia-smi ^| findstr "CUDA Version"') do set CUDA_VER=%%c
    echo   CUDA %CUDA_VER%
    echo   NOTE: Edit setup.bat to select the correct CUDA wheel URL if needed.
    echo   Defaulting to CUDA 12.1 wheels.
    set TORCH_URL=https://download.pytorch.org/whl/cu121
) else (
    echo   No NVIDIA GPU detected -- installing CPU-only PyTorch.
)

pip install torch==2.4.1 torchvision==0.19.1 --index-url %TORCH_URL% --quiet
if errorlevel 1 ( echo ERROR installing PyTorch. & pause & exit /b 1 )
echo   PyTorch installed.

:: ── Install Python requirements ───────────────────────────────────────────────
echo.
echo [4/5] Installing Python packages...
pip install -r methods\requirements.txt --quiet
if errorlevel 1 ( echo ERROR installing requirements. & pause & exit /b 1 )
call methods\venv\Scripts\deactivate.bat
echo   Python packages installed.

:: ── Install Node.js dependencies ──────────────────────────────────────────────
echo.
echo [5/5] Installing Node.js packages...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found.
    echo        Install from https://nodejs.org/en/download/
    pause & exit /b 1
)
for /f %%v in ('node --version') do echo   Node.js %%v found.
npm install --legacy-peer-deps --silent
if errorlevel 1 ( echo ERROR installing Node packages. & pause & exit /b 1 )
echo   Node packages installed.

:: ── Copy .env ─────────────────────────────────────────────────────────────────
if not exist ".env" (
    copy .env.example .env >nul
    echo.
    echo   .env created from .env.example
    echo   Edit SUBJECTS_DIR in .env to point to your DTI data folder.
)

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo ================================================
echo   Setup complete!
echo ================================================
echo.
echo   To start inCCsight, run:  start.bat
echo.
echo   -----------------------------------------------
echo   Model files ship with the repository:
echo   -----------------------------------------------
echo.
echo   [CNN model]  .ckpt files are in methods\CNNBased\peso\ (regular git).
echo   [QC model]   .pth is stored via Git LFS. If methods\models\*.pth is
echo                only a few KB (an LFS pointer), fetch the real file with:
echo                    git lfs pull
echo.
pause
