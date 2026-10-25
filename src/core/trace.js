// Wall tracing from a raster floor plan. Classical image processing only
// (no OCR, no machine learning), so it is fast, small and runs in a worker.
//
// Pipeline
//   1. Ink mask: dark pixels and mid-grey unsaturated pixels (wall fills),
//      ignoring coloured room fills and light backgrounds.
//   2. Horizontal and vertical bands: runs of ink at least `minLen` long,
//      grouped across neighbouring rows (or columns). A band's height is its
//      stroke thickness.
//   3. Walls are either solid bands (thicker than line work) or pairs of thin
//      parallel lines a consistent distance apart (outlined walls).
//   4. Pieces on the same line are merged; thin pieces sitting inside a
//      thick wall's line are infill (windows when on the outside).
//      Ends are snapped into corners and T-junctions.
//   5. Walls are grouped into connected networks; separate networks are
//      separate plans (several floors drawn in one image). Isolated short
//      pieces (usually text) are dropped.
//   6. A morphological closing of each plan gives its footprint; walls on the
//      footprint boundary are exterior.
//   7. A scale estimate from the most common door opening width.
//
// Results are suggestions for the person to review.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Ink mask: 1 where a pixel is likely part of a wall or line. */
export function inkMask({ data, width, height }) {
  const n = width * height;
  const lum = new Uint8Array(n);
  const ink = new Uint8Array(n);
  let sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = data[p + 3] / 255;
    const r = data[p] * a + 255 * (1 - a), g = data[p + 1] * a + 255 * (1 - a), b = data[p + 2] * a + 255 * (1 - a);
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    sum += l;
  }
  // Light-on-dark plans (blueprint style) are inverted.
  const invert = sum / n < 110;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    const l = invert ? 255 - lum[i] : lum[i];
    if ((l < 115 && sat < 0.4) || (l < 188 && sat < 0.14)) ink[i] = 1;
  }
  return { ink, lum, invert };
}

/**
 * Group runs of ink of at least `minLen` along rows into bands, in
 * (along, across) coordinates: horizontal bands have a = x, b = y.
 * `transpose` scans columns.
 */
export function bands(ink, width, height, minLen, transpose) {
  const W = transpose ? height : width;
  const H = transpose ? width : height;
  const at = transpose ? (a, b) => ink[a * width + b] : (a, b) => ink[b * width + a];
  const rs = [], re = [], rb = [];
  const lineStart = new Int32Array(H + 1);
  for (let b = 0; b < H; b++) {
    lineStart[b] = rs.length;
    let a = 0;
    while (a < W) {
      if (!at(a, b)) { a++; continue; }
      let e = a;
      while (e + 1 < W && at(e + 1, b)) e++;
      if (e - a + 1 >= minLen) { rs.push(a); re.push(e); rb.push(b); }
      a = e + 1;
    }
  }
  lineStart[H] = rs.length;
  const R = rs.length;
  const parent = new Int32Array(R);
  for (let i = 0; i < R; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let b = 1; b < H; b++) {
    let j = lineStart[b - 1];
    for (let i = lineStart[b]; i < lineStart[b + 1]; i++) {
      for (let k = j; k < lineStart[b]; k++) {
        if (re[k] < rs[i]) { j = k + 1; continue; }
        if (rs[k] > re[i]) break;
        const ov = Math.min(re[i], re[k]) - Math.max(rs[i], rs[k]) + 1;
        // Similar runs only: a wall's short cross-section must not join the
        // long run of a perpendicular wall it touches.
        if (ov >= 0.6 * Math.max(re[i] - rs[i] + 1, re[k] - rs[k] + 1)) {
          const x = find(i), y = find(k);
          if (x !== y) parent[x] = y;
        }
      }
    }
  }
  const groups = new Map();
  for (let i = 0; i < R; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(i);
  }
  const out = [];
  for (const idx of groups.values()) {
    let A0 = Infinity, A1 = -Infinity;
    for (const i of idx) { if (rs[i] < A0) A0 = rs[i]; if (re[i] > A1) A1 = re[i]; }
    const span = A1 - A0 + 1;
    // Coverage: how many rows of the band are inked at each along-position.
    const diff = new Int32Array(span + 1);
    const wsum = new Float64Array(span + 1);
    for (const i of idx) { diff[rs[i] - A0]++; diff[re[i] - A0 + 1]--; wsum[rs[i] - A0] += rb[i]; wsum[re[i] - A0 + 1] -= rb[i]; }
    const cov = new Int32Array(span);
    const bsum = new Float64Array(span);
    let c = 0, w = 0;
    for (let a = 0; a < span; a++) { c += diff[a]; w += wsum[a]; cov[a] = c; bsum[a] = w; }
    const sorted = Array.from(cov).sort((x, y) => x - y);
    const t = Math.max(1, sorted[Math.floor(sorted.length * 0.9)]);
    // Split into solid pieces (most rows inked) and thin pieces (a window's
    // glazing lines running through a gap in the wall).
    const thr = t >= 3 ? Math.max(2, Math.ceil(0.6 * t)) : 1;
    let a = 0;
    while (a < span) {
      const solid = cov[a] >= thr;
      let e = a;
      while (e + 1 < span && (cov[e + 1] >= thr) === solid && cov[e + 1] > 0) e++;
      if (cov[a] > 0) {
        // Rows that cover most of this stretch, split into contiguous blocks:
        // each block is one stroke (a wall, or a line running beside it).
        const len = e - a + 1, lo = A0 + a, hi = A0 + e;
        const rowCov = new Map();
        for (const i of idx) {
          const ov = Math.min(re[i], hi) - Math.max(rs[i], lo) + 1;
          if (ov > 0) rowCov.set(rb[i], (rowCov.get(rb[i]) || 0) + ov);
        }
        const rowsIn = [...rowCov.entries()].filter(([, v]) => v >= 0.5 * len).map(([b]) => b).sort((x, y) => x - y);
        let k = 0;
        while (k < rowsIn.length) {
          let m = k;
          while (m + 1 < rowsIn.length && rowsIn[m + 1] === rowsIn[m] + 1) m++;
          const tt = rowsIn[m] - rowsIn[k] + 1;
          let px = 0;
          for (let r = k; r <= m; r++) px += rowCov.get(rowsIn[r]);
          out.push({ a0: lo, a1: hi, b0: rowsIn[k], b1: rowsIn[m], t: tt, c: (rowsIn[k] + rowsIn[m]) / 2, px, fill: px / (len * tt), thinPart: !solid });
          k = m + 1;
        }
      }
      a = e + 1;
    }
  }
  return out;
}

