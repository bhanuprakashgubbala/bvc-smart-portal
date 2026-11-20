@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo        BVC SMART PORTAL - BACKEND STARTUP
echo ============================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python was not found on this computer.
    echo Install Python 3.x from python.org and enable Add Python to PATH.
    pause
    exit /b 1
)

echo Starting the BVC backend directly with server.py...
echo The backend can install its required Flask packages automatically.
echo.

start "BVC Smart Portal Backend" cmd /k "cd /d ""%~dp0"" && python server.py"

for /l %%i in (1,1,30) do (
    powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 goto SERVER_READY
    timeout /t 1 /nobreak >nul
)

echo.
echo [ERROR] The backend did not become ready on port 5000.
echo Check the BVC Smart Portal Backend window for the exact error.
pause
exit /b 1

:SERVER_READY
echo.
echo [OK] Backend is running successfully.
echo [OK] Opening http://127.0.0.1:5000/
start "" "http://127.0.0.1:5000/"
echo.
echo Keep the backend window open while using the portal.
exit /b 0
