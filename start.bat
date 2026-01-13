@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ERP Email Service - Starting...
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Checking Node.js version...
node --version
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [2/3] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
) else (
    echo [2/3] Dependencies already installed.
    echo.
)

REM Check if env file exists
if not exist "env" (
    echo WARNING: env file not found!
    echo Please copy env.example to env and fill in your credentials.
    echo.
    pause
)

echo [3/4] Checking for existing server and killing old process...
REM Get port from env file or use default
set SERVER_PORT=3001
if exist env (
    for /f "tokens=2 delims==" %%a in ('findstr /C:"PORT=" env') do (
        set SERVER_PORT=%%a
    )
)

REM Kill any process on the port (simple approach)
echo Checking port %SERVER_PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%SERVER_PORT%" ^| findstr "LISTENING"') do (
    echo Killing process PID: %%p
    taskkill /PID %%p /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [4/4] Starting server...
echo.
echo Server will start on: http://localhost:%SERVER_PORT%
echo Browser will open automatically in a few seconds...
echo.
echo ========================================
echo.

REM Start server in a new window
start "ERP Email Service Server" cmd /k "npm start"

REM Wait for server to start
echo Waiting for server to start...
timeout /t 5 /nobreak >nul

REM Try to open browser
echo Opening browser...
start http://localhost:%SERVER_PORT%

echo.
echo ========================================
echo   Server started!
echo ========================================
echo.
echo Server is running in a separate window.
echo Browser should open automatically.
echo.
echo To stop the server:
echo   - Close the server window, or
echo   - Press Ctrl+C in the server window
echo.
pause
