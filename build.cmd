@echo off
setlocal

echo.
echo  DevTools Companion for Angular — Build XPI
echo  ============================================
echo.

:: Check Node.js is available
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found. Install it from https://nodejs.org
    exit /b 1
)

:: Move to the directory where this script lives
cd /d "%~dp0"

:: Run the build
node build.js
if errorlevel 1 (
    echo.
    echo  Build failed.
    exit /b 1
)

echo.
pause
