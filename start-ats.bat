@echo off
title ATS Career Copilot - Local Server
color 0A
echo.
echo  ========================================
echo   AI Career Copilot ^& ATS Tracker
echo   Starting Local Development Server...
echo  ========================================
echo.

:: Check if Node.js/npx is available
where npx >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or npx is not on PATH.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Kill any existing process on port 8080
echo [INFO] Checking for existing processes on port 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING 2^>nul') do (
    echo [INFO] Killing existing process PID: %%a
    taskkill /PID %%a /F >nul 2>nul
)

echo [INFO] Launching server on http://127.0.0.1:8080
echo [INFO] Press Ctrl+C to stop the server.
echo.

:: Start http-server and auto-open browser
cd /d "%~dp0"
npx -y http-server -p 8080 -o -c-1

pause
