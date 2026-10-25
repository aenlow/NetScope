// Example projects with clearly fictional floor plans. Geometry is defined in
// meters; each floor's plan image is drawn from the same geometry.

import { newProject, newFloor } from '../core/schema.js';
import { uid } from '../core/ids.js';
import { store, setUi, resetHistory, notify, toast } from '../state/store.js';
import * as A from '../state/actions.js';
import { devicesIndex } from '../data/devices.js';
import { getViewport } from '../ui/viewportRef.js';

export const EXAMPLES = [
  { id: 'office', name: 'Office, two floors', blurb: 'Private offices, glass conference room, elevator core and open plan across two levels.', stats: '96 × 60 m total · 14 APs · Wi-Fi 7' },
  { id: 'warehouse', name: 'Warehouse', blurb: 'High-bay storage with dense racking aisles, loading docks and a small office block.', stats: '120 × 70 m · 12 APs at 9 m' },
  { id: 'retail', name: 'Retail store', blurb: 'Sales floor with shelving, coated-glass storefront, stockroom and a walk-in cold room.', stats: '50 × 35 m · 6 APs' },
];

function builder(widthM, heightM, pxPerM, name, heightFloor = 3.5) {
  const s = 1 / pxPerM;
  const f = newFloor(name, { width: Math.round(widthM * pxPerM), height: Math.round(heightM * pxPerM), scale: s });
  f.heightM = heightFloor;
  const P = (m) => m * pxPerM;
  return {
    f,
    wall(x1, y1, x2, y2, mat) { f.walls.push({ id: uid('wall'), x1: P(x1), y1: P(y1), x2: P(x2), y2: P(y2), materialId: mat }); },
    /** Wall with door gaps: gaps = [[from, to], …] in meters along the wall. */
    wallGaps(x1, y1, x2, y2, mat, gaps = []) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      let t = 0;
      for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
        if (a > t) this.wall(x1 + ux * t, y1 + uy * t, x1 + ux * a, y1 + uy * a, mat);
        t = b;
      }
      if (t < len) this.wall(x1 + ux * t, y1 + uy * t, x2, y2, mat);
    },
    rect(x0, y0, x1, y1, mat) {
      this.wall(x0, y0, x1, y0, mat); this.wall(x1, y0, x1, y1, mat); this.wall(x1, y1, x0, y1, mat); this.wall(x0, y1, x0, y0, mat);
    },
    zone(kind, name, pts, extra = {}) {
      f.zones.push({ id: uid('zone'), kind, name, points: pts.map(([x, y]) => ({ x: P(x), y: P(y) })), materialId: extra.materialId || null, devices: extra.devices || 0 });
    },
    room(name, pts, devices = 0) { this.zone('room', name, pts, { devices }); },
    ap(name, x, y, deviceId, heightM) { f.aps.push({ name, x: P(x), y: P(y), deviceId, heightM }); },
    closet(name, x, y) { f.closets.push({ id: uid('idf'), name, x: P(x), y: P(y), poeBudgetW: 370 }); },
  };
}

function finishAps(p) {
  const idx = devicesIndex(p.customDevices);
  p.floors.forEach((f, fi) => {
    f.aps = f.aps.map((a, i) => {
      const dev = idx.get(a.deviceId);
      return {
        id: uid('ap'), name: a.name, deviceId: a.deviceId, x: a.x, y: a.y, heightM: a.heightM ?? 2.7,
        orientation: 0, radios: A.defaultRadios(dev, i + fi), enabled: true, closetId: null, notes: '',
      };
    });
  });
}

