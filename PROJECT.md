# Trade Copier — Slave Client

## What it does

Runs on a follower's own machine. Connects to the master server via WebSocket, receives trade signals in real-time, and executes them on TradingView by controlling the browser with Playwright — clicking Buy, Sell, or Close Position on the Order Panel.

## How it works

```
Master server  ──→  WebSocket signal  ──→  Slave client
                                               │
                                    Playwright (CDP)
                                               │
                                        Your Chrome
                                               │
                              TradingView Order Panel
                                               │
                             Buy / Sell / Close / Update SL+TP
                                               │
                                     Your broker account
```

## Key design decisions

- **Attaches to your existing Chrome** — does not open a new browser. You log in yourself, connect your broker, the slave just controls the buttons.
- **Signal queue** — signals are processed one at a time in order. If two signals arrive simultaneously, the second waits for the first to finish. No race conditions.
- **Reconnects automatically** — exponential backoff (1s → 2s → 4s → max 30s) if the server goes down.
- **Exits immediately on bad credentials** — if the server rejects your key (code 4001), the client stops instead of retrying forever.

## Key files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — connects Playwright, starts WebSocket, wires up the queue |
| `src/ws-client.ts` | WebSocket connection, reconnect logic, heartbeat (pong) |
| `src/signal-queue.ts` | Ordered async queue — processes one signal at a time |
| `src/playwright-executor.ts` | Connects to Chrome via CDP, clicks Buy/Sell/Close and updates SL/TP on TradingView |
| `src/config.ts` | Loads and validates `.env` |
| `src/types.ts` | TypeScript types for signals received from the server |

## Environment setup

```env
SERVER_URL=wss://yourserver.com     # master server WebSocket URL
ACCOUNT_ID=apex_eval_1              # your account ID (from server operator)
SLAVE_KEY=your-secret-key           # your secret key (from server operator)
CHROME_DEBUG_PORT=9222              # local Chrome debug port (default: 9222)
```

Each follower gets their own `ACCOUNT_ID` and `SLAVE_KEY` from the server operator. Never share your key.

## Running

### Step 1 — Start Chrome with remote debugging

**Windows:** double-click `start-chrome.bat`

**Mac / Linux:**
```bash
bash start-chrome.sh
```

### Step 2 — Set up TradingView

In the Chrome window that opens:
1. Log in to TradingView
2. Open your chart
3. Connect your broker and make the Order Panel visible

### Step 3 — Start the slave client

```bash
npm install
cp .env.example .env   # fill in your values
npm start
```

## Signal types

| Type | Description |
|---|---|
| `entry` | Open a new position — clicks Buy or Sell on the Order Panel |
| `exit` | Close a position — clicks Close Position |
| `update-brackets` | Update Stop Loss and/or Take Profit — edits the bracket cells in the Positions panel |

## What the logs look like

```
==================================================
 Trade Copier — Slave Client
  Account : apex_eval_1
  Server  : wss://yourserver.com
==================================================
[Playwright] Connecting to Chrome at http://localhost:9222...
[Playwright] Connected to TradingView tab: https://www.tradingview.com/chart/...
[WS] Connecting to wss://yourserver.com as "apex_eval_1"...
[WS] Connected to master server
[WS] Server confirmed connection — label: "Trader John"

[WS] Signal received: entry MES Buy x1
[Queue] Signal queued: entry MES (queue depth: 1)
[Queue] Processing: entry MES
[Playwright] Entry — Buy 1x MES
[Playwright] Quantity set to 1
[Playwright] Buy button clicked
[Playwright] Entry done — Buy 1x MES
[Queue] Done: entry MES

[WS] Signal received: update-brackets MES SL: 5750 TP: 5850
[Queue] Signal queued: update-brackets MES (queue depth: 1)
[Queue] Processing: update-brackets MES
[Playwright] Update brackets — MES SL: 5750 TP: 5850
[Playwright] SL set to 5750
[Playwright] TP set to 5850
[Playwright] Update brackets done — MES
[Queue] Done: update-brackets MES
```
