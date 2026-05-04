@echo off
setlocal EnableDelayedExpansion
title inCCsight Docker

echo.
echo ================================================
echo   inCCsight -- Docker
echo ================================================
echo.

:: ── Check Docker ─────────────────────────────────────────────────────────────
where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker not found.
    echo.
    echo Install Docker Desktop from:
    echo https://docs.docker.com/desktop/install/windows-install/
    echo.
    pause & exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker daemon is not running.
    echo        Start Docker Desktop and try again.
    pause & exit /b 1
)

:: ── .env check ───────────────────────────────────────────────────────────────
if not exist ".env" (
    copy .env.example .env >nul
    echo   .env created from .env.example
    echo   Edit SUBJECTS_DIR in .env to point to your DTI data folder.
    echo.
)

:: ── GPU detection ─────────────────────────────────────────────────────────────
set COMPOSE_FILES=-f docker-compose.yml
nvidia-smi >nul 2>&1
if not errorlevel 1 (
    echo   NVIDIA GPU detected -- using GPU compose override.
    set COMPOSE_FILES=-f docker-compose.yml -f docker-compose.gpu.yml
)

:: ── Check if already running ──────────────────────────────────────────────────
docker compose ps 2>nul | findstr "running" >nul
if not errorlevel 1 (
    echo   inCCsight is already running.
    start http://localhost:3001
    exit /b 0
)

:: ── Start ─────────────────────────────────────────────────────────────────────
echo   Building and starting containers...
echo   (First run may take several minutes)
echo.

docker compose %COMPOSE_FILES% up -d --build
if errorlevel 1 (
    echo ERROR: docker compose failed. Check the output above.
    pause & exit /b 1
)

:: Wait for server
echo   Waiting for server to be ready...
:wait
timeout /t 3 /nobreak >nul
curl -sf http://localhost:3001/api/ping >nul 2>&1
if errorlevel 1 goto wait

echo.
echo ================================================
echo   inCCsight is running at http://localhost:3001
echo ================================================
echo.
echo   To stop:   docker compose down
echo   Logs:      docker compose logs -f
echo.

start http://localhost:3001
