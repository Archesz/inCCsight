@echo off
setlocal EnableDelayedExpansion
title inCCsight

echo.
echo ================================================
echo   inCCsight
echo ================================================
echo.

:: ── Validate setup ────────────────────────────────────────────────────────────
if not exist "methods\venv\Scripts\python.exe" (
    echo ERROR: Python venv not found.
    echo        Run setup.bat first.
    pause & exit /b 1
)

if not exist "node_modules" (
    echo ERROR: Node modules not found.
    echo        Run setup.bat first.
    pause & exit /b 1
)

:: ── Activate venv so Express can find Python ──────────────────────────────────
call methods\venv\Scripts\activate.bat

:: ── Start app ─────────────────────────────────────────────────────────────────
echo   App:        http://localhost:3000
echo   API server: http://localhost:3001
echo.
echo   Close this window to stop inCCsight.
echo.

:: Open browser after a short delay
start /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

:: Start both servers
npm run dev
