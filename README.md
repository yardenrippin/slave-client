# Trade Copier — Slave Client

Runs on a follower's machine. Receives trade signals from the master server via WebSocket and executes them on TradingView using Playwright.

---

## How it works

```
Master server (NestJS)
    │  WebSocket signal (JSON)
    ▼
Slave client (this project)
    │  Playwright CDP
    ▼
Your Chrome → TradingView Order Panel → Buy / Sell / Close
```

Everything runs **locally on your machine**. The master never touches your broker.

---

## Requirements

- Node.js 18+
- Google Chrome (not Chromium, not Edge)
- A TradingView account with a broker connected and the Order Panel visible
- Credentials from the master server operator: `SERVER_URL` and `SLAVE_KEY`

---

## Setup (first time only)

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set:

```env
# WebSocket URL of the master server (provided by the server operator)
SERVER_URL=wss://yourserver.com

# Your unique account ID (provided by the server operator)
ACCOUNT_ID=apex_eval_1

# Your secret key (provided by the server operator)
SLAVE_KEY=your-secret-key-here

# Local Chrome debug port — leave this as 9222 unless you have a reason to change it
CHROME_DEBUG_PORT=9222
```

> **Each follower gets their own `ACCOUNT_ID` and `SLAVE_KEY`** — the server operator creates these and sends them to you. Never share your key with anyone else.

> **`CHROME_DEBUG_PORT`** is just a local port on your own machine. It is not shared with anyone. Port `9222` is the standard; only change it if something else on your computer is already using that port.

---

## Running (every session)

You must do these steps **in order** each time you want to copy trades.

### Step 1 — Start Chrome with remote debugging

**Windows:** double-click `start-chrome.bat`

**Mac / Linux:** run in terminal:
```bash
bash start-chrome.sh
```

This opens Chrome on TradingView. Do **not** close this terminal window.

### Step 2 — Set up TradingView in Chrome

In the Chrome window that just opened:
1. Log in to TradingView
2. Open your chart (the symbol you want to trade)
3. Connect your broker and make sure the **Order Panel** is visible on the right side (the panel with Buy / Sell buttons)

### Step 3 — Start the slave client

In a **new** terminal:
```bash
npm start
```

You should see:
```
==================================================
 Trade Copier — Slave Client
  Account : apex_eval_1
  Server  : wss://yourserver.com
==================================================
[WS] Connecting to wss://yourserver.com as "apex_eval_1"...
[WS] Connected to master server
[WS] Server confirmed connection — label: "Trader John"
```

The client is now live and waiting for signals.

---

## What happens when a signal arrives

1. Master fires a webhook signal (from TradingView alert)
2. Your client receives it via WebSocket instantly (~10ms)
3. Playwright clicks Buy/Sell (or Close Position) on your TradingView tab
4. Order is placed through your own broker session

Signals are processed **one at a time in order** — if two arrive at the same time, the second waits for the first to finish.

---

## Troubleshooting

### "Cannot find TradingView chart tab"
- Make sure Chrome was started with `start-chrome.bat` / `start-chrome.sh`, not opened normally
- Make sure you have a TradingView **chart** tab open (URL must contain `tradingview.com/chart`)

### "Connection refused" / cannot connect to server
- Check `SERVER_URL` in your `.env` — must start with `wss://` (or `ws://` for local testing)
- Ask the server operator if the server is running

### "Invalid secret key" / disconnected immediately
- Check `SLAVE_KEY` in your `.env` — must match exactly what the server operator gave you
- Keys are case-sensitive

### Port 9222 already in use
- Another Chrome is already running with remote debugging, or something else uses port 9222
- Either close the other Chrome, or change `CHROME_DEBUG_PORT` in `.env` and update the port in the start script

### Client disconnects and reconnects repeatedly
- Normal if the server restarts — the client reconnects automatically (up to 10 attempts with backoff)
- If it keeps failing, check your internet connection and the server status

---

## Notes

- **One chart per slave.** The client looks for the first open TradingView chart tab. If you have multiple charts open, it picks the first one. For now, each slave follows one symbol.
- **Keep Chrome open.** If you close Chrome, the slave loses its Playwright connection and will error.
- **Keep the terminal open.** Closing the `npm start` terminal stops signal processing.
- Error screenshots are saved as `error-<timestamp>.png` in the project folder when Playwright fails to click.
