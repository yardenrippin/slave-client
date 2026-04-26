/**
 * Position Manager — close an open position and update its TP/SL brackets.
 *
 * TradingView Paper Trading shows open positions in the bottom panel.
 * The edit (✎) and close (>) buttons are visible directly in each row.
 *
 * Strategy for finding the correct row:
 *   Find the leaf DOM element whose text contains the target symbol
 *   (e.g. "BTCUSD" matches "BITSTAMP:BTCUSD"), then walk UP the DOM
 *   until we reach an ancestor that also contains the target button
 *   ([data-name="edit-settings-cell-button"] or "close-settings-cell-button").
 *   That ancestor is the position row — we hover it first (in case buttons
 *   need a hover to become active) then click the button.
 *
 * Close flow:
 *   Open Paper Trading panel → click close button in matching row
 *
 * Update brackets flow:
 *   Open Paper Trading panel → click edit button in matching row
 *   → order panel shows TP/SL inputs → enable toggle → fill price → Modify
 */
import type { Page } from 'playwright-core';
import { ORDER_DIALOG, POSITION_PANEL } from './selectors';
import { humanClick, reliableFill, sleep } from './human';

export class PositionManager {
  constructor(private readonly page: Page) {}

  // ─── Close position ───────────────────────────────────────────────────────

  async closePosition(symbol: string): Promise<void> {
    await this.ensurePositionsTabActive();
    await this.clickRowButton(symbol, 'close-settings-cell-button');
    await this.confirmIfPrompted();
    console.log('[PositionManager] Position closed');
  }

  // ─── Update brackets ─────────────────────────────────────────────────────

  async updateBrackets(
    takeProfit: number | null,
    stopLoss: number | null,
    symbol: string,
  ): Promise<void> {
    const page = this.page;

    await this.ensurePositionsTabActive();
    await this.clickRowButton(symbol, 'edit-settings-cell-button');
    console.log('[PositionManager] Protect Position clicked — order panel loaded');
    await sleep(page, 400, 700);

    if (takeProfit !== null) {
      await this.setBracketPrice('tp', takeProfit);
    }
    if (stopLoss !== null) {
      await this.setBracketPrice('sl', stopLoss);
    }

    const modifyBtn = page.locator(ORDER_DIALOG.placeOrderButton).first();
    await modifyBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await humanClick(page, modifyBtn, { hoverMinMs: 100, hoverMaxMs: 200 });
    console.log('[PositionManager] Modify button clicked — brackets updated');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Two-step panel activation:
   *  1. Open the outer "Paper Trading" panel if it is not already showing.
   *  2. Switch to the "Positions" sub-tab inside it.
   */
  private async ensurePositionsTabActive(): Promise<void> {
    const page = this.page;

    // ── Step 1: open the Paper Trading outer panel if closed ──────────────
    const positionsTab = page.locator(POSITION_PANEL.positionsTab).first();
    const positionsTabVisible = await positionsTab.isVisible().catch(() => false);

    if (!positionsTabVisible) {
      // Try known selectors first, then fall back to button text
      const ptTab = page.locator(POSITION_PANEL.paperTradingTab).first();
      const ptVisible = await ptTab.isVisible().catch(() => false);

      if (ptVisible) {
        await humanClick(page, ptTab, { hoverMinMs: 30, hoverMaxMs: 80 });
        console.log('[PositionManager] Opened Paper Trading panel');
        await sleep(page, 400, 600);
      } else {
        const ptByText = page
          .locator('button, [role="tab"]')
          .filter({ hasText: /^Paper Trading$/i })
          .first();
        if (await ptByText.isVisible().catch(() => false)) {
          await humanClick(page, ptByText, { hoverMinMs: 30, hoverMaxMs: 80 });
          console.log('[PositionManager] Opened Paper Trading panel (text fallback)');
          await sleep(page, 400, 600);
        } else {
          console.warn('[PositionManager] Paper Trading tab not found — panel may be hidden');
        }
      }
    }

    // ── Step 2: switch to the Positions sub-tab ───────────────────────────
    const tab = page.locator(POSITION_PANEL.positionsTab).first();
    const visible = await tab
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);

    if (!visible) {
      console.warn('[PositionManager] Positions tab not visible after opening panel');
      return;
    }

    const selected = await tab.getAttribute('aria-selected').catch(() => null);
    if (selected !== 'true') {
      await humanClick(page, tab, { hoverMinMs: 30, hoverMaxMs: 80 });
      await sleep(page, 400, 600);
    }
  }

