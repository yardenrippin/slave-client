/**
 * Order Dialog — everything that happens inside the
 * [data-name="order-dialog-popup"] container.
 *
 * Responsibilities:
 *  - Open the dialog by clicking the chart's buy/sell price button
 *  - Switch side (Buy/Sell) inside the dialog if needed
 *  - Select order type tab (Market/Limit/Stop)
 *  - Set quantity
 *  - Enable and fill TP/SL brackets
 *  - Click the Place Order button
 *  - Close the dialog
 */
import type { Locator, Page } from 'playwright-core';
import { CHART_ORDER_BUTTONS, CONFIRM_DIALOG, ORDER_DIALOG } from './selectors';
import { humanClick, reliableFill, sleep } from './human';

export type OrderSide = 'Buy' | 'Sell';
export type OrderType = 'Market' | 'Limit' | 'Stop';

export interface OrderParams {
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
}

export class OrderDialog {
  constructor(private readonly page: Page) {}

  /**
   * Full end-to-end flow: open dialog, configure, place order, close.
   */
  async placeOrder(params: OrderParams): Promise<void> {
    const dialog = await this.open(params.side);

    try {
      await this.ensureSide(dialog, params.side);
      await this.selectOrderType(dialog, params.type);

      if (params.type !== 'Market' && params.limitPrice != null) {
        // Limit/stop price input is typically the same as quantity area
        // For simplicity we don't yet support setting non-market prices
        // via the dialog — we rely on Market for copy trading.
        console.warn('[OrderDialog] Limit/Stop price setting not yet implemented — placing at current price');
      }

      await this.setQuantity(dialog, params.quantity);

      if (params.takeProfit != null) {
        await this.setTakeProfit(dialog, params.takeProfit);
      }
      if (params.stopLoss != null) {
        await this.setStopLoss(dialog, params.stopLoss);
      }

      await this.clickPlaceOrder(dialog);
      await this.maybeConfirmOrder();
    } finally {
      // Best effort cleanup — don't throw if close fails
      await this.close().catch(() => {});
    }
  }

  // ─── Dialog lifecycle ───────────────────────────────────────────────────

  /**
   * Locate and return the order container — works for both UI shapes:
   *  - Stocks/ETFs: floating popup ([data-name="order-dialog-popup"])
   *  - Futures/Forex: sidebar panel ([data-name="order-panel"])
   *
   * For the popup variant we need to click the chart price button to open it.
   * For the panel variant it's always present — we just click the side control.
   */
  private async open(initialSide: OrderSide): Promise<Locator> {
    const page = this.page;

    const container = page.locator(ORDER_DIALOG.popup).first();

    // Check if the panel is already visible (futures/sidebar variant)
    const alreadyVisible = await container.isVisible().catch(() => false);

    if (!alreadyVisible) {
      // Popup variant — click the chart price button to open it
      await this.closeIfOpen();
      const btnSelector =
        initialSide === 'Buy'
          ? CHART_ORDER_BUTTONS.buyOrderButton
          : CHART_ORDER_BUTTONS.sellOrderButton;

      const btn = page.locator(btnSelector).first();
      await btn.waitFor({ state: 'visible', timeout: 8_000 });
      await humanClick(page, btn);

      await container.waitFor({ state: 'visible', timeout: 8_000 });
      console.log(`[OrderDialog] Popup opened via ${initialSide.toLowerCase()}-order-button`);
    } else {
      console.log('[OrderDialog] Panel already visible (sidebar variant)');
    }

    // Let the container fully render before interacting
    await sleep(page, 300, 500);
    return container;
  }

