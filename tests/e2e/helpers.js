import { expect } from '@playwright/test';

export function trackConsole(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

export const state = (page, fn) => page.evaluate(fn);

/** Screen point (page coordinates) of a floor-plan pixel. */
export async function at(page, x, y) {
  return page.evaluate(([px, py]) => {
    const vp = window.__netscope.viewport();
    const r = vp.canvas.getBoundingClientRect();
    const s = vp.toScreen(px, py);
    return { x: r.left + s.x, y: r.top + s.y };
  }, [x, y]);
}

export async function clickPlan(page, x, y, opts = {}) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y, opts);
}

export async function waitRf(page) {
  await page.waitForFunction(() => {
    const s = window.__netscope.store;
    const f = s.project.floors[s.ui.floorIndex];
    return !s.rf.pending && s.rf.result && f && s.rf.result.floorId === f.id && s.rf.result.band === s.ui.band;
  }, null, { timeout: 60_000 });
}

export async function palette(page, text) {
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('Type a command or a device model');
  await expect(input).toBeVisible();
  await input.fill(text);
  await page.keyboard.press('Enter');
}

/** Make sure a side panel is visible (tablet layout hides them). */
export async function ensurePanel(page, which) {
  const open = await page.evaluate((w) => window.__netscope.store.ui[w === 'right' ? 'rightOpen' : 'leftOpen'], which);
  if (!open) await page.getByRole('button', { name: which === 'right' ? 'Toggle inspector' : 'Toggle layers panel' }).click();
}
