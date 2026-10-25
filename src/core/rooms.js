// Room detection from walls: rasterise walls, close door-sized gaps, flood
// the outside, then trace each enclosed region into a simplified polygon.

/**
 * walls: [{x1,y1,x2,y2}] in px; scale m/px.
 * Returns [{ points: [{x,y}], areaPx }] for enclosed regions ≥ minAreaM2.
 */
export function detectRooms(walls, width, height, scale, { gapM = 1.0, minAreaM2 = 2 } = {}) {
  if (!walls.length || !scale) return [];
  const cellPx = Math.max(1, Math.min(0.2 / scale, Math.sqrt((width * height) / 250000)));
  const cols = Math.ceil(width / cellPx) + 2, rows = Math.ceil(height / cellPx) + 2;
  const N = cols * rows;
  const wall = new Uint8Array(N);
  const idx = (c, r) => r * cols + c;
  const toC = (x) => Math.floor(x / cellPx) + 1;

  // Rasterise walls (supercover by dense sampling).
  for (const w of walls) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const steps = Math.max(1, Math.ceil((len / cellPx) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const c = toC(w.x1 + (w.x2 - w.x1) * t), r = toC(w.y1 + (w.y2 - w.y1) * t);
      if (c >= 0 && c < cols && r >= 0 && r < rows) wall[idx(c, r)] = 1;
    }
  }

  // Close gaps up to gapM by dilating walls with radius gapM/2.
  const rad = Math.max(1, Math.round(gapM / 2 / scale / cellPx));
  const dil = dilate(wall, cols, rows, rad);

  // Flood the outside from the border.
  const label = new Int32Array(N); // 0 unvisited, -1 outside, -2 wall, >0 region
  for (let i = 0; i < N; i++) if (dil[i]) label[i] = -2;
  const stack = [];
  const flood = (start, value) => {
    stack.length = 0;
    stack.push(start);
    label[start] = value;
    let count = 0;
    while (stack.length) {
      const i = stack.pop();
      count++;
      const c = i % cols, r = (i / cols) | 0;
      if (c > 0 && label[i - 1] === 0) { label[i - 1] = value; stack.push(i - 1); }
      if (c < cols - 1 && label[i + 1] === 0) { label[i + 1] = value; stack.push(i + 1); }
      if (r > 0 && label[i - cols] === 0) { label[i - cols] = value; stack.push(i - cols); }
      if (r < rows - 1 && label[i + cols] === 0) { label[i + cols] = value; stack.push(i + cols); }
    }
    return count;
  };
  for (let c = 0; c < cols; c++) { if (label[idx(c, 0)] === 0) flood(idx(c, 0), -1); if (label[idx(c, rows - 1)] === 0) flood(idx(c, rows - 1), -1); }
  for (let r = 0; r < rows; r++) { if (label[idx(0, r)] === 0) flood(idx(0, r), -1); if (label[idx(cols - 1, r)] === 0) flood(idx(cols - 1, r), -1); }

  const rooms = [];
  let next = 1;
  const cellM2 = (cellPx * scale) ** 2;
  const counts = [];
  for (let i = 0; i < N; i++) {
    if (label[i] !== 0) continue;
    const id = next++;
    counts.push([id, flood(i, id)]);
  }
  for (const [id, count] of counts) {
    // Grow back by the dilation radius (and one more cell to reach wall centrelines).
    const region = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (label[k] === id) region[k] = 1;
    const grown = dilate(region, cols, rows, rad + 1);
    for (let k = 0; k < N; k++) if (grown[k] && label[k] !== -2 && label[k] !== id) grown[k] = 0;
    let grownCount = 0;
    for (let k = 0; k < N; k++) grownCount += grown[k];
    if (grownCount * cellM2 < minAreaM2 || count < 4) continue;
    const loop = traceOuter(grown, cols, rows);
    if (!loop || loop.length < 3) continue;
    const pts = simplify(loop, 0.8).map(([c, r]) => ({ x: (c - 1) * cellPx, y: (r - 1) * cellPx }));
    if (pts.length >= 3) rooms.push({ points: pts });
  }
  return rooms;
}

function dilate(src, cols, rows, rad) {
  // Separable square dilation.
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  for (let r = 0; r < rows; r++) {
    let run = -1;
    for (let c = 0; c < cols; c++) { if (src[r * cols + c]) run = c; if (run >= 0 && c - run <= rad) tmp[r * cols + c] = 1; }
    run = -1;
    for (let c = cols - 1; c >= 0; c--) { if (src[r * cols + c]) run = c; if (run >= 0 && run - c <= rad) tmp[r * cols + c] = 1; }
  }
  for (let c = 0; c < cols; c++) {
    let run = -1;
    for (let r = 0; r < rows; r++) { if (tmp[r * cols + c]) run = r; if (run >= 0 && r - run <= rad) out[r * cols + c] = 1; }
    run = -1;
    for (let r = rows - 1; r >= 0; r--) { if (tmp[r * cols + c]) run = r; if (run >= 0 && run - r <= rad) out[r * cols + c] = 1; }
  }
  return out;
}

/** Trace the longest closed boundary along cell edges of a binary mask. */
function traceOuter(mask, cols, rows) {
  const at = (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows ? mask[r * cols + c] : 0);
  // Directed edges with the region on the left (y down: clockwise on screen).
  const edges = new Map();
  const key = (x, y) => `${x},${y}`;
  const addEdge = (x1, y1, x2, y2) => edges.set(key(x1, y1), [x2, y2]);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!at(c, r)) continue;
    if (!at(c, r - 1)) addEdge(c, r, c + 1, r);
    if (!at(c + 1, r)) addEdge(c + 1, r, c + 1, r + 1);
    if (!at(c, r + 1)) addEdge(c + 1, r + 1, c, r + 1);
    if (!at(c - 1, r)) addEdge(c, r + 1, c, r);
  }
  let best = null;
  const seen = new Set();
  for (const start of edges.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let k = start;
    let guard = edges.size + 2;
    while (!seen.has(k) && guard-- > 0) {
      seen.add(k);
      const [x, y] = k.split(',').map(Number);
      loop.push([x, y]);
      const nxt = edges.get(k);
      if (!nxt) break;
      k = key(nxt[0], nxt[1]);
    }
    if (!best || loop.length > best.length) best = loop;
  }
  return best;
}

/** Douglas–Peucker on a closed loop, then drop collinear points. */
function simplify(loop, eps) {
  if (loop.length < 4) return loop;
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    let maxD = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1e-9;
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
    const left = dp(pts.slice(0, idx + 1));
    const right = dp(pts.slice(idx));
    return left.slice(0, -1).concat(right);
  };
  // Split the loop at its farthest point from the start to simplify as two chains.
  let far = 0, farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const a = dp(loop.slice(0, far + 1));
  const b = dp(loop.slice(far).concat([loop[0]]));
  return a.slice(0, -1).concat(b.slice(0, -1));
}