/** Thin parallel lines a consistent distance apart → outlined walls. */
function pairOutlines(thin, maxGap, sample, allowPlain) {
  const sorted = [...thin].sort((p, q) => p.c - q.c);
  const cands = [];
  for (let i = 0; i < sorted.length; i++) {
    const A = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const B = sorted[j];
      const gap = B.b0 - A.b1 - 1;
      if (gap > maxGap) break;
      if (gap < 1) continue;
      const lo = Math.max(A.a0, B.a0), hi = Math.min(A.a1, B.a1);
      const ov = hi - lo;
      if (ov < 0.5 * Math.min(A.a1 - A.a0, B.a1 - B.a0) || ov < 3 * (gap + 2)) continue;
      // A wall's inside is filled or hatched differently from the rooms on
      // either side; furniture and window frames are not. Judge each
      // position, so a wall interrupted by windows becomes separate pieces.
      const off = Math.max(2, Math.round(gap / 2));
      const step = Math.max(1, Math.floor((hi - lo) / 400));
      const ok = [];
      for (let a = lo; a <= hi; a += step) {
        // Fill colour: the un-inked pixels between the lines.
        let inL = 0, inInk = 0, m = 0, nb = 0;
        for (let b = A.b1 + 1; b < B.b0; b++) { const v = sample(a, b); m++; if (v.ink) inInk++; else { inL += v.l; nb++; } }
        const sa = sample(a, A.b0 - off).l, sb = sample(a, B.b1 + off).l;
        const fillL = nb ? inL / nb : -1;
        ok.push(allowPlain || inInk / m >= 0.45 || (nb > 0 && Math.abs(fillL - sa) >= 10 && Math.abs(fillL - sb) >= 10));
      }
      let k = 0;
      while (k < ok.length) {
        if (!ok[k]) { k++; continue; }
        let e = k;
        while (e + 1 < ok.length && ok[e + 1]) e++;
        const plo = lo + k * step, phi = Math.min(hi, lo + e * step);
        if (phi - plo >= 3 * (gap + 2)) cands.push({ A, B, gap, lo: plo, hi: phi, ov: phi - plo });
        k = e + 1;
      }
    }
  }
  if (!cands.length) return [];
  // The drawing's wall width shows up as the most common gap.
  const hist = new Map();
  for (const p of cands) hist.set(p.gap, (hist.get(p.gap) || 0) + p.ov);
  let g0 = 0, best = 0;
  for (const [g, v] of hist) {
    const s = v + 0.5 * ((hist.get(g - 1) || 0) + (hist.get(g + 1) || 0));
    if (s > best) { best = s; g0 = g; }
  }
  const lim = Math.max(g0 * 1.5, g0 + 3);
  const walls = [];
  for (const p of cands) {
    if (p.gap > lim || p.gap < Math.max(1, g0 * 0.5)) continue;
    walls.push({ a0: p.lo, a1: p.hi, b0: p.A.b0, b1: p.B.b1, t: p.B.b1 - p.A.b0 + 1, c: (p.A.b0 + p.B.b1) / 2, px: p.ov * 2, hollow: true, parts: [p.A, p.B] });
  }
  return walls;
}

