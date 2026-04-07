import { TradeSignal } from './types';

type SignalHandler = (signal: TradeSignal) => Promise<void>;

/**
 * Processes trade signals one at a time, in arrival order.
 *
 * Why: if the master fires two signals within milliseconds (e.g. entry on
 * two symbols), Playwright needs to finish the first click sequence before
 * starting the second — otherwise both compete for the browser at the same time.
 */
export class SignalQueue {
  private readonly queue: TradeSignal[] = [];
  private processing = false;

  constructor(private readonly handler: SignalHandler) {}

  enqueue(signal: TradeSignal): void {
    this.queue.push(signal);
    console.log(
      `[Queue] Signal queued: ${signal.type} ${signal.symbol} ` +
        `(queue depth: ${this.queue.length})`,
    );
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const signal = this.queue.shift()!;

    console.log(`[Queue] Processing: ${signal.type} ${signal.symbol}`);

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

  get size(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }
}
