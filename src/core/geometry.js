// Planar geometry used by drawing tools and the propagation engine.
// Coordinates are floor-plan pixels unless a function says otherwise.

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/**
 * Intersection of segment P (p1→p2) with segment Q (q1→q2).
 * Returns { t, u } (parameters along P and Q) or null when parallel or apart.
 */
export function segIntersect(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
  const rx = p2x - p1x, ry = p2y - p1y;
  const sx = q2x - q1x, sy = q2y - q1y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qpx = q1x - p1x, qpy = q1y - p1y;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const c = closestPointOnSegment(px, py, ax, ay, bx, by);
  return Math.hypot(px - c.x, py - c.y);
}

/** Even-odd point-in-polygon. pts = [{x,y},...] */
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shoelace area in px², always positive. */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return Math.abs(a) / 2;
}

/** Area centroid (falls back to vertex mean for degenerate polygons). */
export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    a += f;
    cx += (pts[j].x + pts[i].x) * f;
    cy += (pts[j].y + pts[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** A point well inside a polygon for labels (centroid when it is inside). */
export function labelPoint(pts, avoid = []) {
  const c = polygonCentroid(pts);
  const b = polygonBounds(pts);
  const edgeDist = (x, y) => {
    let d = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, distToSegment(x, y, pts[j].x, pts[j].y, pts[i].x, pts[i].y));
    return d;
  };
  const span = Math.min(b.maxX - b.minX, b.maxY - b.minY);
  const blocked = (x, y) => avoid.some((a) => pointInPolygon(x, y, a));
  if (pointInPolygon(c.x, c.y, pts) && !blocked(c.x, c.y) && edgeDist(c.x, c.y) > span * 0.25) return c;
  let best = c, bd = -1;
  const n = 18;
  for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
    const x = b.minX + ((b.maxX - b.minX) * i) / n, y = b.minY + ((b.maxY - b.minY) * j) / n;
    if (!pointInPolygon(x, y, pts) || blocked(x, y)) continue;
    const d = edgeDist(x, y) - 0.15 * Math.hypot(x - c.x, y - c.y);
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best;
}

export function polygonBounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Fraction of segment a→b that lies inside polygon pts (0..1). */
export function fractionInside(ax, ay, bx, by, pts) {
  const ts = [0, 1];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const hit = segIntersect(ax, ay, bx, by, pts[j].x, pts[j].y, pts[i].x, pts[i].y);
    if (hit && hit.t > 0 && hit.t < 1) ts.push(hit.t);
  }
  ts.sort((p, q) => p - q);
  let inside = 0;
  for (let k = 0; k < ts.length - 1; k++) {
    const t0 = ts[k], t1 = ts[k + 1];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (pointInPolygon(ax + (bx - ax) * tm, ay + (by - ay) * tm, pts)) inside += t1 - t0;
  }
  return inside;
}

/** Snap an angle so the segment from a to p is a multiple of `step` degrees. */
export function snapAngle(ax, ay, px, py, step = 45) {
  const len = Math.hypot(px - ax, py - ay);
  const ang = Math.atan2(py - ay, px - ax);
  const s = (step * Math.PI) / 180;
  const a2 = Math.round(ang / s) * s;
  return { x: ax + len * Math.cos(a2), y: ay + len * Math.sin(a2) };
}

/**
 * Uniform-grid spatial index over wall segments for fast ray queries.
 * segs: Float64Array [x1,y1,x2,y2,...]; losses: Float32Array per segment.
 */
