/**
 * Single source of truth for all TradingView DOM selectors.
 *
 * When TradingView changes their DOM (which happens regularly), update
 * this file and the rest of the executor stays untouched.
 *
 * All selectors were verified against the live DOM via diagnostic scripts
 * in src/dom-diag-*.ts — see those scripts if selectors break.
 */

// ─── Top toolbar ───────────────────────────────────────────────────────────

export const TOP_TOOLBAR = {
  /** Button that displays the current symbol and opens the search dialog. */
  symbolSearchButton: '#header-toolbar-symbol-search',
} as const;

// ─── Symbol search dialog ──────────────────────────────────────────────────

export const SYMBOL_SEARCH = {
  /** The text input inside the search dialog. */
  input: '[data-qa-id="symbol-search-input"]',

  /**
   * Market category filter tabs.
   * "All" has no id — identify by text.
   * Others: id="stocks" | "futures" | "forex" | "bitcoin,crypto" | "index" | "bond" | "economic" | "options"
   */
  marketTabs: 'button[role="tab"][data-overflow-tooltip-text]',
  marketTabAll: 'button[role="tab"][data-overflow-tooltip-text="All"]',

  /** Individual search result row. The first visible result is the top match. */
  resultRow: '[data-name="symbol-search-item-title"]',

  /** Fallback: any row-ish element in the results list. */
  resultRowFallback: '[class*="itemContent-"], [class*="symbolRow-"]',
} as const;

// ─── Chart price buttons (open the order dialog) ──────────────────────────

export const CHART_ORDER_BUTTONS = {
  /** Big red SELL button on the chart with current bid price. */
  sellOrderButton: '[data-name="sell-order-button"]',
  /** Big blue BUY button on the chart with current ask price. */
  buyOrderButton: '[data-name="buy-order-button"]',
} as const;

// ─── Order dialog / panel ──────────────────────────────────────────────────
//
// TradingView uses two different UI shapes depending on the instrument:
//  - Stocks / ETFs  → floating popup:  [data-name="order-dialog-popup"]
//  - Futures / Forex → sidebar panel:  [data-name="order-panel"]
//
// Both contain the same inner elements (side controls, quantity, brackets,
// place button) — only the container selector differs.

export const ORDER_DIALOG = {
  /**
   * Combined selector that matches whichever container is present.
   * Use locator(ORDER_DIALOG.container).first() and it will return
   * whichever one is visible.
   */
  popup: '[data-name="order-dialog-popup"], [data-name="order-panel"]',

  /** Close (X) button — only present in the popup variant (stocks). */
  closeButton: '[data-qa-id="button-close"]',

  /** Side switches (inside the dialog, to change Buy/Sell after it's open). */
  sideBuy: '[data-name="side-control-buy"]',
  sideSell: '[data-name="side-control-sell"]',

  /** Order type tabs — each has role="tab" and id matching the type name. */
  typeTab: (type: 'Market' | 'Limit' | 'Stop') => `[role="tab"]#${type}`,

  /** Quantity input field. */
  quantityInput: '#quantity-field',

  /** Place order button (big blue CTA at the bottom). */
  placeOrderButton: '[data-name="place-and-modify-button"]',

  // ── Take Profit bracket ──
  takeProfitToggle: '[data-qa-id="order-ticket-take-profit-checkbox-bracket"]',
  takeProfitInput: '[data-qa-id="ui-lib-Input-input order-ticket-take-profit-input"]',

  // ── Stop Loss bracket ──
  stopLossToggle: '[data-qa-id="order-ticket-stop-loss-checkbox-bracket"]',
  stopLossInput: '[data-qa-id="ui-lib-Input-input order-ticket-stop-loss-input"]',
} as const;

// ─── Position panel (bottom of chart) ─────────────────────────────────────
// Only exists when a position is open. Used for exit + bracket updates.
// These buttons appear on hover over the position row.

export const POSITION_PANEL = {
  /**
   * "Paper Trading" outer tab — the button in the bottom bar that opens the
   * Paper Trading panel (alongside "Strategy Report" and "Trade").
   * Try data-name first, fall back to text content.
   */
  paperTradingTab: '[data-name="paper-trading"], button#paper-trading',

  /** Positions sub-tab inside the Paper Trading panel. */
  positionsTab: 'button#positions',

  /** The row containing an open position. Hover over it to reveal action buttons. */
  positionRow: 'tr, [role="row"]',

  /**
   * "Close" button that appears when hovering the position row.
   * Immediately closes the position at market.
   */
  closeButton: '[data-name="close-settings-cell-button"]',

  /**
   * "Protect Position" button that appears when hovering the position row.
   * Clicking it loads the TP/SL fields into the order panel for editing.
   */
  protectButton: '[data-name="edit-settings-cell-button"]',

  // ── TP/SL inputs that appear in the order panel after clicking Protect ──
  // These are the same qa-ids as in the order dialog — reuse ORDER_DIALOG selectors.
} as const;

// ─── Confirmation dialogs ─────────────────────────────────────────────────

export const CONFIRM_DIALOG = {
  yesButtonRegex: /^Yes$|^Confirm$|^OK$|^Place$/i,
  closePositionButtonRegex: /^Close Position$|^Yes$|^Confirm$/i,
} as const;
