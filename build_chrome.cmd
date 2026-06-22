@echo off
setlocal

echo.
echo  DevTools Companion for Angular — Build Chrome ZIP
echo  ===================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found. Install it from https://nodejs.org
    exit /b 1
)

cd /d "%~dp0"
node build.js chrome
if errorlevel 1 (
    echo.
    echo  Build failed.
    exit /b 1
)

echo.
pause
