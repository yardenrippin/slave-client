#!/bin/bash
# Launches Chrome with remote debugging enabled so Playwright can control it.
# After Chrome opens, navigate to TradingView and activate the Order Panel.

TRADINGVIEW_URL="https://www.tradingview.com/chart/"
DEBUG_PORT=9222

# Kill any existing Chrome instance on this debug port
lsof -ti tcp:$DEBUG_PORT | xargs kill -9 2>/dev/null

echo "Starting Chrome with remote debugging on port $DEBUG_PORT..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=$DEBUG_PORT \
    --no-first-run \
    --no-default-browser-check \
    "$TRADINGVIEW_URL" &
else
  # Linux
  google-chrome \
    --remote-debugging-port=$DEBUG_PORT \
    --no-first-run \
    --no-default-browser-check \
    "$TRADINGVIEW_URL" &
fi

echo "Chrome started. Please:"
echo "  1. Log in to TradingView"
echo "  2. Open your chart"
echo "  3. Activate the Order Panel (connect your broker)"
echo "  4. Then run: npm start"