/** Group pieces lying on the same line (same across-position). */
function lines(pieces, tolFn) {
  const sorted = [...pieces].sort((p, q) => p.c - q.c);
  const out = [];
  for (const w of sorted) {
    const L = out[out.length - 1];
    if (L && Math.abs(w.c - L.c) <= tolFn(L, w)) {
      L.items.push(w);
      L.t = Math.max(L.t, w.t);
      // Thick, long pieces define where the line is.
      let s = 0, n = 0;
      for (const it of L.items) { const k = (it.a1 - it.a0 + 1) * it.t * it.t; s += it.c * k; n += k; }
      L.c = s / n;
    } else out.push({ c: w.c, t: w.t, items: [w] });
  }
  return out;
}

/**
 * Turn pieces into merged walls along each line. Thin pieces on the line of
 * a much thicker wall are infill (window sills, door thresholds).
 * Returns { walls, infill, openings }.
 */
function buildLines(pieces, joinGap, maxOpening) {
  const L = lines(pieces, (l, w) => Math.max(1.5, (l.t + w.t) / 4 + 1));
  const walls = [], infill = [], openings = [];
  for (const line of L) {
    const thick = line.items.filter((w) => !w.hollow && !w.thinLine).reduce((m, w) => Math.max(m, w.t), 0);
    const items = line.items.sort((p, q) => p.a0 - q.a0);
    const main = [], sub = [];
    for (const w of items) {
      if (w.thinLine) { if (thick) sub.push(w); continue; }
      (thick && w.t < 0.65 * thick ? sub : main).push(w);
    }
    // Merge main pieces.
    const merged = [];
    for (const w of main) {
      const cur = merged[merged.length - 1];
      if (cur && w.a0 - cur.a1 <= joinGap) {
        cur.a1 = Math.max(cur.a1, w.a1);
        cur.t = Math.max(cur.t, w.t);
        cur.px += w.px;
        cur.hollow = cur.hollow && w.hollow;
      } else merged.push({ a0: w.a0, a1: w.a1, t: w.t, c: line.c, px: w.px, hollow: !!w.hollow });
    }
    for (let k = 0; k < merged.length; k++) {
      walls.push(merged[k]);
      if (k > 0) {
        const gap = merged[k].a0 - merged[k - 1].a1;
        if (gap <= maxOpening) openings.push({ c: line.c, a0: merged[k - 1].a1, a1: merged[k].a0, t: Math.max(merged[k].t, merged[k - 1].t) });
      }
    }
    // Infill only counts where the wall itself is missing (glazing in a gap).
    for (const w of sub) {
      let segsIn = [[w.a0, w.a1]];
      for (const m of merged) {
        const next = [];
        for (const [x0, x1] of segsIn) {
          if (m.a1 < x0 || m.a0 > x1) { next.push([x0, x1]); continue; }
          if (m.a0 > x0) next.push([x0, m.a0]);
          if (m.a1 < x1) next.push([m.a1, x1]);
        }
        segsIn = next;
      }
      for (const [x0, x1] of segsIn) if (x1 - x0 >= Math.max(3, 1.5 * thick)) infill.push({ a0: x0, a1: x1, t: thick, c: line.c });
    }
  }
  return { walls, infill, openings };
}

/** Snap wall ends onto perpendicular walls so corners and T-junctions close. */
function snapJunctions(hs, vs) {
  const reach = (a, b) => Math.max(a.t, b.t) * 0.9 + 3;
  const snap = (list, other) => {
    for (const h of list) {
      for (const end of ['a0', 'a1']) {
        let best = null, bestD = Infinity;
        for (const v of other) {
          const r = reach(h, v);
          if (h.c < v.a0 - r || h.c > v.a1 + r) continue;
          const d = Math.abs(h[end] - v.c);
          if (d <= r + v.t / 2 && d < bestD) { bestD = d; best = v; }
        }
        if (best) {
          h[end] = best.c;
          if (h.c < best.a0) best.a0 = h.c;
          if (h.c > best.a1) best.a1 = h.c;
        }
      }
    }
  };
  snap(hs, vs);
  snap(vs, hs);
}

