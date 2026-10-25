// Regenerates the README screenshots in docs/screenshots.
// Usage: npm run build && npm run preview  (in another terminal)  then  node scripts/screenshots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const settle = async (page) => {
  await page.waitForFunction(() => window.__netscope.store.rf.result && !window.__netscope.store.rf.pending, null, { timeout: 60000 });
  await page.waitForTimeout(500);
};
const quiet = (page) => page.evaluate(() => { window.__netscope.store.ui.toasts = []; });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/?e2e`);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + 'welcome.png' });

await page.getByRole('button', { name: /Office, two floors/ }).click();
await settle(page); await quiet(page); await page.waitForTimeout(300);
await page.screenshot({ path: OUT + 'signal.png' });

for (const [key, name] of [['3', 'snr'], ['4', 'channel-overlap'], ['5', 'data-rate']]) {
  await page.mouse.click(5, 450); // focus off inputs
  await page.keyboard.press(key);
  await settle(page); await quiet(page);
  await page.screenshot({ path: OUT + name + '.png' });
}
await page.keyboard.press('1');
await settle(page);

const pt = await page.evaluate(() => {
  const ns = window.__netscope, f = ns.store.project.floors[0], a = f.aps[2];
  const vp = ns.viewport(), r = vp.canvas.getBoundingClientRect(), s = vp.toScreen(a.x, a.y);
  return { x: r.left + s.x, y: r.top + s.y };
});
await page.keyboard.press('v');
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(400);
await page.getByTitle('Change device model').click();
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + 'device-library.png' });
await page.keyboard.press('Escape');

await page.setViewportSize({ width: 1024, height: 768 });
await page.waitForTimeout(600);
await settle(page); await quiet(page);
await page.screenshot({ path: OUT + 'tablet.png' });

await browser.close();
console.log('Screenshots written to', OUT);