  /**
   * Find the action button (close or edit) for the position row that
   * contains `symbol`, then click it.
   *
   * Algorithm (runs in-browser via evaluate):
   *   1. Walk every DOM element to find the LEAF node whose text includes
   *      the symbol (e.g. "BTCUSD" inside "BITSTAMP:BTCUSD"). A leaf node
   *      has no children that also contain the symbol.
   *   2. From that leaf, walk UP until we find an ancestor that contains
   *      the target [data-name] button. That ancestor IS the position row.
   *   3. Return both the row's center coordinates (for hover) and the
   *      button's center coordinates (for click).
   *
   * We hover the row first so that hover-only buttons become visible,
   * then click the button.
   */
  /**
   * Click the action button (close or edit) in the position row matching `symbol`.
   *
   * Two-phase approach:
   *
   *   Phase 1 — find the ROW center.
   *     Walk every DOM element to find the leaf node whose text includes the
   *     symbol. Then walk UP until we reach an ancestor that has the target
   *     button anywhere in its subtree — we only need the ANCESTOR's bounding
   *     rect (always visible), not the button's (may be 0×0 if hover-only).
   *
   *   Hover — move the mouse to the row center. This triggers TradingView's
   *     hover state and makes hidden buttons (e.g. the close button) visible.
   *
   *   Phase 2 — re-run the same DOM walk AFTER hover.
   *     Now the button has a real bounding rect. Return button center and click.
   */
  private async clickRowButton(
    symbol: string,
    buttonDataName: 'close-settings-cell-button' | 'edit-settings-cell-button',
  ): Promise<void> {
    const page = this.page;
    const label = buttonDataName === 'close-settings-cell-button' ? 'Close' : 'Protect';

    // Scoped row search — avoids false matches when the symbol also appears
    // in the watchlist, chart header, or other panels on the page.
    //
    // Algorithm:
    //   1. Find the positions panel by walking UP from button#positions.
    //   2. Query only ROWS (tr / [role="row"]) within that panel.
    //   3. Pick the first row whose text contains the symbol.
    //   4. Phase 1 → return row center (always has a rect, used for hover).
    //      Phase 2 → return button center after hover makes it visible.
    const evalScript = (requireVisible: boolean) =>
      `(function(sym, btnName, requireVisible) {
        // ── Step 1: scope to the positions panel ──────────────────────────
        var searchRoot = document.body;
        var posTab = document.querySelector('button#positions');
        if (posTab) {
          var el = posTab.parentElement;
          while (el && el !== document.body) {
            var r = el.getBoundingClientRect();
            if (r.width > 300 && r.height > 80) { searchRoot = el; break; }
            el = el.parentElement;
          }
        }

        // ── Step 2: find the row that contains our symbol ─────────────────
        var rows = Array.from(searchRoot.querySelectorAll('tr, [role="row"]'));
        var targetRow = null;
        for (var i = 0; i < rows.length; i++) {
          if ((rows[i].textContent || '').indexOf(sym) !== -1) {
            targetRow = rows[i];
            break;
          }
        }
        if (!targetRow) return null;

        // ── Step 3: return coords ─────────────────────────────────────────
        if (requireVisible) {
          var btn = targetRow.querySelector('[data-name="' + btnName + '"]');
          if (!btn) return null;
          var br = btn.getBoundingClientRect();
          if (br.width === 0 || br.height === 0) return null;
          return { x: br.left + br.width / 2, y: br.top + br.height / 2 };
        } else {
          var rr = targetRow.getBoundingClientRect();
          if (rr.width === 0 || rr.height === 0) return null;
          return { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 };
        }
      })(${JSON.stringify(symbol)}, ${JSON.stringify(buttonDataName)}, ${requireVisible})`;

    // ── Phase 1: find and hover the row ──────────────────────────────────
    const rowCenter = await page.evaluate(evalScript(false)) as { x: number; y: number } | null;

    if (!rowCenter) {
      throw new Error(
        `[PositionManager] Row for "${symbol}" not found — is there an open position?`,
      );
    }

    await page.mouse.move(rowCenter.x, rowCenter.y);
    await sleep(page, 300, 500); // wait for hover state to activate

    // ── Phase 2: find the now-visible button and click it ─────────────────
    const btnCenter = await page.evaluate(evalScript(true)) as { x: number; y: number } | null;

    if (!btnCenter) {
      throw new Error(
        `[PositionManager] ${label} button did not appear after hover for "${symbol}"`,
      );
    }

    await page.mouse.click(btnCenter.x, btnCenter.y);
    console.log(`[PositionManager] ${label} button clicked for "${symbol}"`);
  }

  private async setBracketPrice(type: 'tp' | 'sl', price: number): Promise<void> {
    const page = this.page;
    const label = type === 'tp' ? 'Take Profit' : 'Stop Loss';

    const toggleSelector =
      type === 'tp' ? ORDER_DIALOG.takeProfitToggle : ORDER_DIALOG.stopLossToggle;
    const inputSelector =
      type === 'tp' ? ORDER_DIALOG.takeProfitInput : ORDER_DIALOG.stopLossInput;

    const toggle = page.locator(toggleSelector).first();
    const checked = await toggle.getAttribute('aria-checked').catch(() => 'false');
    if (checked !== 'true') {
      const clickTarget = page
        .locator(`label:has(${toggleSelector}), ${toggleSelector}`)
        .first();
      await humanClick(page, clickTarget);
      console.log(`[PositionManager] Enabled ${label} bracket`);
      await sleep(page, 200, 400);
    }

    const input = page.locator(inputSelector).first();
    await input.waitFor({ state: 'visible', timeout: 5_000 });
    await humanClick(page, input);
    await reliableFill(page, input, String(price));
    console.log(`[PositionManager] ${label} set to ${price}`);
  }

  private async confirmIfPrompted(): Promise<void> {
    const page = this.page;

    // Wait for the popup animation to complete before scanning for the button
    await sleep(page, 300, 500);

    const confirmBtn = page
      .locator('button, [role="button"]')
      .filter({ hasText: /^Close position$/i })
      .first();

    const appeared = await confirmBtn
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (appeared) {
      await humanClick(page, confirmBtn);
      console.log('[PositionManager] Close position confirmed');
    }
  }
}
