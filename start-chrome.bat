@echo off
:: Launches Chrome with remote debugging enabled so Playwright can control it.
:: After Chrome opens, navigate to TradingView and activate the Order Panel.

set DEBUG_PORT=9222
set TRADINGVIEW_URL=https://www.tradingview.com/chart/

echo Killing any existing Chrome processes...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting Chrome with remote debugging on port %DEBUG_PORT%...

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=%DEBUG_PORT% ^
  --no-first-run ^
  --no-default-browser-check ^
  %TRADINGVIEW_URL%

echo.
echo Chrome started. Please:
echo   1. Log in to TradingView
echo   2. Open your chart
echo   3. Activate the Order Panel (connect your broker)
echo   4. Then run: npm start
echo.
pause
