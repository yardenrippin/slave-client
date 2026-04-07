import { config } from './config';
import { SlaveWsClient } from './ws-client';
import { SignalQueue } from './signal-queue';
import { TradeSignal } from './types';

// ── Placeholder executor — replaced in Mission 5 with Playwright ─────────────
async function executeTrade(signal: TradeSignal): Promise<void> {
  if (signal.type === 'entry') {
    console.log(
      `[Executor] ENTRY — ${signal.action} ${signal.quantity}x ${signal.symbol} ` +
        `(${signal.orderType})` +
        (signal.bracket1 ? ` TP: ${signal.bracket1.price ?? signal.bracket1.offset}` : '') +
        (signal.bracket2 ? ` SL: ${signal.bracket2.stopPrice ?? signal.bracket2.offset}` : ''),
    );
    // TODO Mission 5: Playwright clicks "Buy Mkt" / "Sell Mkt"
  } else {
    console.log(
      `[Executor] EXIT — Close ${signal.symbol} ` +
        `qty: ${signal.quantity === 0 ? 'full' : signal.quantity} ` +
        `reason: ${signal.reason}`,
    );
    // TODO Mission 5: Playwright clicks "Close Position"
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const queue = new SignalQueue(executeTrade);
const wsClient = new SlaveWsClient();

wsClient.on('signal', (signal: TradeSignal) => {
  queue.enqueue(signal);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Main] Shutting down...');
  wsClient.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  wsClient.destroy();
  process.exit(0);
});

console.log('='.repeat(50));
console.log(' Trade Copier — Slave Client');
console.log(`  Account : ${config.accountId}`);
console.log(`  Server  : ${config.serverUrl}`);
console.log('='.repeat(50));

wsClient.connect();
