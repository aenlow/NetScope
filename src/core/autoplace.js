// Automatic AP placement: greedy set cover on a coarse grid followed by a
// local swap refinement. Fast enough to run in a worker on large floors.

import { rssiAt, NO_SIGNAL } from './propagation.js';
import { distToSegment } from './geometry.js';

/**
 * opts: {
 *   scene, band, mask (Uint8Array over scene grid), makeEmitter(x, y) → emitter,
 *   existing: [emitter], primary, secondary, secondaryEnabled, goalPct,
 *   minAps, maxAps, onProgress(fraction)
 * }
 * Returns { points: [{x, y}], primaryPct, secondaryPct }.
 */
export function autoPlace(opts) {
  const { scene, band, mask, makeEmitter, existing = [], primary, secondary, secondaryEnabled, goalPct = 95, minAps = 0, maxAps = 60, onProgress } = opts;
  const { cols, rows, cellPx } = scene;

  // Evaluation points: masked cells, thinned to a budget.
  const all = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) all.push(i);
  if (!all.length) return { points: [], primaryPct: 0, secondaryPct: 0 };
  const evalStep = Math.max(1, Math.ceil(Math.sqrt(all.length / 2500)));
  const pts = [];
  for (const i of all) {
    const r = Math.floor(i / cols), c = i % cols;
    if (r % evalStep === 0 && c % evalStep === 0) pts.push({ x: (c + 0.5) * cellPx, y: (r + 0.5) * cellPx });
  }
  const P = pts.length;

  // Candidates: a lattice over the masked cells.
  const candStep = Math.max(evalStep, Math.ceil(Math.sqrt(all.length / 260)));
  const cands = [];
  const segs = scene.grid?.segs || [];
  const clear = 1.0 / scene.scale; // keep candidates 1 m away from walls
  const nearWall = (x, y) => {
    for (let k = 0; k < segs.length; k += 4) if (distToSegment(x, y, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]) < clear) return true;
    return false;
  };
  for (const i of all) {
    const r = Math.floor(i / cols), c = i % cols;
    if (r % candStep === Math.floor(candStep / 2) && c % candStep === Math.floor(candStep / 2)) {
      const x = (c + 0.5) * cellPx, y = (r + 0.5) * cellPx;
      if (!nearWall(x, y)) cands.push({ x, y });
    }
  }
  if (!cands.length) cands.push(pts[Math.floor(P / 2)]);
  const C = cands.length;

  const R = new Float32Array(C * P);
  for (let k = 0; k < C; k++) {
    const e = makeEmitter(cands[k].x, cands[k].y);
    for (let j = 0; j < P; j++) R[k * P + j] = rssiAt(scene, e, band, pts[j].x, pts[j].y);
    if (onProgress && k % 20 === 0) onProgress((0.8 * k) / C);
  }

  const b1 = new Float32Array(P).fill(NO_SIGNAL);
  const b2 = new Float32Array(P).fill(NO_SIGNAL);
  for (const e of existing) {
    for (let j = 0; j < P; j++) {
      const v = rssiAt(scene, e, band, pts[j].x, pts[j].y);
      if (v > b1[j]) { b2[j] = b1[j]; b1[j] = v; } else if (v > b2[j]) b2[j] = v;
    }
  }

  const pct = (arr, th) => { let n = 0; for (let j = 0; j < P; j++) if (arr[j] >= th) n++; return (100 * n) / P; };
  const done = () => pct(b1, primary) >= goalPct && (!secondaryEnabled || pct(b2, secondary) >= goalPct);

  const gain = (k, w2) => {
    let g = 0;
    const o = k * P;
    for (let j = 0; j < P; j++) {
      const v = R[o + j];
      if (v >= primary && b1[j] < primary) g += 1;
      else if (w2 && v >= secondary && b2[j] < secondary && b1[j] >= primary) g += w2;
      else if (b1[j] < primary && v > b1[j]) g += 0.002 * (v - b1[j]);
    }
    return g;
  };
  const apply = (k) => {
    const o = k * P;
    for (let j = 0; j < P; j++) {
      const v = R[o + j];
      if (v > b1[j]) { b2[j] = b1[j]; b1[j] = v; } else if (v > b2[j]) b2[j] = v;
    }
  };

  const chosen = [];
  const used = new Uint8Array(C);
  while (chosen.length < maxAps && (!done() || chosen.length + existing.length < minAps)) {
    const w2 = secondaryEnabled || done() ? 0.6 : 0;
    let best = -1, bestG = 0;
    for (let k = 0; k < C; k++) {
      if (used[k]) continue;
      const g = gain(k, w2);
      if (g > bestG) { bestG = g; best = k; }
    }
    if (best < 0 || bestG < 0.5) break;
    used[best] = 1;
    chosen.push(best);
    apply(best);
  }

  // Local refinement: try moving each chosen AP to a nearby candidate.
  const total = (set) => {
    const a1 = new Float32Array(P).fill(NO_SIGNAL), a2 = new Float32Array(P).fill(NO_SIGNAL);
    for (const e of existing) for (let j = 0; j < P; j++) { const v = rssiAt(scene, e, band, pts[j].x, pts[j].y); if (v > a1[j]) { a2[j] = a1[j]; a1[j] = v; } else if (v > a2[j]) a2[j] = v; }
    for (const k of set) { const o = k * P; for (let j = 0; j < P; j++) { const v = R[o + j]; if (v > a1[j]) { a2[j] = a1[j]; a1[j] = v; } else if (v > a2[j]) a2[j] = v; } }
    let s = 0;
    for (let j = 0; j < P; j++) { if (a1[j] >= primary) s += 1; if (secondaryEnabled && a2[j] >= secondary) s += 0.6; }
    return s;
  };
  if (chosen.length && chosen.length <= 40) {
    const radius2 = (candStep * cellPx * 2.2) ** 2;
    let score = total(chosen);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < chosen.length; i++) {
        const cur = cands[chosen[i]];
        for (let k = 0; k < C; k++) {
          if (chosen.includes(k)) continue;
          const dx = cands[k].x - cur.x, dy = cands[k].y - cur.y;
          if (dx * dx + dy * dy > radius2) continue;
          const trial = chosen.slice();
          trial[i] = k;
          const s = total(trial);
          if (s > score + 0.5) { score = s; chosen[i] = k; }
        }
        if (onProgress) onProgress(0.8 + (0.2 * (pass * chosen.length + i)) / (2 * chosen.length));
      }
    }
  }

  // Final stats with the refined set.
  b1.fill(NO_SIGNAL); b2.fill(NO_SIGNAL);
  for (const e of existing) for (let j = 0; j < P; j++) { const v = rssiAt(scene, e, band, pts[j].x, pts[j].y); if (v > b1[j]) { b2[j] = b1[j]; b1[j] = v; } else if (v > b2[j]) b2[j] = v; }
  chosen.forEach(apply);
  return { points: chosen.map((k) => cands[k]), primaryPct: pct(b1, primary), secondaryPct: pct(b2, secondary) };
}