export class SegmentGrid {
  constructor(segs, cellSize, bounds) {
    this.segs = segs;
    this.n = segs.length / 4;
    this.cell = Math.max(4, cellSize);
    const b = bounds || this.computeBounds();
    this.minX = b.minX - 1;
    this.minY = b.minY - 1;
    this.cols = Math.max(1, Math.ceil((b.maxX - this.minX + 2) / this.cell));
    this.rows = Math.max(1, Math.ceil((b.maxY - this.minY + 2) / this.cell));
    const buckets = Array.from({ length: this.cols * this.rows }, () => []);
    for (let i = 0; i < this.n; i++) {
      const x1 = segs[i * 4], y1 = segs[i * 4 + 1], x2 = segs[i * 4 + 2], y2 = segs[i * 4 + 3];
      const c0 = this.colOf(Math.min(x1, x2)), c1 = this.colOf(Math.max(x1, x2));
      const r0 = this.rowOf(Math.min(y1, y2)), r1 = this.rowOf(Math.max(y1, y2));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) buckets[r * this.cols + c].push(i);
    }
    this.buckets = buckets;
    this.stamp = new Uint32Array(this.n);
    this.ray = 0;
  }

  computeBounds() {
    let minX = 0, minY = 0, maxX = 1, maxY = 1;
    for (let i = 0; i < this.segs.length; i += 2) {
      minX = Math.min(minX, this.segs[i]);
      maxX = Math.max(maxX, this.segs[i]);
      minY = Math.min(minY, this.segs[i + 1]);
      maxY = Math.max(maxY, this.segs[i + 1]);
    }
    return { minX, minY, maxX, maxY };
  }

  colOf(x) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cell))); }
  rowOf(y) { return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.minY) / this.cell))); }

  /**
   * Visit each segment whose bucket the ray a→b passes through, at most once.
   * visit(i) is called with the segment index.
   */
  forEachCandidate(ax, ay, bx, by, visit) {
    this.ray = (this.ray + 1) >>> 0;
    if (this.ray === 0) { this.stamp.fill(0); this.ray = 1; }
    const stamp = this.stamp, ray = this.ray, cell = this.cell;
    let c = this.colOf(ax), r = this.rowOf(ay);
    const cEnd = this.colOf(bx), rEnd = this.rowOf(by);
    const dx = bx - ax, dy = by - ay;
    const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
    const fx = (ax - this.minX) / cell, fy = (ay - this.minY) / cell;
    let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? Math.floor(fx) + 1 : Math.floor(fx)) - fx) * cell / dx;
    let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? Math.floor(fy) + 1 : Math.floor(fy)) - fy) * cell / dy;
    const tDX = dx === 0 ? Infinity : Math.abs(cell / dx);
    const tDY = dy === 0 ? Infinity : Math.abs(cell / dy);
    let guard = this.cols + this.rows + 4;
    for (;;) {
      const bucket = this.buckets[r * this.cols + c];
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        if (stamp[i] !== ray) { stamp[i] = ray; visit(i); }
      }
      if ((c === cEnd && r === rEnd) || --guard <= 0) break;
      if (tMaxX < tMaxY) { tMaxX += tDX; c += stepC; if (c < 0 || c >= this.cols) break; }
      else { tMaxY += tDY; r += stepR; if (r < 0 || r >= this.rows) break; }
    }
  }
}

/**
 * Total wall loss (dB) along a→b. Each wall segment crossed adds its loss
 * once. A ray through a vertex shared by several segments (a corner or a
 * chained wall) counts that crossing once, using the largest loss there.
 */
export function wallLossAlong(grid, losses, ax, ay, bx, by) {
  if (!grid || grid.n === 0) return 0;
  const segs = grid.segs;
  let total = 0;
  let vN = 0;
  const vx = wallLossAlong._vx, vy = wallLossAlong._vy, vl = wallLossAlong._vl;
  grid.forEachCandidate(ax, ay, bx, by, (i) => {
    const o = i * 4;
    const hit = segIntersect(ax, ay, bx, by, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]);
    if (!hit || hit.t <= 1e-9 || hit.t >= 1 - 1e-9) return;
    const loss = losses[i];
    if (hit.u < 1e-6 || hit.u > 1 - 1e-6) {
      const x = ax + (bx - ax) * hit.t, y = ay + (by - ay) * hit.t;
      for (let k = 0; k < vN; k++) {
        if (Math.abs(vx[k] - x) < 0.5 && Math.abs(vy[k] - y) < 0.5) {
          if (loss > vl[k]) vl[k] = loss;
          return;
        }
      }
      if (vN < vx.length) { vx[vN] = x; vy[vN] = y; vl[vN] = loss; vN++; }
      return;
    }
    total += loss;
  });
  for (let k = 0; k < vN; k++) total += vl[k];
  return total;
}
wallLossAlong._vx = new Float64Array(64);
wallLossAlong._vy = new Float64Array(64);
wallLossAlong._vl = new Float64Array(64);
