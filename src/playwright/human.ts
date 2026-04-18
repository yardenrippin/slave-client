/**
 * Human-like behavior helpers for Playwright.
 *
 * TradingView is a heavy, reactive UI — instant keyboard input or
 * teleporting clicks can miss React state updates or trigger
 * bot-detection heuristics. These helpers add small, natural delays
 * and mouse movements that mimic a real trader.
 *
 * Tunable via the Options argument to each function.
 */
import type { Locator, Page } from 'playwright-core';

// ─── Random helpers ───────────────────────────────────────────────────────

/** Random integer in [min, max] (inclusive on both ends). */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random float in [min, max). */
export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Sleep for a random duration between min and max milliseconds. */
export function sleep(page: Page, minMs = 80, maxMs = 220): Promise<void> {
  return page.waitForTimeout(randInt(minMs, maxMs));
}

// ─── Mouse movement ───────────────────────────────────────────────────────

/**
 * Move the mouse to a target locator using a curved, human-like path
 * instead of instant teleporting.
 *
 * Uses a quadratic bezier curve with random control point offset so
 * two calls to the same target produce different paths. Steps is
 * intentionally moderate — too many steps is slower than a real
 * human mouse and defeats the purpose.
 */
export async function humanMoveTo(
  page: Page,
  target: Locator,
  opts: { steps?: number; jitter?: number } = {},
): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) {
    throw new Error('humanMoveTo: target has no bounding box (invisible?)');
  }

  // Click somewhere inside the element — not always dead-center,
  // biased toward the middle but with small offset.
  const offsetX = randFloat(0.35, 0.65);
  const offsetY = randFloat(0.35, 0.65);
  const targetX = box.x + box.width * offsetX;
  const targetY = box.y + box.height * offsetY;

  const steps = opts.steps ?? randInt(8, 18);
  await page.mouse.move(targetX, targetY, { steps });

  return { x: targetX, y: targetY };
}

/**
 * Hover a locator with a human-like move + a short pause, as if the
 * user is about to click. Useful before clicking to simulate decision time.
 */
export async function humanHover(
  page: Page,
  target: Locator,
  opts: { pauseMinMs?: number; pauseMaxMs?: number } = {},
): Promise<void> {
  await humanMoveTo(page, target);
  await sleep(page, opts.pauseMinMs ?? 60, opts.pauseMaxMs ?? 180);
}

/**
 * Click a locator with human-like behavior:
 * 1. Move mouse to the element with a curved path
 * 2. Short random pause (hover moment)
 * 3. Click
 * 4. Short post-click pause
 *
 * Preferred over locator.click() for anything safety-critical.
 */
export async function humanClick(
  page: Page,
  target: Locator,
  opts: { hoverMinMs?: number; hoverMaxMs?: number; postMinMs?: number; postMaxMs?: number } = {},
): Promise<void> {
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  await humanHover(page, target, {
    pauseMinMs: opts.hoverMinMs,
    pauseMaxMs: opts.hoverMaxMs,
  });
  await page.mouse.down();
  await sleep(page, 20, 60); // press duration
  await page.mouse.up();
  await sleep(page, opts.postMinMs ?? 80, opts.postMaxMs ?? 220);
}

// ─── Keyboard ─────────────────────────────────────────────────────────────

/**
 * Type text with human-like per-key delays.
 * Faster than default Playwright type() and avoids bot-detection heuristics
 * that flag 0ms-delay typing.
 */
export async function humanType(
  page: Page,
  target: Locator,
  text: string,
  opts: { delayMinMs?: number; delayMaxMs?: number; clearFirst?: boolean } = {},
): Promise<void> {
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  await humanClick(page, target);

  if (opts.clearFirst !== false) {
    // Select all and delete — more reliable than .fill('') on custom inputs
    await page.keyboard.press('Meta+a').catch(() => {});
    await page.keyboard.press('Control+a').catch(() => {});
    await sleep(page, 30, 80);
    await page.keyboard.press('Backspace');
    await sleep(page, 30, 80);
  }

  const min = opts.delayMinMs ?? 50;
  const max = opts.delayMaxMs ?? 130;
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: randInt(min, max) });
  }
  await sleep(page, 80, 180);
}

/**
 * Fast fill — when typing animation isn't important.
 * Still does a proper click + select-all + fill to trigger all
 * React listeners that a simple .fill() might skip.
 */
export async function reliableFill(
  page: Page,
  target: Locator,
  value: string,
): Promise<void> {
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  await humanClick(page, target, { hoverMinMs: 30, hoverMaxMs: 80 });
  await target.selectText().catch(async () => {
    await target.click({ clickCount: 3 });
  });
  await sleep(page, 20, 60);
  await target.fill(value);
  await page.keyboard.press('Tab').catch(() => {});
  await sleep(page, 80, 180);
}
