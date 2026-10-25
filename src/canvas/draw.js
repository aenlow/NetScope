// Drawing routines shared by the live canvas and the PNG/PDF exporters.
// Each takes a context already transformed into floor-pixel coordinates and
// `u`, the size of one screen pixel in floor pixels (1 / zoom).

import { labelPoint, polygonArea, polygonBounds } from '../core/geometry.js';
import { fmtArea, lenOut, lenLabel } from '../core/units.js';

export const THEME = {
  dark: {
    ground: '#121110', paper: '#161513', ink: '#ECE8E1', ink2: '#A8A29A', ink3: '#8E887F', line: '#2B2926',
    accent: '#FF6A3D', warn: '#E3B04B', bad: '#F09A84', apFill: '#121110', labelBg: 'rgba(18,17,16,0.88)',
  },
  light: {
    ground: '#FFFFFF', paper: '#FFFFFF', ink: '#1C1B19', ink2: '#4A4741', ink3: '#6B675F', line: '#D9D4C7',
    accent: '#D9481C', warn: '#9A6B00', bad: '#B23A22', apFill: '#FFFFFF', labelBg: 'rgba(255,255,255,0.92)',
  },
};

export const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
export const SANS = '"Instrument Sans", system-ui, sans-serif';

export function drawPlan(ctx, floor, image, t) {
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, floor.width, floor.height);
  if (image) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, floor.width, floor.height);
  }
}

export function drawGrid(ctx, floor, u, t, units) {
  if (!floor.scale) return;
  const stepM = units === 'ft' ? 5 * 0.3048 : 1;
  let step = stepM / floor.scale;
  while (step / u < 12) step *= units === 'ft' ? 2 : 5;
  ctx.beginPath();
  for (let x = 0; x <= floor.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, floor.height); }
  for (let y = 0; y <= floor.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(floor.width, y); }
  ctx.strokeStyle = 'rgba(236,232,225,0.06)';
  ctx.lineWidth = u;
  ctx.stroke();
}

export function drawHeatmap(ctx, heat, result, opacity) {
  if (!heat || !result) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(heat.canvas, 0, 0, result.cols * result.cellPx, result.rows * result.cellPx);
  ctx.restore();
}

export function drawContour(ctx, segs, u, t) {
  if (!segs || !segs.length) return;
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); }
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.6 * u;
  ctx.lineCap = 'round';
  ctx.stroke();
}

let hatch = null;
function hatchPattern(ctx, color) {
  if (!hatch || hatch.color !== color) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
    hatch = { color, canvas: c };
  }
  return ctx.createPattern(hatch.canvas, 'repeat');
}