  private async closeIfOpen(): Promise<void> {
    // Only close popup variant — the sidebar panel is always present
    const closeBtn = this.page.locator(ORDER_DIALOG.closeButton).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {});
      await sleep(this.page, 200, 400);
    }
  }

  async close(): Promise<void> {
    // Only close popup variant — don't close the sidebar panel
    const closeBtn = this.page.locator(ORDER_DIALOG.closeButton).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await humanClick(this.page, closeBtn, { hoverMinMs: 40, hoverMaxMs: 100 });
      console.log('[OrderDialog] Closed');
    }
  }

  // ─── Side, Type, Quantity ───────────────────────────────────────────────

  /**
   * The chart button determines the initial side, but TradingView
   * sometimes opens the dialog on the opposite side or the user may
   * have switched it. We always re-confirm by clicking the matching
   * side-control button inside the dialog.
   */
  private async ensureSide(dialog: Locator, side: OrderSide): Promise<void> {
    const selector =
      side === 'Buy' ? ORDER_DIALOG.sideBuy : ORDER_DIALOG.sideSell;
    const btn = dialog.locator(selector).first();

    const visible = await btn.isVisible().catch(() => false);
    if (!visible) {
      throw new Error(`[OrderDialog] Side control not visible: ${side}`);
    }

    // Check if already active (has "active" in className)
    const isActive = await btn
      .evaluate((el) => el.className.toLowerCase().includes('active'))
      .catch(() => false);

    if (isActive) {
      console.log(`[OrderDialog] Side already ${side}`);
      return;
    }

    await humanClick(this.page, btn);
    console.log(`[OrderDialog] Switched side to ${side}`);
    await sleep(this.page, 150, 300);
  }

  private async selectOrderType(dialog: Locator, type: OrderType): Promise<void> {
    const tab = dialog.locator(ORDER_DIALOG.typeTab(type)).first();
    await tab.waitFor({ state: 'visible', timeout: 5_000 });

    const selected = await tab.getAttribute('aria-selected').catch(() => null);
    if (selected === 'true') {
      console.log(`[OrderDialog] Order type already ${type}`);
      return;
    }

    await humanClick(this.page, tab);
    console.log(`[OrderDialog] Order type set to ${type}`);
    await sleep(this.page, 150, 300);
  }

  private async setQuantity(dialog: Locator, qty: number): Promise<void> {
    const input = dialog.locator(ORDER_DIALOG.quantityInput).first();
    await input.waitFor({ state: 'visible', timeout: 5_000 });

    await reliableFill(this.page, input, String(qty));
    console.log(`[OrderDialog] Quantity set to ${qty}`);
  }

  // ─── Brackets (TP / SL) ────────────────────────────────────────────────

  private async setTakeProfit(dialog: Locator, price: number): Promise<void> {
    await this.ensureBracketEnabled(dialog, 'tp');

    const input = dialog.locator(ORDER_DIALOG.takeProfitInput).first();
    await input.waitFor({ state: 'visible', timeout: 5_000 });

    // The input is often readonly until you interact — a click usually wakes it
    await humanClick(this.page, input);
    await reliableFill(this.page, input, String(price));
    console.log(`[OrderDialog] Take Profit set to ${price}`);
  }

  private async setStopLoss(dialog: Locator, price: number): Promise<void> {
    await this.ensureBracketEnabled(dialog, 'sl');

    const input = dialog.locator(ORDER_DIALOG.stopLossInput).first();
    await input.waitFor({ state: 'visible', timeout: 5_000 });

    await humanClick(this.page, input);
    await reliableFill(this.page, input, String(price));
    console.log(`[OrderDialog] Stop Loss set to ${price}`);
  }

  /**
   * TradingView uses a switch-style checkbox for TP/SL. When unchecked,
   * the price input is readonly. Click the switch to enable it before
   * filling the price.
   */
  private async ensureBracketEnabled(
    dialog: Locator,
    type: 'tp' | 'sl',
  ): Promise<void> {
    const selector =
      type === 'tp'
        ? ORDER_DIALOG.takeProfitToggle
        : ORDER_DIALOG.stopLossToggle;

    const toggle = dialog.locator(selector).first();
    const checked = await toggle
      .getAttribute('aria-checked')
      .catch(() => 'false');

    if (checked === 'true') {
      return; // already enabled
    }

    // The actual clickable element may be the parent/label — clicking
    // the input itself can miss. Use the ancestor label if one exists.
    const clickTarget = dialog
      .locator(`label:has(${selector}), ${selector}`)
      .first();

    await humanClick(this.page, clickTarget);
    console.log(`[OrderDialog] Enabled ${type.toUpperCase()} bracket`);
    await sleep(this.page, 200, 400);
  }

  // ─── Submit ────────────────────────────────────────────────────────────

  private async clickPlaceOrder(dialog: Locator): Promise<void> {
    const btn = dialog.locator(ORDER_DIALOG.placeOrderButton).first();
    await btn.waitFor({ state: 'visible', timeout: 5_000 });

    // Verify the button isn't disabled (e.g. insufficient balance)
    const disabled = await btn
      .evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true')
      .catch(() => false);

    if (disabled) {
      throw new Error('[OrderDialog] Place Order button is disabled — order rejected');
    }

    await humanClick(this.page, btn, { hoverMinMs: 150, hoverMaxMs: 300 });
    console.log('[OrderDialog] Place order submitted');
  }

  /**
   * Some TradingView configurations show a confirmation modal
   * after clicking Place Order. If one appears within 2s, accept it.
   */
  private async maybeConfirmOrder(): Promise<void> {
    const page = this.page;

    const confirmBtn = page
      .locator('button, [role="button"]')
      .filter({ hasText: CONFIRM_DIALOG.yesButtonRegex })
      .first();

    const appeared = await confirmBtn
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);

    if (appeared) {
      await humanClick(page, confirmBtn);
      console.log('[OrderDialog] Confirmation dialog accepted');
    }
  }
}
