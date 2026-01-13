@echo off
echo ========================================
echo   ERP Email Service - Setup
echo ========================================
echo.

REM Check if env file exists
if exist "env" (
    echo env file already exists.
    echo.
    choice /C YN /M "Do you want to overwrite it"
    if errorlevel 2 goto :skip_copy
)

echo Copying env.example to env...
copy env.example env >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo env file created successfully!
    echo.
    echo IMPORTANT: Please edit the env file and fill in:
    echo   - MAIL_USER (your email address)
    echo   - MAIL_PASS (your email password)
    echo.
    echo Opening env file in notepad...
    timeout /t 2 >nul
    notepad env
) else (
    echo ERROR: Failed to create env file!
    echo Please manually copy env.example to env
)

:skip_copy
echo.
echo Setup complete!
echo Run start.bat to start the server.
echo.
pause

