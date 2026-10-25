// Turn a worker result into a small RGBA image (one pixel per grid cell) that
// the renderer scales up with smoothing.

import { buildLut, VIEWS, OVERLAP_COLORS } from '../core/colors.js';
import { contourSegments } from '../core/contour.js';
import { NO_SIGNAL } from '../core/propagation.js';

const lut = buildLut(255);

export function viewRange(view, result, settings) {
  const v = VIEWS[view];
  if (view === 'rate') {
    let max = 0;
    for (let i = 0; i < result.rate.length; i++) if (result.rate[i] > max) max = result.rate[i];
    const nice = [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
    return { min: 0, max: nice.find((n) => n >= max) || max || 100 };
  }
  return { min: v.min, max: v.max };
}

/**
 * Build the heatmap canvas for a view.
 * opts: { view, clip (use mask), settings }
 */
export function buildHeatmap(result, { view, clip, settings }) {
  const { cols, rows } = result;
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  const d = img.data;
  const values = view === 'secondary' ? result.second : view === 'snr' ? result.snr : view === 'rate' ? result.rate : result.best;
  const range = viewRange(view, result, settings);
  const floorV = view === 'signal' || view === 'secondary' ? -90 : view === 'snr' ? 0 : 0.5;
  for (let i = 0; i < cols * rows; i++) {
    if (clip && !result.mask[i]) continue;
    const o = i * 4;
    if (view === 'overlap') {
      const n = result.overlap[i];
      if (!n) continue;
      const col = OVERLAP_COLORS[Math.min(4, n)];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      continue;
    }
    const v = values[i];
    if (v <= NO_SIGNAL || v < floorV) continue;
    const t = Math.max(0, Math.min(1, (v - range.min) / (range.max - range.min)));
    const k = Math.round(t * 255) * 4;
    d[o] = lut[k]; d[o + 1] = lut[k + 1]; d[o + 2] = lut[k + 2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, range };
}

/** Threshold iso-line for the view, in floor pixels: Float32Array [x1,y1,x2,y2,…]. */
export function buildContour(result, view, settings, clip = false) {
  let values, th;
  if (view === 'signal') { values = result.best; th = settings.target.primary; }
  else if (view === 'secondary') { values = result.second; th = settings.target.secondary; }
  else return null;
  if (clip) {
    values = values.slice();
    for (let i = 0; i < values.length; i++) if (!result.mask[i]) values[i] = NO_SIGNAL;
  }
  const segs = contourSegments(values, result.cols, result.rows, th);
  const out = new Float32Array(segs.length);
  for (let i = 0; i < segs.length; i++) out[i] = segs[i] * result.cellPx;
  return out;
}