function office() {
  const p = newProject('Northfield Office (example)');
  p.settings.allowDfs = true;
  const dev = 'ubiquiti-u7-pro';
  for (const level of [1, 2]) {
    const b = builder(48, 30, 30, `Level ${level}`, 3.6);
    b.rect(1, 1, 47, 29, 'brick');
    // North offices
    b.wallGaps(1, 8, 33, 8, 'drywall', [[5, 6], [13, 14], [21, 22], [29, 30]]);
    for (const x of [9, 17, 25]) b.wall(x, 1, x, 8, 'drywall');
    // Conference room (glass)
    b.wall(33, 1, 33, 10, 'glass');
    b.wallGaps(33, 10, 47, 10, 'glass', [[5, 6.5]]);
    // Core: elevator (metal) and stairs (concrete)
    b.rect(21, 13, 25, 18, 'metal');
    b.wall(25, 13, 29, 13, 'concrete-200');
    b.wall(29, 13, 29, 18, 'concrete-200');
    b.wallGaps(29, 18, 25, 18, 'concrete-200', [[1.2, 2.4]]);
    // Kitchen
    b.wall(1, 21, 10, 21, 'drywall');
    b.wallGaps(10, 21, 10, 29, 'drywall', [[2.5, 3.5]]);
    // Focus rooms
    b.wallGaps(37, 21, 47, 21, 'drywall', [[2, 3], [7, 8]]);
    b.wall(37, 21, 37, 29, 'drywall');
    b.wall(42, 21, 42, 29, 'drywall');
    const n = level * 100;
    [[1, 9], [9, 17], [17, 25], [25, 33]].forEach(([x0, x1], i) => b.room(`Office ${n + i + 1}`, [[x0, 1], [x1, 1], [x1, 8], [x0, 8]], 3));
    b.room('Conference', [[33, 1], [47, 1], [47, 10], [33, 10]], 24);
    b.room('Kitchen', [[1, 21], [10, 21], [10, 29], [1, 29]], 10);
    b.room('Focus A', [[37, 21], [42, 21], [42, 29], [37, 29]], 3);
    b.room('Focus B', [[42, 21], [47, 21], [47, 29], [42, 29]], 3);
    b.room('Open office', [[1, 8], [33, 8], [33, 10], [47, 10], [47, 21], [37, 21], [37, 29], [10, 29], [10, 21], [1, 21]], 70);
    b.zone('exclusion', 'Core', [[21, 13], [29, 13], [29, 18], [21, 18]]);
    b.zone('attenuation', 'Workstations', [[3, 10], [19, 10], [19, 19], [3, 19]], { materialId: 'cubicles' });
    b.zone('attenuation', 'Workstations', [[31, 12], [45, 12], [45, 19], [31, 19]], { materialId: 'cubicles' });
    const pre = `AP-${level}-`;
    const pts = [[9, 4.5], [25, 4.5], [40, 5.5], [9, 15], [17, 25], [33, 16], [42, 25]];
    pts.forEach(([x, y], i) => b.ap(`${pre}${String(i + 1).padStart(2, '0')}`, level === 2 ? x + (i % 2 ? 1.5 : -1.5) : x, y, dev, 3.0));
    b.closet(`IDF-${level}`, 27, 20);
    p.floors.push(b.f);
  }
  return p;
}

function warehouse() {
  const p = newProject('Harbor Logistics Warehouse (example)');
  p.settings.allowDfs = true;
  const dev = 'ruckus-r650';
  const b = builder(120, 70, 12, 'Ground', 11);
  b.wallGaps(1, 1, 119, 1, 'block', []);
  b.wall(119, 1, 119, 69, 'block');
  b.wallGaps(119, 69, 1, 69, 'block', [[65, 69], [75, 79], [85, 89], [95, 99]]);
  b.wall(1, 69, 1, 1, 'block');
  // Office block
  b.wallGaps(30, 1, 30, 18, 'drywall', [[10, 11.5]]);
  b.wallGaps(1, 18, 30, 18, 'drywall', [[21, 22.5]]);
  b.wallGaps(12, 1, 12, 18, 'drywall', [[13, 14]]);
  b.wallGaps(21, 1, 21, 18, 'drywall', [[13, 14]]);
  b.room('Office', [[1, 1], [12, 1], [12, 18], [1, 18]], 8);
  b.room('Break room', [[12, 1], [21, 1], [21, 18], [12, 18]], 6);
  b.room('Shipping desk', [[21, 1], [30, 1], [30, 18], [21, 18]], 6);
  b.room('Warehouse floor', [[30, 1], [119, 1], [119, 69], [1, 69], [1, 18], [30, 18]], 45);
  for (let i = 0; i < 8; i++) {
    const x = 38 + i * 9.5;
    b.zone('attenuation', `Rack ${String.fromCharCode(65 + i)}`, [[x, 10], [x + 2.4, 10], [x + 2.4, 54], [x, 54]], { materialId: 'racking-dense' });
  }
  const aps = [[16, 10], [42.7, 20], [61.7, 20], [80.7, 20], [99.7, 20], [42.7, 44], [61.7, 44], [80.7, 44], [99.7, 44], [30, 61], [70, 61], [108, 61]];
  aps.forEach(([x, y], i) => b.ap(`AP-1-${String(i + 1).padStart(2, '0')}`, x, y, dev, i === 0 ? 2.7 : 9));
  b.closet('IDF-1', 28, 16);
  b.closet('IDF-2', 92, 3);
  p.floors.push(b.f);
  p.settings.target = { preset: 'data', primary: -65, secondary: -67, secondaryEnabled: false, coverageGoal: 95 };
  return p;
}

