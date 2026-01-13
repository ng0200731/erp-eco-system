@echo off
echo ========================================
echo   Testing SMTP Ports
echo ========================================
echo.

echo Testing homegw.bbmail.com.hk:465...
powershell -NoProfile -Command "Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 465 -InformationLevel Detailed"
echo.

echo Testing homegw.bbmail.com.hk:587...
powershell -NoProfile -Command "Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 587 -InformationLevel Detailed"
echo.

echo Testing smtp.bbmail.com.hk:465...
powershell -NoProfile -Command "Test-NetConnection -ComputerName smtp.bbmail.com.hk -Port 465 -InformationLevel Detailed"
echo.

echo Testing smtp.bbmail.com.hk:587...
powershell -NoProfile -Command "Test-NetConnection -ComputerName smtp.bbmail.com.hk -Port 587 -InformationLevel Detailed"
echo.

pause