export function drawZones(ctx, floor, u, t, { selectedIds = [], units = 'ft', labels = true, zoneMaterials = [] } = {}) {
  // AP markers and their name tags (drawn later, on top) count as occupied.
  const placed = floor.aps.map((a) => ({ x: a.x + 30 * u, y: a.y - 15 * u, hw: 44 * u, hh: 25 * u }));
  for (const z of floor.zones) {
    if (z.points.length < 3) continue;
    const sel = selectedIds.includes(z.id);
    ctx.beginPath();
    z.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (z.kind === 'exclusion') {
      ctx.save();
      const pat = hatchPattern(ctx, 'rgba(168,162,154,0.35)');
      pat.setTransform?.(new DOMMatrix().scale(u, u));
      ctx.fillStyle = pat;
      ctx.fill();
      ctx.restore();
      ctx.setLineDash([4 * u, 3 * u]);
      ctx.strokeStyle = sel ? t.accent : t.ink3;
    } else if (z.kind === 'attenuation') {
      ctx.fillStyle = 'rgba(227,176,75,0.10)';
      ctx.fill();
      ctx.setLineDash([1.5 * u, 3 * u]);
      ctx.strokeStyle = sel ? t.accent : t.warn;
    } else {
      ctx.fillStyle = sel ? 'rgba(255,106,61,0.08)' : 'rgba(236,232,225,0.035)';
      ctx.fill();
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeStyle = sel ? t.accent : 'rgba(236,232,225,0.38)';
    }
    ctx.lineWidth = (sel ? 1.6 : 1) * u;
    ctx.stroke();
    ctx.setLineDash([]);
    if (sel) for (const p of z.points) handle(ctx, p.x, p.y, u, t);
    if (labels && z.name) {
      const bb = polygonBounds(z.points);
      const sw = (bb.maxX - bb.minX) / u, sh = (bb.maxY - bb.minY) / u;
      if (sw < 64 || sh < 26) continue;
      const c = labelPoint(z.points, floor.zones.filter((o) => o !== z && o.kind !== 'attenuation' && o.points.length > 2).map((o) => o.points));
      const sub = sw < 120 || sh < 44 ? '' : z.kind === 'room' && floor.scale ? fmtArea(polygonArea(z.points) * floor.scale ** 2, units) + (z.devices ? ` · ${z.devices} dev` : '')
        : z.kind === 'attenuation' ? (zoneMaterials.find((m) => m.id === z.materialId)?.name || '') : 'Not counted';
      // Avoid stacking on a label already drawn (nested zones share centres).
      const hw = Math.max(z.name.length, sub.length) * 3.4 * u, hh = (sub ? 15 : 8) * u;
      const hits = (yy) => placed.some((b) => Math.abs(b.x - c.x) < b.hw + hw && Math.abs(b.y - yy) < b.hh + hh);
      const step = 2 * hh + 4 * u;
      const y = [0, 1, -1, 2, -2, 3, -3].map((k) => c.y + k * step).find((yy) => yy - hh > bb.minY && yy + hh < bb.maxY && !hits(yy));
      if (y == null) continue;
      placed.push({ x: c.x, y, hw, hh });
      label2(ctx, c.x, y, z.name.toUpperCase(), sub, u, t);
    }
  }
}

function label2(ctx, x, y, a, b, u, t) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${10.5 * u}px ${MONO}`;
  ctx.fillStyle = 'rgba(236,232,225,0.72)';
  if (t === THEME.light) ctx.fillStyle = 'rgba(28,27,25,0.75)';
  ctx.fillText(a, x, y - (b ? 6 : 0) * u);
  if (!b) { ctx.restore(); return; }
  ctx.font = `${10 * u}px ${MONO}`;
  ctx.fillStyle = t === THEME.light ? 'rgba(28,27,25,0.55)' : 'rgba(168,162,154,0.85)';
  ctx.fillText(b, x, y + 7 * u);
  ctx.restore();
}

export function drawWalls(ctx, floor, materials, u, t, { selectedIds = [] } = {}) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  ctx.lineCap = 'square';
  // Unselected first, grouped by material for fewer state changes.
  const groups = new Map();
  for (const w of floor.walls) {
    if (selectedIds.includes(w.id)) continue;
    const k = w.materialId;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  for (const [mid, list] of groups) {
    const m = byId.get(mid) || { color: '#CFC8BC', width: 2.5 };
    ctx.beginPath();
    for (const w of list) { ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); }
    ctx.strokeStyle = t === THEME.light ? darken(m.color) : m.color;
    ctx.lineWidth = (m.width || 2.5) * u;
    ctx.setLineDash(m.dash ? m.dash.map((d) => d * u) : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const sel = floor.walls.filter((w) => selectedIds.includes(w.id));
  if (sel.length) {
    ctx.beginPath();
    for (const w of sel) { ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); }
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 3.5 * u;
    ctx.stroke();
    for (const w of sel) { handle(ctx, w.x1, w.y1, u, t); handle(ctx, w.x2, w.y2, u, t); }
  }
}

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.35)},${Math.round(g * 0.35)},${Math.round(b * 0.35)})`;
}