function segOf(w, axis) {
  return axis === 'h' ? { x1: w.a0, y1: w.c, x2: w.a1, y2: w.c, t: w.t } : { x1: w.c, y1: w.a0, x2: w.c, y2: w.a1, t: w.t };
}

function segDist(p, q) {
  // Axis-aligned segments: distance between their rectangles.
  const ax0 = Math.min(p.x1, p.x2), ax1 = Math.max(p.x1, p.x2), ay0 = Math.min(p.y1, p.y2), ay1 = Math.max(p.y1, p.y2);
  const bx0 = Math.min(q.x1, q.x2), bx1 = Math.max(q.x1, q.x2), by0 = Math.min(q.y1, q.y2), by1 = Math.max(q.y1, q.y2);
  const dx = Math.max(0, bx0 - ax1, ax0 - bx1), dy = Math.max(0, by0 - ay1, ay0 - by1);
  return Math.hypot(dx, dy);
}

/** Closing of a plan's walls → outside mask on a coarse grid. */
function outsideMask(segs, cols, rows, cell, R) {
  const N = cols * rows;
  const dist = new Float32Array(N).fill(Infinity);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const s of segs) {
    const r = s.t / 2;
    const x0 = clamp(Math.floor((Math.min(s.x1, s.x2) - r) / cell), 0, cols - 1), x1 = clamp(Math.floor((Math.max(s.x1, s.x2) + r) / cell), 0, cols - 1);
    const y0 = clamp(Math.floor((Math.min(s.y1, s.y2) - r) / cell), 0, rows - 1), y1 = clamp(Math.floor((Math.max(s.y1, s.y2) + r) / cell), 0, rows - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * cols + x; if (dist[i]) { dist[i] = 0; q[qt++] = i; } }
  }
  const bfs = (d, queue, qtEnd, limit) => {
    let h = 0, t = qtEnd;
    while (h < t) {
      const i = queue[h++];
      const x = i % cols, y = (i - x) / cols;
      const nd = d[i] + 1;
      if (nd > limit) continue;
      const nb = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1];
      for (const j of nb) if (j >= 0 && d[j] > nd) { d[j] = nd; queue[t++] = j; }
    }
  };
  const Rc = Math.max(1, Math.round(R / cell));
  bfs(dist, q, qt, Rc);
  // Flood the outside of the dilated walls from the border.
  const outD = new Uint8Array(N);
  qh = 0; qt = 0;
  const push = (i) => { if (dist[i] > Rc && !outD[i]) { outD[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < cols; x++) { push(x); push((rows - 1) * cols + x); }
  for (let y = 0; y < rows; y++) { push(y * cols); push(y * cols + cols - 1); }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % cols, y = (i - x) / cols;
    if (x > 0) push(i - 1);
    if (x < cols - 1) push(i + 1);
    if (y > 0) push(i - cols);
    if (y < rows - 1) push(i + cols);
  }
  // Erode back: everything within Rc of that outside is outside too.
  const d2 = new Float32Array(N).fill(Infinity);
  qt = 0;
  for (let i = 0; i < N; i++) if (outD[i]) { d2[i] = 0; q[qt++] = i; }
  bfs(d2, q, qt, Rc);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = d2[i] <= Rc ? 1 : 0;
  return out;
}

/** Fraction of an opening's centre line covered by any ink (window glazing lines). */
function inkAlong(ink, width, height, o, axis) {
  const half = Math.max(1, Math.ceil(o.t / 2));
  let hits = 0, n = 0;
  for (let a = Math.ceil(o.a0) + 1; a < o.a1 - 1; a++) {
    n++;
    let any = false;
    for (let d = -half; d <= half && !any; d++) {
      const x = axis === 'h' ? a : Math.round(o.c + d), y = axis === 'h' ? Math.round(o.c + d) : a;
      if (x >= 0 && y >= 0 && x < width && y < height && ink[y * width + x]) any = true;
    }
    if (any) hits++;
  }
  return n ? hits / n : 0;
}

/**
 * Trace walls in an RGBA image ({ data, width, height }).
 * Returns {
 *   walls: [{ x1, y1, x2, y2, thickness, exterior, kind: 'wall'|'window', plan }],
 *   plans: [{ x, y, w, h }] separate building footprints (reading order),
 *   doorPx: typical door opening width in pixels, or null,
 *   stats
 * }
 */
