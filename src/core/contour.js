// Marching squares: iso-lines of a scalar grid at a threshold.
// Output segments are in grid units (cell centers at i + 0.5).

export function contourSegments(values, cols, rows, threshold, isValid = (v) => v > -199) {
  const segs = [];
  const v = (c, r) => values[r * cols + c];
  const lerp = (a, b) => (threshold - a) / (b - a || 1e-9);
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = v(c, r), b = v(c + 1, r), d = v(c, r + 1), e = v(c + 1, r + 1);
      if (!isValid(a) || !isValid(b) || !isValid(d) || !isValid(e)) continue;
      const idx = (a >= threshold ? 8 : 0) | (b >= threshold ? 4 : 0) | (e >= threshold ? 2 : 0) | (d >= threshold ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = c + 0.5, y0 = r + 0.5;
      const top = [x0 + lerp(a, b), y0];
      const right = [x0 + 1, y0 + lerp(b, e)];
      const bottom = [x0 + lerp(d, e), y0 + 1];
      const left = [x0, y0 + lerp(a, d)];
      const add = (p, q) => segs.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1: case 14: add(left, bottom); break;
        case 2: case 13: add(bottom, right); break;
        case 3: case 12: add(left, right); break;
        case 4: case 11: add(top, right); break;
        case 6: case 9: add(top, bottom); break;
        case 7: case 8: add(left, top); break;
        case 5: add(left, top); add(bottom, right); break;
        case 10: add(top, right); add(left, bottom); break;
        default: break;
      }
    }
  }
  return segs;
}
