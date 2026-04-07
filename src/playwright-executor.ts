import { chromium, Browser, Page } from 'playwright';
import { config } from './config';
import { EntrySignal, ExitSignal, TradeSignal } from './types';

export class PlaywrightExecutor {
  private browser: Browser | null = null;
  private page: Page | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const cdpUrl = `http://localhost:${config.chromeDebugPort}`;
    console.log(`[Playwright] Connecting to Chrome at ${cdpUrl}...`);

    this.browser = await chromium.connectOverCDP(cdpUrl);

    // Find the TradingView chart tab across all browser contexts
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

    console.log(`[Playwright] Connected to TradingView tab: ${this.page.url()}`);
  }

  async disconnect(): Promise<void> {
    // connectOverCDP — close only the CDP session, not the user's browser
    await this.browser?.close();
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async executeTrade(signal: TradeSignal): Promise<void> {
    if (!this.page) throw new Error('[Playwright] Not connected — call connect() first');

    if (signal.type === 'entry') {
      await this.executeEntry(signal);
    } else {
      await this.executeExit(signal);
    }
  }

  // ─── Entry ────────────────────────────────────────────────────────────────

  private async executeEntry(signal: EntrySignal): Promise<void> {
    console.log(
      `[Playwright] Entry — ${signal.action} ${signal.quantity}x ${signal.symbol}`,
    );

    await this.withErrorScreenshot('setQuantity', () =>
      this.setQuantity(signal.quantity),
    );

    if (signal.action === 'Buy') {
      await this.withErrorScreenshot('clickBuy', () => this.clickBuyButton());
    } else {
      await this.withErrorScreenshot('clickSell', () => this.clickSellButton());
    }

    console.log(
      `[Playwright] Entry done — ${signal.action} ${signal.quantity}x ${signal.symbol}`,
    );
  }

  // ─── Exit ─────────────────────────────────────────────────────────────────

  private async executeExit(signal: ExitSignal): Promise<void> {
    console.log(
      `[Playwright] Exit — Close ${signal.symbol} ` +
        `(${signal.quantity === 0 ? 'full' : signal.quantity + ' contracts'})`,
    );

    await this.withErrorScreenshot('clickClose', () => this.clickCloseButton());

    console.log(`[Playwright] Exit done — ${signal.symbol} closed`);
  }

  // ─── TradingView Order Panel actions ─────────────────────────────────────
  //
  // IMPORTANT: TradingView changes DOM classes regularly.
  // These selectors use text content and roles for maximum resilience.
  // If a selector breaks after a TradingView update, check the Order Panel
  // in Chrome DevTools and update the relevant method below.

  private async setQuantity(qty: number): Promise<void> {
    const page = this.page!;

    // The quantity input sits inside the Order Panel.
    // Try the data-name attribute first (most stable), fall back to positional.
    const selectors = [
      '[data-name="order-panel"] input[type="text"]',
      '[data-name="order-panel"] input[type="number"]',
      '.order-panel input[type="text"]',
    ];

    let input = null;
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        input = el;
        break;
      }
    }

    if (!input) {
      throw new Error(
        'Could not find quantity input in Order Panel. ' +
          'Make sure the Order Panel is visible and your broker is connected.',
      );
    }

    await input.click({ clickCount: 3 }); // select all existing value
    await input.fill(qty.toString());
    console.log(`[Playwright] Quantity set to ${qty}`);
  }

  private async clickBuyButton(): Promise<void> {
    const page = this.page!;

    // TradingView Buy button text varies: "Buy", "Buy Mkt", "Buy Limit"
    // We click the first visible button that starts with "Buy"
    const btn = page
      .locator('button')
      .filter({ hasText: /^Buy/ })
      .first();

    await btn.waitFor({ state: 'visible', timeout: 5_000 });
    await btn.click();
    console.log('[Playwright] Buy button clicked');
  }

  private async clickSellButton(): Promise<void> {
    const page = this.page!;

    const btn = page
      .locator('button')
      .filter({ hasText: /^Sell/ })
      .first();

    await btn.waitFor({ state: 'visible', timeout: 5_000 });
    await btn.click();
    console.log('[Playwright] Sell button clicked');
  }

  private async clickCloseButton(): Promise<void> {
    const page = this.page!;

    // "Close Position" or "Flatten" — only appears when a position is open
    const btn = page
      .locator('button')
      .filter({ hasText: /Close Position|Flatten|Close All/ })
      .first();

    await btn.waitFor({ state: 'visible', timeout: 5_000 });
    await btn.click();
    console.log('[Playwright] Close button clicked');

    // TradingView sometimes shows a confirmation dialog — handle it if it appears
    await this.maybeConfirmClose();
  }

  private async maybeConfirmClose(): Promise<void> {
    const page = this.page!;

    // Wait up to 2s for a confirmation dialog — if none, continue silently
    const confirmBtn = page
      .locator('button')
      .filter({ hasText: /^Yes$|^Confirm$|Close Position/ })
      .first();

    const appeared = await confirmBtn
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);

    if (appeared) {
      await confirmBtn.click();
      console.log('[Playwright] Confirmation dialog accepted');
    }
  }

  // ─── Error handling ───────────────────────────────────────────────────────

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
