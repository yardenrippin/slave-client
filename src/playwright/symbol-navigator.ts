/**
 * Symbol navigation — switch the TradingView chart to any symbol
 * regardless of the current market category filter.
 *
 * Flow:
 *  1. Skip if already on target symbol.
 *  2. Click the symbol search button in the top toolbar.
 *  3. Click the "All" market tab to remove any active filter.
 *  4. Type the symbol into the search input (with human-like delay).
 *  5. Wait for results, press Enter on the first match.
 *  6. Wait for the chart to confirm the new symbol.
 */
import type { Page } from 'playwright-core';
import { SYMBOL_SEARCH, TOP_TOOLBAR } from './selectors';
import { humanClick, humanType, sleep } from './human';

export class SymbolNavigator {
  /** Cached current symbol — avoids redundant navigation. */
  private current: string | null = null;

  constructor(private readonly page: Page) {}

  async navigateTo(symbol: string): Promise<void> {
    const target = symbol.trim().toUpperCase();

    if (this.current === target) {
      // Verify the chart is actually showing this symbol before trusting the cache.
      // The user (or TradingView itself) may have changed it since the last navigation.
      const actual = await this.getChartSymbol();
      if (actual && actual.includes(target)) {
        console.log(`[Symbol] Already on ${target} — skipping`);
        return;
      }
      console.log(
        `[Symbol] Cache said "${target}" but chart shows "${actual ?? 'unknown'}" — re-navigating`,
      );
    }

    console.log(`[Symbol] Navigating to ${target}`);

    await this.openSearchDialog();
    await this.selectAllMarketsTab();
    await this.typeAndSelect(target);
    await this.waitForChartToUpdate(target);

    this.current = target;
    console.log(`[Symbol] Navigation complete — ${target}`);

    // Give TradingView's broker panel time to re-render for the new symbol
    await sleep(this.page, 1200, 1800);
  }

  /** Force-reset the cached symbol — next navigateTo() will always navigate. */
  reset(): void {
    this.current = null;
  }

  /**
   * Read the symbol currently displayed in the top toolbar button.
   * Returns null on any error (so callers treat it as "unknown").
   */
  private async getChartSymbol(): Promise<string | null> {
    try {
      const btn = this.page.locator(TOP_TOOLBAR.symbolSearchButton).first();
      const text = await btn.textContent({ timeout: 1_500 });
      return text?.trim().toUpperCase() ?? null;
    } catch {
      return null;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async openSearchDialog(): Promise<void> {
    const page = this.page;
    const input = page.locator(SYMBOL_SEARCH.input).first();

    // If the dialog is already open (e.g. from a previous interrupted navigation),
    // clicking the button again would CLOSE it. Skip the click in that case.
    const alreadyOpen = await input.isVisible().catch(() => false);
    if (alreadyOpen) {
      console.log('[Symbol] Search dialog already open — reusing');
      return;
    }

    const btn = page.locator(TOP_TOOLBAR.symbolSearchButton).first();
    await humanClick(page, btn);
    await sleep(page, 400, 700);

    // If the input still isn't visible after the first click, retry once.
    // (Can happen if TradingView was mid-animation or had a stale overlay.)
    const appeared = await input
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      console.warn('[Symbol] Search input did not appear — retrying click');
      await humanClick(page, btn);
      await sleep(page, 500, 800);
      await input.waitFor({ state: 'visible', timeout: 5_000 });
    }
  }

  /**
   * Click the "All" tab if it's not already selected. This removes any
   * market filter (Futures, Stocks, etc) so the search returns the
   * top global match for the typed symbol.
   */
  private async selectAllMarketsTab(): Promise<void> {
    const page = this.page;
    const allTab = page.locator(SYMBOL_SEARCH.marketTabAll).first();

    const visible = await allTab.isVisible().catch(() => false);
    if (!visible) {
      console.log('[Symbol] "All" tab not visible — skipping market filter reset');
      return;
    }

    const selected = await allTab.getAttribute('aria-selected').catch(() => null);
    if (selected === 'true') {
      console.log('[Symbol] "All" tab already selected');
      return;
    }

    await humanClick(page, allTab);
    await sleep(page, 200, 400);
    console.log('[Symbol] Switched to "All" market tab');
  }

  private async typeAndSelect(symbol: string): Promise<void> {
    const page = this.page;
    const input = page.locator(SYMBOL_SEARCH.input).first();

    // Hard-clear the input. The search dialog remembers the previous
    // query, and the custom React input doesn't always respect a single
    // Meta+A / Backspace. Steps:
    //   1. Focus via click
    //   2. Playwright .fill('') to clear
    //   3. Triple-click + Backspace as belt-and-braces
    //   4. Verify empty via evaluate, retry if not
    await input.click();
    await sleep(page, 80, 150);
    await input.fill('');
    await sleep(page, 60, 120);
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await sleep(page, 60, 120);

    // Verify empty — if not, fall back to directly setting the value
    // on the underlying DOM and dispatching an input event so React picks it up
    const currentValue = await input.inputValue().catch(() => '');
    if (currentValue.length > 0) {
      console.warn(`[Symbol] Input still has "${currentValue}" — force clearing via DOM`);
      // Bypass TS DOM typing by running as a string snippet in the browser.
      // We use the native setter so React detects the value change.
      await page.evaluate(
        `(function() {
          const el = document.querySelector(${JSON.stringify(SYMBOL_SEARCH.input)});
          if (!el) return;
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          ).set;
          setter.call(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`,
      );
      await sleep(page, 100, 200);
    }

    // Now type the new symbol character by character — no clearFirst
    // because we just did a thorough clear above
    await humanType(page, input, symbol, {
      delayMinMs: 70,
      delayMaxMs: 150,
      clearFirst: false,
    });

    // Wait for the results list to populate
    await sleep(page, 600, 1000);

    // Try to click the first result row. If we can't find it by the
    // preferred selector, fall back to pressing Enter which selects
    // the highlighted first match.
    const firstResult = page.locator(SYMBOL_SEARCH.resultRow).first();
    const resultVisible = await firstResult
      .waitFor({ state: 'visible', timeout: 2_500 })
      .then(() => true)
      .catch(() => false);

    if (resultVisible) {
      await humanClick(page, firstResult);
      console.log('[Symbol] Clicked first result row');
    } else {
      await page.keyboard.press('Enter');
      console.log('[Symbol] Pressed Enter to select first result');
    }
  }

  /**
   * Wait for the chart to reflect the new symbol.
   * We check:
   *  - The #header-toolbar-symbol-search button text matches the symbol.
   *  - OR the page title contains the symbol.
   * Whichever resolves first wins.
   */
  private async waitForChartToUpdate(symbol: string): Promise<void> {
    const page = this.page;

    await page
      .waitForFunction(
        `(function() {
          const btn = document.querySelector('${TOP_TOOLBAR.symbolSearchButton}');
          const fromBtn = btn && btn.textContent && btn.textContent.trim().toUpperCase();
          if (fromBtn && fromBtn.includes(${JSON.stringify(symbol)})) return true;
          return document.title.toUpperCase().includes(${JSON.stringify(symbol)});
        })()`,
        undefined,
        { timeout: 8_000 },
      )
      .catch(() => {
        console.warn(`[Symbol] Chart did not confirm ${symbol} within 8s — continuing`);
      });
  }
}
