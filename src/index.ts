import { config } from './config';
import { SlaveWsClient } from './ws-client';
import { SignalQueue } from './signal-queue';
import { PlaywrightExecutor } from './playwright-executor';
import { TradeSignal } from './types';

async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log(' Trade Copier — Slave Client');
  console.log(`  Account : ${config.accountId}`);
  console.log(`  Server  : ${config.serverUrl}`);
  console.log('='.repeat(50));

  // Connect Playwright to the already-open Chrome browser
  const executor = new PlaywrightExecutor();
  await executor.connect();

  // Queue ensures signals are processed one at a time, in order
  const queue = new SignalQueue(async (signal: TradeSignal) => {
    await executor.executeTrade(signal);
  });

  const wsClient = new SlaveWsClient();

  wsClient.on('signal', (signal: TradeSignal) => {
    queue.enqueue(signal);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Main] Shutting down...');
    wsClient.destroy();
    await executor.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  wsClient.connect();
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err.message);
  process.exit(1);
});