export function traceWalls(img, opts = {}) {
  const { width, height } = img;
  const minSide = Math.min(width, height);
  const { ink, lum } = inkMask(img);
  const minLen = Math.max(8, Math.round(minSide * (opts.minLenFrac ?? 0.02)));
  const maxT = Math.max(8, Math.round(minSide * 0.045));

  const raw = { h: bands(ink, width, height, minLen, false), v: bands(ink, width, height, minLen, true) };

  // Thickness separating line work from walls: thin strokes dominate the
  // length-weighted distribution; walls are clearly thicker.
  const all = [...raw.h, ...raw.v].filter((b) => b.t <= maxT);
  const byLen = all.map((b) => [b.t, b.a1 - b.a0 + 1]).sort((p, q) => p[0] - q[0]);
  const total = byLen.reduce((s, p) => s + p[1], 0);
  let acc = 0, p30 = 1;
  for (const [t, l] of byLen) { acc += l; if (acc >= 0.3 * total) { p30 = t; break; } }
  // Clean drawings with little line work: the 30th percentile is already a
  // wall, so never demand more than half the typical thick stroke.
  const thick = byLen.filter((p) => p[0] >= 3);
  const thickTotal = thick.reduce((s, p) => s + p[1], 0);
  let acc3 = 0, medThick = 3;
  for (const [t, l] of thick) { acc3 += l; if (acc3 >= thickTotal / 2) { medThick = t; break; } }
  const tMin = Math.max(3, Math.min(Math.ceil(p30 * 1.5), Math.ceil(medThick * 0.5)));

  const solidOf = (B) => B.filter((b) => b.t >= tMin && b.t <= maxT && b.fill >= 0.55 && b.a1 - b.a0 + 1 >= Math.max(minLen, 2.2 * b.t));
  const longLen = (list) => list.reduce((s, w) => s + (w.a1 - w.a0 >= 3 * minLen && w.t >= 5 ? w.a1 - w.a0 : 0), 0);
  // Drawings with no clearly thick walls at all may outline walls in plain lines.
  const allowPlain = longLen(solidOf(raw.h)) + longLen(solidOf(raw.v)) < minSide * 0.5;
  const axes = {};
  for (const ax of ['h', 'v']) {
    const B = raw[ax];
    const sample = ax === 'h'
      ? (a, b) => { const x = clamp(a, 0, width - 1), y = clamp(b, 0, height - 1); return { l: lum[y * width + x], ink: ink[y * width + x] }; }
      : (a, b) => { const x = clamp(b, 0, width - 1), y = clamp(a, 0, height - 1); return { l: lum[y * width + x], ink: ink[y * width + x] }; };
    let solid = solidOf(B);
    const thin = B.filter((b) => b.t <= Math.max(tMin, 4) && b.t < maxT / 2);
    const hollow = pairOutlines(thin, maxT, sample, allowPlain)
      .filter((w) => w.t <= maxT && w.a1 - w.a0 + 1 >= Math.max(minLen, 2.2 * w.t));
    // Outline strokes that form a pair are not walls of their own.
    const used = new Set(hollow.flatMap((w) => w.parts));
    solid = solid.filter((b) => !used.has(b));
    // Drop outline pairs that lie inside a solid wall (its two edges).
    const solidCover = (w) => solid.some((s) => Math.abs(s.c - w.c) <= s.t / 2 && w.a0 >= s.a0 - 2 && w.a1 <= s.a1 + 2);
    const edge = 2, lim = ax === 'h' ? height : width;
    // Thin lines are kept only as possible window glazing inside wall lines.
    const thinLines = B.filter((b) => b.t < tMin && b.a1 - b.a0 + 1 >= minLen && !used.has(b)).map((b) => ({ ...b, thinLine: true }));
    axes[ax] = [...solid, ...hollow.filter((w) => !solidCover(w)), ...thinLines].filter((b) => b.c > edge && b.c < lim - 1 - edge);
  }
  const allT = [...axes.h, ...axes.v].filter((w) => !w.thinLine).map((w) => w.t).sort((a, b) => a - b);
  const mode = allT.length ? allT[Math.floor(allT.length / 2)] : tMin;
  const joinGap = Math.max(3, mode * 1.3);
  const maxOpening = Math.max(minLen * 3, minSide * 0.22);

  let H = buildLines(axes.h, joinGap, maxOpening);
  let V = buildLines(axes.v, joinGap, maxOpening);
  snapJunctions(H.walls, V.walls);
  // Snapping can line pieces up; rebuild once so they merge.
  H = { ...buildLines(H.walls, joinGap, maxOpening), infill: H.infill };
  V = { ...buildLines(V.walls, joinGap, maxOpening), infill: V.infill };
  const minWall = Math.max(minLen * 0.8, 2 * mode);
  let segs = [
    ...H.walls.filter((w) => w.a1 - w.a0 >= Math.max(minWall, 2 * w.t)).map((w) => ({ ...segOf(w, 'h'), axis: 'h', hollow: w.hollow })),
    ...V.walls.filter((w) => w.a1 - w.a0 >= Math.max(minWall, 2 * w.t)).map((w) => ({ ...segOf(w, 'v'), axis: 'v', hollow: w.hollow })),
  ];

  // Strokes much thinner than the drawing's typical wall are dimension
  // lines, leaders or furniture outlines that happen to be long.
  {
    const byT = segs.map((x) => [x.t, Math.hypot(x.x2 - x.x1, x.y2 - x.y1)]).sort((p, q) => p[0] - q[0]);
    const tot = byT.reduce((a, p) => a + p[1], 0);
    let acc2 = 0, medT = tMin;
    for (const [t, l] of byT) { acc2 += l; if (acc2 >= tot / 2) { medT = t; break; } }
    segs = segs.filter((x) => x.t >= 0.4 * medT);
  }
  // Connected wall networks.
  const n = segs.length;
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const collinearGap = (p, q) => {
    if (p.axis !== q.axis) return Infinity;
    const pc = p.axis === 'h' ? p.y1 : p.x1, qc = q.axis === 'h' ? q.y1 : q.x1;
    if (Math.abs(pc - qc) > Math.max(p.t, q.t) / 2 + 1) return Infinity;
    const pa0 = p.axis === 'h' ? p.x1 : p.y1, pa1 = p.axis === 'h' ? p.x2 : p.y2;
    const qa0 = q.axis === 'h' ? q.x1 : q.y1, qa1 = q.axis === 'h' ? q.x2 : q.y2;
    const gap = Math.max(qa0 - pa1, pa0 - qa1, 0);
    if (gap <= joinGap * 2) return gap;
    // Longer gaps link only when something is drawn across them (a window).
    const o = { c: pc, a0: Math.min(pa1, qa1), a1: Math.max(pa0, qa0), t: Math.max(p.t, q.t) };
    if (o.a1 <= o.a0) return gap;
    return inkAlong(ink, width, height, o, p.axis) >= 0.6 ? gap : Infinity;
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const touch = segDist(segs[i], segs[j]) <= Math.max(segs[i].t, segs[j].t) * 0.75 + 2;
    if (touch || collinearGap(segs[i], segs[j]) <= maxOpening) { const a = find(i), b = find(j); if (a !== b) par[a] = b; }
  }
  const nets = new Map();
  segs.forEach((s, i) => { const r = find(i); if (!nets.has(r)) nets.set(r, []); nets.get(r).push(s); });
  const len = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const box = (list) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, L = 0;
    for (const s of list) { x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2); L += len(s); }
    return { list, x0, y0, x1, y1, L };
  };
  // Networks whose boxes overlap belong to the same plan.
  // A lone short piece touching nothing is almost always text or a symbol.
  const netLen = (l) => l.reduce((a, x) => a + len(x), 0);
  const isLone = (l) => netLen(l) < Math.max(minLen * 3.5, minSide * 0.09);
  let plansG = [...nets.values()].filter((l) => !isLone(l)).map(box);
  const lone = [...nets.values()].filter(isLone).flat();
  const pad = minSide * 0.008;
  const bridge = Math.max(mode * 3, minSide * 0.075);
  const mergeBoxes = () => {
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < plansG.length; i++) for (let j = i + 1; j < plansG.length; j++) {
      const a = plansG[i], b = plansG[j];
      const boxes = a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;
      // Networks a doorway apart are one building; separate drawings on one
      // sheet sit further apart than any door.
      const near = !boxes && a.x0 - bridge <= b.x1 && b.x0 - bridge <= a.x1 && a.y0 - bridge <= b.y1 && b.y0 - bridge <= a.y1
        && a.list.some((p) => b.list.some((q) => segDist(p, q) <= bridge));
      if (boxes || near) {
        plansG[i] = box([...a.list, ...b.list]);
        plansG.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  };
  mergeBoxes();
  // Short isolated pieces near a plan (wall stubs between windows and doors)
  // join it; anything else (text, symbols) is dropped.
  const cOf = (w) => (w.axis === 'h' ? w.y1 : w.x1);
  const sameLine = (p, q) => {
    if (p.axis !== q.axis || Math.abs(cOf(p) - cOf(q)) > Math.max(p.t, q.t) / 2 + 1) return false;
    const pa0 = p.axis === 'h' ? p.x1 : p.y1, pa1 = p.axis === 'h' ? p.x2 : p.y2;
    const qa0 = q.axis === 'h' ? q.x1 : q.y1, qa1 = q.axis === 'h' ? q.x2 : q.y2;
    return Math.max(qa0 - pa1, pa0 - qa1, 0) <= maxOpening;
  };
  // Stubs between doors and windows: on a line shared with a plan wall or
  // with other stubs, close to the plan, and as thick as walls. Letters in
  // labels rarely line up like that.
  const pending = lone.filter((s) => s.t >= 0.6 * mode);
  for (let changed = true; changed;) {
    changed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const s = pending[i];
      const lined = (host) => host.list.some((w) => sameLine(w, s)) || pending.some((o) => o !== s && sameLine(o, s));
      const host = plansG.find((p) => p.list.some((w) => segDist(w, s) <= bridge) && lined(p));
      if (host) { host.list.push(s); Object.assign(host, box(host.list)); pending.splice(i, 1); changed = true; }
    }
  }
  mergeBoxes();
  plansG.sort((a, b) => b.L - a.L);
  const bigL = plansG.length ? plansG[0].L : 0;
  const plans = plansG.filter((p) => p.L >= 0.25 * bigL && p.list.length >= 4);
  // Reading order: rows top to bottom, then left to right.
  plans.sort((a, b) => {
    const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (overlapY > 0.3 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) return a.x0 - b.x0;
    return a.y0 - b.y0;
  });

  // Exterior classification per plan.
  const walls = [];
  const doorWidths = [];
  const allOpenings = [...H.openings.map((o) => ({ ...o, axis: 'h' })), ...V.openings.map((o) => ({ ...o, axis: 'v' }))];
  const allInfill = [...H.infill.map((o) => ({ ...o, axis: 'h' })), ...V.infill.map((o) => ({ ...o, axis: 'v' }))];
  plans.forEach((P, pi) => {
    const span = Math.max(P.x1 - P.x0, P.y1 - P.y0);
    const cell = Math.max(1, Math.round(mode / 2));
    const R = Math.max(mode * 2, span * 0.06);
    // The grid extends past the image so walls drawn at the very edge still
    // have an outside.
    const ox = Math.floor(P.x0 - R * 2 - cell * 2), oy = Math.floor(P.y0 - R * 2 - cell * 2);
    const cols = Math.ceil((P.x1 + R * 2 + cell * 2 - ox) / cell) + 2;
    const rows = Math.ceil((P.y1 + R * 2 + cell * 2 - oy) / cell) + 2;
    // Openings and windows are closed so the outside cannot leak into rooms.
    const closers = [...allOpenings, ...allInfill].filter((o) => o.a1 - o.a0 <= maxOpening).map((o) => ({ ...segOf(o, o.axis) }))
      .filter((c) => c.x1 >= P.x0 - 2 && c.x2 <= P.x1 + 2 && c.y1 >= P.y0 - 2 && c.y2 <= P.y1 + 2);
    const local = [...P.list, ...closers].map((s) => ({ x1: s.x1 - ox, y1: s.y1 - oy, x2: s.x2 - ox, y2: s.y2 - oy, t: s.t }));
    const out = outsideMask(local, cols, rows, cell, R);
    const isOut = (x, y) => {
      const cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return true;
      return out[cy * cols + cx] === 1;
    };
    const sideOut = (seg, frac) => {
      const L = len(seg) || 1;
      const nx = -(seg.y2 - seg.y1) / L, ny = (seg.x2 - seg.x1) / L;
      const off = seg.t / 2 + cell * 2;
      let k = 0, m = 0;
      for (let i = 1; i < 10; i++) {
        const x = seg.x1 + ((seg.x2 - seg.x1) * i) / 10, y = seg.y1 + ((seg.y2 - seg.y1) * i) / 10;
        m++;
        if (isOut(x + nx * off, y + ny * off) || isOut(x - nx * off, y - ny * off)) k++;
      }
      return k / m >= frac;
    };
    for (const s of P.list) walls.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, thickness: s.t, exterior: sideOut(s, 0.5), kind: 'wall', plan: pi });
    const inPlan = (o) => {
      const s = segOf(o, o.axis);
      const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
      return mx >= P.x0 - 2 && mx <= P.x1 + 2 && my >= P.y0 - 2 && my <= P.y1 + 2;
    };
    // Openings: exterior ones with glazing lines are windows; the rest doors.
    for (const o of allOpenings) {
      if (!inPlan(o)) continue;
      const s = segOf(o, o.axis);
      const w = o.a1 - o.a0;
      if (w < 1.5 * o.t) continue;
      if (sideOut(s, 0.5) && inkAlong(ink, width, height, o, o.axis) >= 0.8) walls.push({ ...s, thickness: o.t, exterior: true, kind: 'window', plan: pi });
      else doorWidths.push(w);
    }
    for (const o of allInfill) {
      if (!inPlan(o)) continue;
      const s = segOf(o, o.axis);
      if (o.a1 - o.a0 < 1.5 * o.t) continue;
      if (sideOut(s, 0.5)) walls.push({ ...s, thickness: o.t, exterior: true, kind: 'window', plan: pi });
    }
  });
  // Windows from infill can duplicate windows from openings; keep one.
  const dedup = [];
  for (const w of walls) {
    if (w.kind === 'window' && dedup.some((d) => d.kind === 'window' && overlapSame(d, w))) continue;
    dedup.push(w);
  }

  return {
    walls: dedup,
    plans: plans.map((p) => ({ x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0 })),
    doorPx: typicalDoor(doorWidths),
    stats: { tMin, mode, minLen, maxT, bandsH: raw.h.length, bandsV: raw.v.length, doors: doorWidths.length },
  };
}

