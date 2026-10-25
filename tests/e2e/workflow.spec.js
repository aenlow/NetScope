import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { trackConsole, state, clickPlan, at, waitRf, palette, ensurePanel } from './helpers.js';

const FIX = path.resolve('tests/fixtures');

test('full planning workflow: import, calibrate, draw, place, analyse, export, reload', async ({ page }, info) => {
  const errors = trackConsole(page);
  await page.goto('/?e2e');
  await expect(page.getByRole('heading', { name: 'Plan Wi-Fi on a floor plan' })).toBeVisible();

  // 1. Import a floor plan image.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Import a floor plan/ }).click()]);
  await chooser.setFiles(path.join(FIX, 'plan.png'));
  await page.waitForFunction(() => window.__netscope.store.project.floors.length === 1 && !!window.__netscope.store.project.floors[0].imageId);
  expect(await state(page, () => window.__netscope.store.ui.tool)).toBe('scale');
  await page.waitForTimeout(300);

  // 2. Calibrate: the plan's scale bar is 300 px = 10 m.
  await clickPlan(page, 100, 770);
  await clickPlan(page, 400, 770);
  const dlg = page.getByRole('dialog', { name: 'Set scale' });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel('Unit').selectOption('m');
  await dlg.getByLabel('Real length').fill('10');
  await dlg.getByRole('button', { name: 'Apply scale' }).click();
  const scale = await state(page, () => window.__netscope.store.project.floors[0].scale);
  expect(scale).toBeGreaterThan(10 / 300 * 0.97);
  expect(scale).toBeLessThan(10 / 300 * 1.03);

  // 3. Draw the exterior as a closed chain, then an interior wall pair.
  await page.keyboard.press('w');
  for (const [x, y] of [[60, 60], [1140, 60], [1140, 740], [60, 740], [60, 60]]) await clickPlan(page, x, y);
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].walls.length)).toBe(4);
  for (const [x, y] of [[60, 300], [700, 300], [700, 60]]) await clickPlan(page, x, y);
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].walls.length)).toBe(6);

  // Undo / redo the last chain.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].walls.length)).toBe(4);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].walls.length)).toBe(6);

  // 4. Room tool: drag a rectangle in the corner; sides on existing walls are reused.
  await page.keyboard.press('r');
  const a = await at(page, 900, 400), b = await at(page, 1140, 740);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].zones.length)).toBe(1);
  expect(await state(page, () => window.__netscope.store.project.floors[0].walls.length)).toBe(8);

  // Measure tool shows a real length.
  await page.keyboard.press('m');
  await clickPlan(page, 100, 500);
  await clickPlan(page, 400, 500);
  await page.keyboard.press('Escape');

  // Detect remaining rooms from walls.
  await palette(page, 'detect rooms');
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].zones.length)).toBeGreaterThan(1);

  // 5. Place two access points from the device library.
  await page.keyboard.press('v');
  await page.keyboard.press('a');
  const lib = page.getByRole('dialog', { name: 'Device library' });
  await expect(lib).toBeVisible();
  await lib.getByLabel('Search devices').fill('U7 Pro');
  await lib.getByRole('option', { name: /^U7 Pro\b.*UniFi/ }).first().click();
  await lib.getByRole('button', { name: /Place this model|Use this model/ }).click();
  await clickPlan(page, 300, 180);
  await clickPlan(page, 800, 560);
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].aps.length)).toBe(2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');

  // 6. Configure the selected AP in the inspector.
  await clickPlan(page, 300, 180);
  await ensurePanel(page, 'right');
  const insp = page.getByRole('complementary', { name: 'Inspector' });
  const name = insp.getByLabel('Name');
  await name.fill('Reception AP');
  await name.press('Enter');
  await insp.getByLabel('5 GHz power preset').selectOption('high');
  const ap = await state(page, () => window.__netscope.store.project.floors[0].aps.find((x) => x.name === 'Reception AP'));
  expect(ap).toBeTruthy();
  expect(ap.radios['5'].preset).toBe('high');
  expect(ap.radios['5'].power).toBe(20);

  // 7. Heatmap and views.
  await waitRf(page);
  const pct = await state(page, () => window.__netscope.store.rf.result.stats.primaryPct);
  expect(pct).toBeGreaterThan(10);
  for (const [key, view] of [['3', 'snr'], ['4', 'overlap'], ['5', 'rate'], ['2', 'secondary'], ['1', 'signal']]) {
    await page.keyboard.press(key);
    expect(await state(page, () => window.__netscope.store.ui.view)).toBe(view);
  }
  await page.keyboard.press('b');
  expect(await state(page, () => window.__netscope.store.ui.band)).toBe('6');
  await waitRf(page);
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  expect(await state(page, () => window.__netscope.store.ui.band)).toBe('5');

  // 8. Simulate clients.
  await palette(page, 'simulate clients');
  const cl = page.getByRole('dialog', { name: 'Simulate clients' });
  await cl.getByRole('button', { name: 'Place clients' }).click();
  await expect.poll(() => state(page, () => window.__netscope.store.project.floors[0].clients.length)).toBeGreaterThan(10);

  // 9. Auto-plan channels.
  await palette(page, 'auto-plan channels');
  const ch = page.getByRole('dialog', { name: 'Auto-plan channels' });
  await ch.getByRole('button', { name: 'Plan channels' }).click();
  await expect(ch.getByText(/Updated \d+ radio setting/)).toBeVisible();
  await ch.getByRole('button', { name: 'Done' }).click();
  const ch24 = await state(page, () => window.__netscope.store.project.floors[0].aps.map((x) => x.radios['2.4'].ch));
  expect(new Set(ch24).size).toBe(2);
  for (const c of ch24) expect([1, 6, 11]).toContain(c);

  // 10. Exports: PDF, PNG, CSV.
  const dl = async (kindLabel, buttonName) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const exp = page.getByRole('dialog', { name: 'Export' });
    await exp.getByRole('button', { name: kindLabel, exact: true }).click();
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), exp.getByRole('button', { name: buttonName }).click()]);
    const p = await d.path();
    return { name: d.suggestedFilename(), buf: fs.readFileSync(p) };
  };
  const pdf = await dl('PDF report', 'Download PDF');
  expect(pdf.name).toMatch(/report\.pdf$/);
  expect(pdf.buf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.buf.length).toBeGreaterThan(30_000);
  fs.writeFileSync(info.outputPath('report.pdf'), pdf.buf);

  const png = await dl('Image (PNG)', 'Download PNG');
  expect(png.buf.subarray(1, 4).toString()).toBe('PNG');
  fs.writeFileSync(info.outputPath('floor.png'), png.buf);

  const csv = await dl('AP schedule (CSV)', 'Download CSV');
  const text = csv.buf.toString('utf8');
  expect(text).toContain('Reception AP');
  expect(text.split('\n').length).toBe(3);

  // 11. Save the project file, reload the app and open it again.
  const [saved] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const savedPath = info.outputPath('project.json');
  await saved.saveAs(savedPath);
  const before = await state(page, () => JSON.stringify({ floors: window.__netscope.store.project.floors.map((f) => ({ walls: f.walls, zones: f.zones, aps: f.aps.map(({ id, ...r }) => r), scale: f.scale })) }));
  await page.waitForFunction(() => window.__netscope.store.ui.autosaved);
  await page.goto('/?e2e');
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open a project file/ }).click()]);
  await chooser2.setFiles(savedPath);
  await page.waitForFunction(() => window.__netscope.store.project.floors.length === 1);
  const after = await state(page, () => JSON.stringify({ floors: window.__netscope.store.project.floors.map((f) => ({ walls: f.walls, zones: f.zones, aps: f.aps.map(({ id, ...r }) => r), scale: f.scale })) }));
  expect(after).toBe(before);
  await waitRf(page);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('imports a PDF floor plan', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/?e2e');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Import a floor plan/ }).click()]);
  await chooser.setFiles(path.join(FIX, 'plan.pdf'));
  await page.waitForFunction(() => window.__netscope.store.project.floors[0]?.imageId, null, { timeout: 30_000 });
  const f = await state(page, () => window.__netscope.store.project.floors[0]);
  expect(f.width).toBeGreaterThan(1000);
  expect(f.height / f.width).toBeCloseTo(800 / 1200, 1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('opens a v1 project file safely and migrates it', async ({ page }) => {
  const errors = trackConsole(page);
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await page.goto('/?e2e');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open a project file/ }).click()]);
  await chooser.setFiles(path.join(FIX, 'v1-project.json'));
  await expect(page.getByRole('dialog', { name: 'Opened with notes' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  const p = await state(page, () => window.__netscope.store.project);
  expect(p.name).toBe('Legacy Office');
  expect(p.floors[0].aps.length).toBe(2);
  expect(p.floors[0].walls.length).toBe(4 + 2 + 4);
  expect(p.floors[0].scale).toBeCloseTo(0.1 * 0.3048, 6);
  // The HTML in an AP name is shown as text, never rendered as markup.
  await ensurePanel(page, 'left');
  await page.getByRole('tab', { name: /Access points/ }).click();
  await expect(page.getByText('<b>East</b> AP')).toBeVisible();
  expect(dialogs).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('rejects files that are not projects or plans', async ({ page }, info) => {
  const errors = trackConsole(page);
  await page.goto('/?e2e');
  const bad = info.outputPath('bad.json');
  fs.writeFileSync(bad, '{"hello": "world"}');
  const [c1] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open a project file/ }).click()]);
  await c1.setFiles(bad);
  await expect(page.getByText(/not a NetScope project/)).toBeVisible();
  const txt = info.outputPath('notes.png');
  fs.writeFileSync(txt, 'this is not an image');
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Import a floor plan/ }).click()]);
  await c2.setFiles(txt);
  await expect(page.getByText(/Unsupported file/)).toBeVisible();
  expect(await state(page, () => window.__netscope.store.project.floors.length)).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
