#!/bin/bash
# Launches Chrome with remote debugging enabled so Playwright can control it.
# After Chrome opens, log in to TradingView and activate the Order Panel.

TRADINGVIEW_URL="https://www.tradingview.com/chart/"
DEBUG_PORT=9222

# Kill ALL existing Chrome instances first.
# Must kill the whole process, not just the port — otherwise Chrome ignores
# the --remote-debugging-port flag and opens in the existing session.
echo "Killing any existing Chrome..."
pkill -9 "Google Chrome" 2>/dev/null
pkill -9 "chrome" 2>/dev/null
sleep 1

echo "Starting Chrome with remote debugging on port $DEBUG_PORT..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  # --user-data-dir is required — without it Chrome opens in the existing
  # session and silently ignores --remote-debugging-port.
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=$DEBUG_PORT \
    --user-data-dir=/tmp/chrome-tradingview \
    --no-first-run \
    --no-default-browser-check \
    "$TRADINGVIEW_URL" &
else
  # Linux
  google-chrome \
    --remote-debugging-port=$DEBUG_PORT \
    --user-data-dir=/tmp/chrome-tradingview \
    --no-first-run \
    --no-default-browser-check \
    "$TRADINGVIEW_URL" &
fi

echo ""
echo "Chrome started on port $DEBUG_PORT."
echo ""
echo "Next steps:"
echo "  1. Log in to TradingView in the Chrome window"
echo "  2. Open a chart (any symbol)"
echo "  3. Connect your broker — make sure the Buy/Sell buttons are visible"
echo "  4. Run in a new terminal:  npm start"
echo ""
echo "To verify Chrome debug is active:"
echo "  curl http://localhost:$DEBUG_PORT/json"
