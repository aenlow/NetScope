// Off-screen rendering of a whole floor for PNG and PDF exports.

import * as D from './draw.js';
import { buildHeatmap, buildContour, viewRange } from './heatmapImage.js';
import { cableRuns } from '../core/analysis.js';
import { VIEWS, cssGradient, rampColor, OVERLAP_COLORS } from '../core/colors.js';
import { BAND_LABEL } from '../core/bands.js';
import { signed } from '../core/units.js';

const imgCache = new Map();
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = url;
  });
  imgCache.set(url, p);
  return p;
}

/**
 * Render a floor to a canvas.
 * opts: { project, floorIndex, result, view, band, theme: 'light'|'dark', maxSide, devices, layers, opacity }
 */
export async function renderFloor(opts) {
  const { project, floorIndex, result, view = 'signal', band = '5', theme = 'light', maxSide = 2400, devices, opacity = 0.7 } = opts;
  const layers = { heatmap: true, contour: true, walls: true, rooms: true, aps: true, closets: true, cables: false, ...(opts.layers || {}) };
  const f = project.floors[floorIndex];
  const t = D.THEME[theme];
  const k = Math.min(maxSide / Math.max(f.width, f.height), 4);
  const c = document.createElement('canvas');
  c.width = Math.round(f.width * k);
  c.height = Math.round(f.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // Screen-pixel sizes scale with the image so labels stay legible.
  const u = (Math.max(c.width, c.height) / 1000) / k;
  const img = await loadImage(project.images[f.imageId]);
  if (img) {
    if (theme === 'dark') {
      const { getPlanImage } = await import('./images.js');
      const dark = getPlanImage(project, f.imageId, 'dark');
      D.drawPlan(ctx, f, dark || img, t);
    } else {
      D.drawPlan(ctx, f, img, t);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, 0, f.width, f.height);
    }
  }
  if (layers.heatmap && result) {
    const clip = f.zones.some((z) => z.kind === 'room');
    const heat = buildHeatmap(result, { view, clip, settings: project.settings });
    D.drawHeatmap(ctx, heat, result, opacity);
    if (layers.contour) D.drawContour(ctx, buildContour(result, view, project.settings, clip), u, t);
  }
  if (layers.rooms) D.drawZones(ctx, f, u, t, { units: project.settings.units, zoneMaterials: project.zoneMaterials });
  if (layers.walls) D.drawWalls(ctx, f, project.materials, u, t);
  if (layers.cables && f.closets.length) D.drawCables(ctx, f, cableRuns(project, devices), u, t);
  if (layers.closets) D.drawClosets(ctx, f, u, t);
  if (layers.aps) D.drawAps(ctx, f, u, t, { band, devices });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/** Legend description for a view, shared by PNG and PDF exports. */
export function legendSpec(view, result, settings) {
  const v = VIEWS[view];
  if (view === 'overlap') {
    return { discrete: [1, 2, 3, 4].map((n) => ({ label: n === 4 ? '4+' : String(n), rgb: OVERLAP_COLORS[n].slice(0, 3) })), title: `${v.label} (radios sharing the channel)` };
  }
  const range = viewRange(view, result, settings);
  const ticks = view === 'rate' ? [0, range.max / 2, range.max] : v.ticks;
  const markers = view === 'signal' ? [settings.target.primary] : view === 'secondary' ? [settings.target.secondary] : [];
  return { range, ticks, markers, title: `${v.label}, ${v.unit} (estimate)` };
}

/** Add a title strip and legend under a floor render (PNG export). */
export function composeImage(floorCanvas, { title, subtitle, view, band, result, settings, theme = 'light' }) {
  const t = D.THEME[theme];
  const pad = 32;
  const W = Math.max(floorCanvas.width, 900);
  const head = 70, foot = 92;
  const c = document.createElement('canvas');
  c.width = W + pad * 2;
  c.height = floorCanvas.height + head + foot + pad;
  const ctx = c.getContext('2d');
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = t.ink;
  ctx.font = `600 22px ${D.SANS}`;
  ctx.fillText(title, pad, pad + 14);
  ctx.font = `13px ${D.SANS}`;
  ctx.fillStyle = t.ink2;
  ctx.fillText(subtitle, pad, pad + 38);
  ctx.drawImage(floorCanvas, pad + (W - floorCanvas.width) / 2, head + pad / 2);
  if (result) {
    const y0 = head + pad / 2 + floorCanvas.height + 24;
    const spec = legendSpec(view, result, settings);
    ctx.font = `500 12px ${D.MONO}`;
    ctx.fillStyle = t.ink2;
    ctx.fillText(`${spec.title} · ${BAND_LABEL[band]}`, pad, y0);
    if (spec.discrete) {
      spec.discrete.forEach((d, i) => {
        ctx.fillStyle = `rgb(${d.rgb.join(',')})`;
        ctx.fillRect(pad + i * 70, y0 + 12, 18, 14);
        ctx.fillStyle = t.ink;
        ctx.fillText(d.label, pad + i * 70 + 24, y0 + 24);
      });
    } else {
      const bw = Math.min(520, W);
      const g = ctx.createLinearGradient(pad, 0, pad + bw, 0);
      for (let i = 0; i <= 20; i++) { const cc = rampColor(i / 20); g.addColorStop(i / 20, `rgb(${cc.join(',')})`); }
      ctx.fillStyle = g;
      ctx.fillRect(pad, y0 + 10, bw, 14);
      const pos = (v) => pad + ((v - spec.range.min) / (spec.range.max - spec.range.min)) * bw;
      ctx.fillStyle = t.accent;
      for (const m of spec.markers) ctx.fillRect(pos(m) - 1, y0 + 4, 2, 26);
      ctx.fillStyle = t.ink2;
      ctx.font = `11px ${D.MONO}`;
      ctx.textAlign = 'center';
      for (const tk of spec.ticks) ctx.fillText(view === 'rate' ? String(Math.round(tk)) : signed(tk), pos(tk), y0 + 42);
      ctx.textAlign = 'left';
    }
    ctx.font = `11px ${D.SANS}`;
    ctx.fillStyle = t.ink3;
    ctx.fillText('Predictive estimate from NetScope. Not a substitute for an on-site survey.', pad, c.height - pad / 2);
  }
  return c;
}

export { cssGradient };
