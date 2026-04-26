@echo off
:: Launches Chrome with remote debugging enabled so Playwright can control it.
:: After Chrome opens, navigate to TradingView and activate the Order Panel.

set DEBUG_PORT=9222
set TRADINGVIEW_URL=https://www.tradingview.com/chart/

echo Killing any existing Chrome processes...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul

:: Find Chrome — try the most common install locations
set CHROME_EXE=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
)

if "%CHROME_EXE%"=="" (
  echo.
  echo ERROR: Google Chrome not found in any of these locations:
  echo   C:\Program Files\Google\Chrome\Application\chrome.exe
  echo   C:\Program Files ^(x86^)\Google\Chrome\Application\chrome.exe
  echo   %LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
  echo.
  echo Please install Google Chrome from https://www.google.com/chrome
  echo or find chrome.exe manually and update this bat file.
  pause
  exit /b 1
)

echo Found Chrome at: %CHROME_EXE%
echo Starting Chrome with remote debugging on port %DEBUG_PORT%...

start "" "%CHROME_EXE%" ^
  --remote-debugging-port=%DEBUG_PORT% ^
  --no-first-run ^
  --no-default-browser-check ^
  %TRADINGVIEW_URL%

timeout /t 3 /nobreak >nul

echo.
echo Chrome started. Please:
echo   1. Log in to TradingView
echo   2. Open your chart
echo   3. Activate the Order Panel (connect your broker)
echo   4. Then run: npm start
echo.
pause