export function handle(ctx, x, y, u, t) {
  ctx.fillStyle = t.ground;
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.5 * u;
  ctx.fillRect(x - 4 * u, y - 4 * u, 8 * u, 8 * u);
  ctx.strokeRect(x - 4 * u, y - 4 * u, 8 * u, 8 * u);
}

export function drawCables(ctx, floor, runs, u, t) {
  ctx.save();
  ctx.setLineDash([3 * u, 3 * u]);
  ctx.lineWidth = 1 * u;
  for (const r of runs) {
    if (r.floorId !== floor.id || !r.closetId) continue;
    const ap = floor.aps.find((a) => a.id === r.apId);
    const c = floor.closets.find((o) => o.id === r.closetId);
    if (!ap || !c) continue;
    ctx.strokeStyle = r.over ? t.warn : 'rgba(168,162,154,0.55)';
    ctx.beginPath();
    ctx.moveTo(ap.x, ap.y);
    ctx.lineTo(ap.x, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawInterference(ctx, floor, pairs, u, t) {
  ctx.save();
  ctx.setLineDash([6 * u, 4 * u]);
  ctx.lineWidth = 1.4 * u;
  ctx.strokeStyle = t.warn;
  for (const p of pairs) {
    const a = floor.aps.find((o) => o.id === p.a), b = floor.aps.find((o) => o.id === p.b);
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}

export function drawClients(ctx, assoc, floor, u, t) {
  const apPos = new Map(floor.aps.map((a) => [a.id, a]));
  ctx.lineWidth = 1 * u;
  ctx.strokeStyle = 'rgba(236,232,225,0.16)';
  if (t === THEME.light) ctx.strokeStyle = 'rgba(28,27,25,0.18)';
  ctx.beginPath();
  for (const c of assoc.clients) {
    const a = c.assoc && apPos.get(c.assoc.apId);
    if (a) { ctx.moveTo(c.x, c.y); ctx.lineTo(a.x, a.y); }
  }
  ctx.stroke();
  for (const c of assoc.clients) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.2 * u, 0, Math.PI * 2);
    if (c.assoc) {
      ctx.fillStyle = c.assoc.band === '6' ? t.accent : c.assoc.band === '5' ? t.ink : t.ink3;
      ctx.fill();
    } else {
      ctx.strokeStyle = t.bad;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
    }
  }
}

export function drawClosets(ctx, floor, u, t, selectedIds = []) {
  for (const c of floor.closets) {
    const sel = selectedIds.includes(c.id);
    const s = 9 * u;
    ctx.fillStyle = t.apFill;
    ctx.strokeStyle = sel ? t.accent : t.ink2;
    ctx.lineWidth = (sel ? 2 : 1.4) * u;
    ctx.fillRect(c.x - s, c.y - s, 2 * s, 2 * s);
    ctx.strokeRect(c.x - s, c.y - s, 2 * s, 2 * s);
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) { ctx.moveTo(c.x - 5 * u, c.y + k * 3.5 * u); ctx.lineTo(c.x + 5 * u, c.y + k * 3.5 * u); }
    ctx.stroke();
    tag(ctx, c.x + 13 * u, c.y - 7 * u, c.name, u, t, sel);
  }
}

export function drawAps(ctx, floor, u, t, { selectedIds = [], band = '5', showChannel = true, devices, otherFloorAps = [] } = {}) {
  for (const o of otherFloorAps) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, 6 * u, 0, Math.PI * 2);
    ctx.setLineDash([2 * u, 2 * u]);
    ctx.strokeStyle = 'rgba(168,162,154,0.6)';
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const ap of floor.aps) {
    const sel = selectedIds.includes(ap.id);
    const dev = devices?.get(ap.deviceId);
    const off = ap.enabled === false;
    ctx.globalAlpha = off ? 0.45 : 1;
    if (dev?.antenna?.pattern === 'directional') {
      const bw = ((dev.antenna.beamwidth || 60) * Math.PI) / 180;
      const a0 = (ap.orientation * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(ap.x, ap.y);
      ctx.arc(ap.x, ap.y, 34 * u, a0 - bw / 2, a0 + bw / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,106,61,0.14)';
      ctx.fill();
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1 * u;
      ctx.stroke();
    }
    if (sel) {
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 16 * u, 0, Math.PI * 2);
      ctx.setLineDash([4 * u, 3 * u]);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(ap.x, ap.y, 8.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = t.apFill;
    ctx.fill();
    ctx.strokeStyle = sel ? t.accent : t.ink;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ap.x, ap.y, 2.6 * u, 0, Math.PI * 2);
    ctx.fillStyle = sel ? t.accent : t.ink;
    ctx.fill();
    const r = ap.radios[band];
    const sub = showChannel && r?.on && dev?.radios?.[band] ? `ch ${r.ch}${r.width > 20 ? '/' + r.width : ''}` : null;
    tag(ctx, ap.x + 12 * u, ap.y - 12 * u, ap.name, u, t, sel, sub);
    ctx.globalAlpha = 1;
  }
}

