@echo off
setlocal enabledelayedexpansion

set DEBUG_PORT=9222
set TRADINGVIEW_URL=https://www.tradingview.com/chart/

echo Killing any existing Chrome processes...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul

:: Find Chrome — check common install locations
set "CHROME_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined CHROME_EXE (
    echo.
    echo ERROR: Google Chrome not found. Please install it from https://www.google.com/chrome
    pause
    exit /b 1
)

echo Found Chrome at: !CHROME_EXE!
echo Starting Chrome with remote debugging on port %DEBUG_PORT%...

start "" "!CHROME_EXE!" --remote-debugging-port=%DEBUG_PORT% --user-data-dir="%TEMP%\chrome-tradingview" --no-first-run --no-default-browser-check --new-window %TRADINGVIEW_URL%

timeout /t 3 /nobreak >nul

echo.
echo Chrome started. Please:
echo   1. Log in to TradingView
echo   2. Open your chart
echo   3. Activate the Order Panel (connect your broker)
echo   4. Then run: npm start
echo.
pause