function retail() {
  const p = newProject('Elm Street Market (example)');
  p.settings.allowDfs = true;
  const dev = 'tp-link-eap650';
  const b = builder(50, 35, 28, 'Sales level', 4.5);
  b.wall(1, 1, 49, 1, 'brick');
  b.wall(49, 1, 49, 34, 'brick');
  b.wall(1, 34, 1, 1, 'brick');
  b.wallGaps(49, 34, 1, 34, 'glass-coated', [[22, 27]]);
  b.wallGaps(1, 10, 36, 10, 'drywall', [[17, 19.5]]);
  b.wall(36, 1, 36, 10, 'metal');
  b.wallGaps(36, 10, 49, 10, 'metal', []);
  b.wallGaps(9, 10, 9, 20, 'drywall', [[4, 5]]);
  b.wall(1, 20, 9, 20, 'drywall');
  b.room('Stockroom', [[1, 1], [36, 1], [36, 10], [1, 10]], 6);
  b.room('Office', [[1, 10], [9, 10], [9, 20], [1, 20]], 4);
  b.room('Sales floor', [[1, 20], [9, 20], [9, 10], [49, 10], [49, 34], [1, 34]], 55);
  b.zone('exclusion', 'Cold room', [[36, 1], [49, 1], [49, 10], [36, 10]]);
  b.zone('attenuation', 'Stock racking', [[3, 2.5], [34, 2.5], [34, 8], [3, 8]], { materialId: 'racking-dense' });
  for (const y of [13, 17, 21, 25]) b.zone('attenuation', 'Shelving', [[13, y], [45, y], [45, y + 1.5], [13, y + 1.5]], { materialId: 'shelving-light' });
  [[18, 5.5], [5, 15], [17, 19], [33, 19], [17, 30], [37, 30]].forEach(([x, y], i) => b.ap(`AP-1-${String(i + 1).padStart(2, '0')}`, x, y, dev, 3.6));
  b.closet('IDF-1', 7, 12);
  p.floors.push(b.f);
  p.settings.target = { preset: 'data', primary: -65, secondary: -67, secondaryEnabled: false, coverageGoal: 95 };
  return p;
}

/** Draw the plan image for a floor from its geometry (fictional drawing). */
async function planImage(project, f) {
  const W = f.width, H = f.height;
  const mats = new Map(project.materials.map((m) => [m.id, m]));
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const k = 1 / f.scale; // px per m
  const lines = f.walls.map((w) => {
    const m = mats.get(w.materialId);
    const t = Math.max(1.5, Math.min(0.35 * k, (m?.width || 2.5) * 0.06 * k + 1));
    const dash = w.materialId === 'glass' || w.materialId === 'glass-coated' ? ` stroke-dasharray="${0.6 * k} ${0.3 * k}"` : '';
    return `<line x1="${w.x1.toFixed(1)}" y1="${w.y1.toFixed(1)}" x2="${w.x2.toFixed(1)}" y2="${w.y2.toFixed(1)}" stroke="#1d1d1b" stroke-width="${t.toFixed(1)}" stroke-linecap="square"${dash}/>`;
  }).join('');
  const zones = f.zones.filter((z) => z.kind === 'attenuation').map((z) => `<polygon points="${z.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#6b6b66" stroke-width="1" stroke-dasharray="3 3"/>`).join('');
  const title = `<text x="${(0.6 * k).toFixed(0)}" y="${(H - 0.35 * k).toFixed(0)}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.max(9, 0.45 * k).toFixed(0)}" fill="#7a7a74">FICTIONAL EXAMPLE PLAN — ${esc(project.name.replace(' (example)', '').toUpperCase())} — ${esc(f.name.toUpperCase())}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${zones}${lines}${title}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function buildExample(id) {
  const p = id === 'warehouse' ? warehouse() : id === 'retail' ? retail() : office();
  finishAps(p);
  return p;
}

export async function loadExample(id) {
  setUi({ busy: { label: 'Opening example', progress: null } });
  try {
    const p = buildExample(id);
    for (const f of p.floors) {
      const imgId = uid('img');
      p.images[imgId] = await planImage(p, f);
      f.imageId = imgId;
    }
    // Example floors stay walls-only; plan images are drawn from the same walls.
    A.replaceProject(p);
    requestAnimationFrame(() => getViewport()?.fit());
    await A.autoPlanChannels();
    resetHistory();
    store.ui.lastSavedVersion = store.version;
    store.ui.channelsPlanned = true;
    notify();
    toast('Example opened with channels planned automatically. Explore the views above the map, or open Check for findings.', 'ok', 6000);
  } catch (err) {
    toast(`Could not open the example: ${err.message || err}`, 'error');
  } finally {
    setUi({ busy: null });
  }
}