function overlapSame(a, b) {
  const ha = a.y1 === a.y2, hb = b.y1 === b.y2;
  if (ha !== hb) return false;
  if (ha) {
    if (Math.abs(a.y1 - b.y1) > Math.max(a.thickness, b.thickness) / 2) return false;
    return Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) > 0.5 * Math.abs(b.x2 - b.x1);
  }
  if (Math.abs(a.x1 - b.x1) > Math.max(a.thickness, b.thickness) / 2) return false;
  return Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)) > 0.5 * Math.abs(b.y2 - b.y1);
}

/** Most common opening width (cluster within ±15 %). */
export function typicalDoor(widths) {
  if (widths.length < 3) return null;
  const s = [...widths].sort((a, b) => a - b);
  let best = null, bestN = 0;
  for (const w of s) {
    const n = s.filter((v) => v >= w * 0.87 && v <= w * 1.15).length;
    if (n > bestN) { bestN = n; best = w; }
  }
  if (bestN < 3) return null;
  const cluster = s.filter((v) => v >= best * 0.87 && v <= best * 1.15);
  return cluster[Math.floor(cluster.length / 2)];
}

/**
 * Find a drawing-scale note in PDF text, such as 1/4" = 1'-0", 1:100 or
 * SCALE 1/8"=1'. Returns { mPerPt, note } (metres of real length per PDF
 * point and the note as written), or null.
 * Sheets with more than one distinct scale return null.
 */
