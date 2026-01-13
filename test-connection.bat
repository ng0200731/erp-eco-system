@echo off
echo ========================================
echo   SMTP Connection Test
echo ========================================
echo.
echo Testing connection to homegw.bbmail.com.hk:465
echo.

echo [1/3] Testing DNS resolution...
nslookup homegw.bbmail.com.hk
echo.

echo [2/3] Testing port 465 connectivity...
powershell -NoProfile -Command "Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 465 -InformationLevel Detailed"
echo.

echo [3/3] Testing alternative port 587...
powershell -NoProfile -Command "Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 587 -InformationLevel Detailed"
echo.

echo ========================================
echo   Results:
echo ========================================
echo If port 465 shows "TcpTestSucceeded: False"
echo   - Your firewall is blocking outbound port 465
echo   - OR the SMTP server firewall is blocking your IP
echo   - OR you need VPN to access the server
echo.
echo If port 587 works but 465 doesn't:
echo   - Try changing SMTP_PORT=587 and SMTP_SECURE=false in env file
echo.
pause

