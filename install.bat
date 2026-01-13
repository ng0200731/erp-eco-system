@echo off
echo ========================================
echo   ERP Email Service - Installing...
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

echo Installing dependencies...
call npm install

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   Installation completed successfully!
    echo ========================================
    echo.
    echo Next steps:
    echo 1. Copy env.example to env
    echo 2. Edit env file with your email credentials
    echo 3. Run start.bat to start the server
    echo.
) else (
    echo.
    echo ERROR: Installation failed!
    echo.
)

pause