export function scaleFromText(text) {
  const found = new Map();
  const t = String(text).replace(/[\u2032\u2019]/g, "'").replace(/[\u2033\u201d]/g, '"');
  const imp = /(?:(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?))\s*(?:"|in\b|inch)\s*=\s*(\d+)\s*'(?:\s*-?\s*0\s*"?)?/gi;
  let m;
  while ((m = imp.exec(t))) {
    const inches = m[1] ? Number(m[1]) / Number(m[2]) : Number(m[3]);
    const feet = Number(m[4]);
    if (inches > 0 && feet > 0) {
      const v = (feet * 0.3048) / (inches * 72);
      const k = v.toPrecision(6);
      if (!found.has(k)) found.set(k, { v, note: m[0].replace(/\s+/g, ' ').trim() });
    }
  }
  const met = /(?:scale|sc\.?|maßstab|massstab|echelle|échelle|escala|schaal)\s*[:=]?\s*1\s*:\s*(\d{1,4})\b/gi;
  while ((m = met.exec(t))) {
    const k = Number(m[1]);
    if (k >= 1 && k <= 5000) {
      const v = (0.0254 / 72) * k;
      const key = v.toPrecision(6);
      if (!found.has(key)) found.set(key, { v, note: `1:${k}` });
    }
  }
  if (found.size !== 1) return null;
  const [{ v, note }] = [...found.values()];
  return { mPerPt: v, note };
}

/** Parse a typed length: 45'6", 45' 6", 45-6, 12', 6", 13.5 m, 1350 mm, or a bare number in `defaultUnit`. Returns metres or null. */
export function parseLength(input, defaultUnit = 'ft') {
  const s = String(input).trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/,/g, '.');
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (m) return Number(m[1]) * 0.3048 + (m[2] ? Number(m[2]) * 0.0254 : 0);
  m = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (m && defaultUnit === 'ft') return Number(m[1]) * 0.3048 + Number(m[2]) * 0.0254;
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (m) return Number(m[1]) * 0.0254;
  m = s.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|meters?|metres?)$/);
  if (m) return Number(m[1]) * (m[2] === 'mm' ? 0.001 : m[2] === 'cm' ? 0.01 : 1);
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * (defaultUnit === 'ft' ? 0.3048 : defaultUnit === 'in' ? 0.0254 : 1);
  return null;
}
