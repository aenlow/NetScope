// Wall tracing runs here so a large plan never blocks the interface.
import { traceWalls } from '../core/trace.js';

self.onmessage = (ev) => {
  const { id, width, height, buffer, factor } = ev.data;
  try {
    const res = traceWalls({ data: new Uint8ClampedArray(buffer), width, height });
    // Back to floor-plan pixel coordinates.
    const k = 1 / factor;
    for (const w of res.walls) { w.x1 *= k; w.y1 *= k; w.x2 *= k; w.y2 *= k; w.thickness *= k; }
    for (const p of res.plans) { p.x *= k; p.y *= k; p.w *= k; p.h *= k; }
    if (res.doorPx) res.doorPx *= k;
    self.postMessage({ id, ok: true, result: res });
  } catch (err) {
    self.postMessage({ id, ok: false, message: String(err?.message || err) });
  }
};