function tag(ctx, x, y, text, u, t, sel, sub) {
  ctx.save();
  ctx.font = `500 ${10.5 * u}px ${MONO}`;
  const w = Math.max(ctx.measureText(text).width, sub ? (ctx.font = `${9.5 * u}px ${MONO}`, ctx.measureText(sub).width) : 0) + 10 * u;
  const h = (sub ? 27 : 16) * u;
  ctx.fillStyle = t.labelBg;
  ctx.fillRect(x, y - h, w, h);
  ctx.strokeStyle = sel ? t.accent : t.line;
  ctx.lineWidth = 1 * u;
  ctx.strokeRect(x, y - h, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 ${10.5 * u}px ${MONO}`;
  ctx.fillStyle = t.ink;
  ctx.fillText(text, x + 5 * u, y - h + 11.5 * u);
  if (sub) {
    ctx.font = `${9.5 * u}px ${MONO}`;
    ctx.fillStyle = t.ink2;
    ctx.fillText(sub, x + 5 * u, y - h + 23 * u);
  }
  ctx.restore();
}

/** Measure / scale line with a length label. */
export function drawDimension(ctx, a, b, text, u, t, color) {
  ctx.save();
  ctx.strokeStyle = color || t.accent;
  ctx.lineWidth = 1.5 * u;
  ctx.setLineDash([5 * u, 3 * u]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * u, 0, Math.PI * 2); ctx.fillStyle = color || t.accent; ctx.fill(); }
  if (text) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.font = `500 ${11 * u}px ${MONO}`;
    const w = ctx.measureText(text).width + 12 * u;
    ctx.fillStyle = t.labelBg;
    ctx.fillRect(mx - w / 2, my - 22 * u, w, 17 * u);
    ctx.strokeStyle = color || t.accent;
    ctx.lineWidth = 1 * u;
    ctx.strokeRect(mx - w / 2, my - 22 * u, w, 17 * u);
    ctx.fillStyle = t.ink;
    ctx.textAlign = 'center';
    ctx.fillText(text, mx, my - 9.5 * u);
  }
  ctx.restore();
}

/** Scale bar in screen space at bottom-right. */
export function drawScaleBar(ctx, floor, zoom, cssW, cssH, units, t, dpr) {
  if (!floor?.scale) return;
  const pxPerM = zoom / floor.scale;
  const target = 120;
  const unitM = units === 'ft' ? 0.3048 : 1;
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  let len = candidates[0];
  for (const c of candidates) if (c * unitM * pxPerM <= target) len = c;
  const w = len * unitM * pxPerM;
  const x = cssW - 24 - w, y = cssH - 22;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = t.ink2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5);
  ctx.stroke();
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = t.ink2;
  ctx.textAlign = 'right';
  ctx.fillText(`${len} ${lenLabel(units)}`, x + w, y - 8);
  ctx.restore();
}

export { lenOut };
