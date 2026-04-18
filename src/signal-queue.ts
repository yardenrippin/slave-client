import { TradeSignal } from './types';

type SignalHandler = (signal: TradeSignal) => Promise<void>;

/** Drop signals older than this — stale trades should not be executed late. */
const SIGNAL_TTL_MS = 5_000;

interface QueuedSignal {
  signal: TradeSignal;
  enqueuedAt: number;
}

/**
 * Processes trade signals one at a time, in arrival order.
 *
 * Why: if the master fires two signals within milliseconds (e.g. entry on
 * two symbols), Playwright needs to finish the first click sequence before
 * starting the second — otherwise both compete for the browser at the same time.
 *
 * TTL: each signal is tagged with an enqueue timestamp. If it has been
 * waiting longer than SIGNAL_TTL_MS when we pick it up, we drop it.
 * This prevents stale entries from firing after a long Playwright hang.
 */
export class SignalQueue {
  private readonly queue: QueuedSignal[] = [];
  private processing = false;

  constructor(private readonly handler: SignalHandler) {}

  enqueue(signal: TradeSignal): void {
    this.queue.push({ signal, enqueuedAt: Date.now() });
    console.log(
      `[Queue] Signal queued: ${signal.type} ${signal.symbol} ` +
        `${this.tradeIdLabel(signal)}(depth: ${this.queue.length})`,
    );
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;

    // Drop stale signals from the front of the queue before picking one
    while (this.queue.length > 0) {
      const head = this.queue[0];
      const age = Date.now() - head.enqueuedAt;
      if (age <= SIGNAL_TTL_MS) break;

      this.queue.shift();
      console.warn(
        `[Queue] Dropped stale signal: ${head.signal.type} ${head.signal.symbol} ` +
          `${this.tradeIdLabel(head.signal)}(age: ${age}ms > ${SIGNAL_TTL_MS}ms TTL)`,
      );
    }

    if (this.queue.length === 0) return;

    this.processing = true;
    const { signal } = this.queue.shift()!;

    console.log(
      `[Queue] Processing: ${signal.type} ${signal.symbol} ${this.tradeIdLabel(signal)}`,
    );

    try {
      await this.handler(signal);
      console.log(`[Queue] Done: ${signal.type} ${signal.symbol}`);
    } catch (err) {
      console.error(
        `[Queue] Failed: ${signal.type} ${signal.symbol} — ${(err as Error).message}`,
      );
    }

    this.processing = false;
    this.processNext();
  }

  private tradeIdLabel(signal: TradeSignal): string {
    return signal.tradeId ? `[${signal.tradeId}] ` : '';
  }

  get size(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }
}
