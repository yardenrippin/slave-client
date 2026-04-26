/**
 * PlaywrightExecutor — the public API used by index.ts.
 *
 * This file is intentionally thin — it connects to Chrome, finds the
 * TradingView chart tab, and delegates all UI interactions to the
 * modules in src/playwright/.
 *
 * Architecture:
 *   index.ts
 *     └─ PlaywrightExecutor
 *          ├─ SymbolNavigator  (symbol search + selection)
 *          ├─ OrderDialog      (entry orders, brackets)
 *          └─ PositionManager  (exits, bracket updates)
 */
import { chromium, Browser, Page } from 'playwright-core';
import { config } from './config';
import {
  EntrySignal,
  ExitSignal,
  UpdateBracketsSignal,
  TradeSignal,
} from './types';
import { SymbolNavigator } from './playwright/symbol-navigator';
import { OrderDialog } from './playwright/order-dialog';
import { PositionManager } from './playwright/position-manager';

export class PlaywrightExecutor {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private symbolNavigator: SymbolNavigator | null = null;
  private orderDialog: OrderDialog | null = null;
  private positionManager: PositionManager | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const cdpUrl = `http://127.0.0.1:${config.chromeDebugPort}`;
    console.log(`[Playwright] Connecting to Chrome at ${cdpUrl}...`);

    this.browser = await chromium.connectOverCDP(cdpUrl);

    for (const context of this.browser.contexts()) {
      for (const page of context.pages()) {
        if (page.url().includes('tradingview.com/chart')) {
          this.page = page;
          break;
        }
      }
      if (this.page) break;
    }

    if (!this.page) {
      throw new Error(
        'No TradingView chart tab found. ' +
          'Open a chart at tradingview.com/chart before starting the slave client.',
      );
    }

    // Initialize the modules now that we have a page
    this.symbolNavigator = new SymbolNavigator(this.page);
    this.orderDialog = new OrderDialog(this.page);
    this.positionManager = new PositionManager(this.page);

    console.log(`[Playwright] Connected to TradingView tab: ${this.page.url()}`);
  }

  async disconnect(): Promise<void> {
    // connectOverCDP — close only the CDP session, not the user's browser
    await this.browser?.close().catch(() => {});
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async executeTrade(signal: TradeSignal): Promise<void> {
    this.requireConnected();

    switch (signal.type) {
      case 'entry':
        // Navigate to the symbol before placing an order
        await this.withErrorScreenshot('navigateToSymbol', () =>
          this.symbolNavigator!.navigateTo(signal.symbol),
        );
        return this.executeEntry(signal);

      case 'exit':
      case 'update-brackets':
        // DO NOT navigate — clicking the edit/close button in the positions
        // panel causes TradingView to auto-navigate to the correct chart.
        // Symbol navigation here would switch the chart AWAY from the open
        // position and cause the buttons to target the wrong row.
        return signal.type === 'exit'
          ? this.executeExit(signal)
          : this.executeUpdateBrackets(signal);
    }
  }

  // ─── Entry ───────────────────────────────────────────────────────────────

  private async executeEntry(signal: EntrySignal): Promise<void> {
    console.log(
      `[Playwright] Entry — ${signal.action} ${signal.quantity}x ${signal.symbol}`,
    );

    // TradingView's order dialog has a single price input per bracket —
    // accept whichever of price/stopPrice is populated by the master.
    const takeProfit =
      signal.bracket1?.price ?? signal.bracket1?.stopPrice ?? null;
    const stopLoss =
      signal.bracket2?.stopPrice ?? signal.bracket2?.price ?? null;

    await this.withErrorScreenshot('placeOrder', () =>
      this.orderDialog!.placeOrder({
        side: signal.action,
        type: signal.orderType,
        quantity: signal.quantity,
        limitPrice: signal.price,
        takeProfit,
        stopLoss,
      }),
    );

    console.log(
      `[Playwright] Entry done — ${signal.action} ${signal.quantity}x ${signal.symbol}`,
    );
  }

  // ─── Exit ────────────────────────────────────────────────────────────────

  private async executeExit(signal: ExitSignal): Promise<void> {
    console.log(
      `[Playwright] Exit — ${signal.symbol} ` +
        `(${signal.quantity === 0 ? 'full close' : signal.quantity + ' contracts'})`,
    );

    await this.withErrorScreenshot('closePosition', () =>
      this.positionManager!.closePosition(signal.symbol),
    );

    console.log(`[Playwright] Exit done — ${signal.symbol}`);
  }

  // ─── Update Brackets ─────────────────────────────────────────────────────

  private async executeUpdateBrackets(
    signal: UpdateBracketsSignal,
  ): Promise<void> {
    console.log(
      `[Playwright] Update brackets — ${signal.symbol} ` +
        `SL: ${signal.stopLoss ?? 'unchanged'} TP: ${signal.takeProfit ?? 'unchanged'}`,
    );

    await this.withErrorScreenshot('updateBrackets', () =>
      this.positionManager!.updateBrackets(signal.takeProfit, signal.stopLoss, signal.symbol),
    );

    console.log(`[Playwright] Update brackets done — ${signal.symbol}`);
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  private requireConnected(): void {
    if (!this.page || !this.symbolNavigator || !this.orderDialog || !this.positionManager) {
      throw new Error('[Playwright] Not connected — call connect() first');
    }
  }

  /**
   * Wrap any action so that a failure saves a full-page screenshot
   * with a label prefix. The error is re-thrown so the signal queue
   * marks it as failed.
   */
  private async withErrorScreenshot(
    label: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      const screenshotPath = `error-${label}-${Date.now()}.png`;
      await this.page
        ?.screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => {}); // don't throw if screenshot itself fails
      console.error(
        `[Playwright] "${label}" failed — screenshot saved to ${screenshotPath}`,
      );
      throw err;
    }
  }
}
