import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { at, waitRf } from './helpers.js';

/** A large synthetic project: 4000 × 3000 px plan, a 28 × 20 grid of rooms (2,336 walls), 64 APs. */
function bigProject() {
  const walls = [];
  const aps = [];
  const W = 4000, H = 3000, nx = 28, ny = 20;
  const cw = W / nx, chh = H / ny;
  let id = 0;
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) {
    const x = i * cw, y0 = j * chh, y1 = (j + 1) * chh;
    walls.push({ id: `w${id++}`, x1: x, y1: y0, x2: x, y2: y0 + chh * 0.42, materialId: 'drywall' });
    walls.push({ id: `w${id++}`, x1: x, y1: y0 + chh * 0.58, x2: x, y2: y1, materialId: i % 5 === 0 ? 'block' : 'drywall' });
  }
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
    const y = j * chh, x0 = i * cw;
    walls.push({ id: `w${id++}`, x1: x0, y1: y, x2: x0 + cw * 0.45, y2: y, materialId: 'drywall' });
    walls.push({ id: `w${id++}`, x1: x0 + cw * 0.55, y1: y, x2: x0 + cw, y2: y, materialId: 'glass' });
  }
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    aps.push({
      id: `ap${i}_${j}`, name: `AP-${i * 8 + j + 1}`, deviceId: 'ubiquiti-u7-pro', x: (i + 0.5) * (W / 8), y: (j + 0.5) * (H / 8), heightM: 3, orientation: 0, enabled: true, closetId: null, notes: '',
      radios: { '2.4': { on: true, ch: [1, 6, 11][(i + j) % 3], width: 20, power: 12, preset: 'medium' }, '5': { on: true, ch: [36, 44, 149, 157][(i + 2 * j) % 4], width: 40, power: 17, preset: 'medium' }, '6': { on: true, ch: 5, width: 80, power: 17, preset: 'medium' } },
    });
  }
  return {
    format: 'netscope-project', version: 2, name: 'Performance test', settings: {},
    floors: [{ id: 'f1', name: 'Large floor', width: W, height: H, scale: 0.05, heightM: 3.5, offsetM: { x: 0, y: 0 }, walls, zones: [], aps, closets: [], clients: [] }],
    images: {}, versions: [],
  };
}

test('large project stays responsive: 64 APs, 2,336 walls, 4000 × 3000 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Measured once on the desktop profile');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?e2e');
  const json = JSON.stringify(bigProject());
  const t0 = Date.now();
  await page.evaluate((t) => window.__netscope.loadProjectText(t), json);
  await waitRf(page);
  const firstHeatmapMs = Date.now() - t0;
  const walls = await page.evaluate(() => window.__netscope.store.project.floors[0].walls.length);

  // Observe main-thread long tasks and frame rate while dragging an AP.
  await page.evaluate(() => {
    window.__perf = { long: [], frames: 0, run: true };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push(e.duration); }).observe({ entryTypes: ['longtask'] });
    const tick = () => { if (!window.__perf.run) return; window.__perf.frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const start = await at(page, 4000 / 16, 3000 / 16);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const dragStart = Date.now();
  for (let k = 1; k <= 60; k++) {
    await page.mouse.move(start.x + k * 4, start.y + k * 2);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const dragMs = Date.now() - dragStart;
  const tUp = Date.now();
  await waitRf(page);
  const settleMs = Date.now() - tUp;
  const perf = await page.evaluate(() => { window.__perf.run = false; return window.__perf; });
  const fps = perf.frames / (dragMs / 1000 + settleMs / 1000);
  const worstLong = Math.max(0, ...perf.long);
  const result = { walls, aps: 64, firstHeatmapMs, dragMs, settleAfterDragMs: settleMs, fpsDuringDrag: Math.round(fps), longTasks: perf.long.length, worstLongTaskMs: Math.round(worstLong) };
  fs.writeFileSync(info.outputPath('perf.json'), JSON.stringify(result, null, 2));
  console.log('PERF', JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(firstHeatmapMs).toBeLessThan(30_000);
  expect(settleMs).toBeLessThan(5_000);
  expect(worstLong).toBeLessThan(250);
});
