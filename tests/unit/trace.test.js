import { describe, it, expect } from 'vitest';
import { traceWalls, scaleFromText, parseLength, typicalDoor } from '../../src/core/trace.js';

/** Minimal RGBA canvas for synthetic plans. */
function canvas(w, h) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x0, y0, x1, y1, v = 30) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const p = (y * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
    }
  };
  // Wall centred on a line, thickness t.
  const wall = (x1, y1, x2, y2, t, v) => {
    const r = Math.floor(t / 2);
    if (y1 === y2) rect(Math.min(x1, x2) - r, y1 - r, Math.max(x1, x2) + r, y1 + r, v);
    else rect(x1 - r, Math.min(y1, y2) - r, x1 + r, Math.max(y1, y2) + r, v);
  };
  return { img: { data, width: w, height: h }, rect, wall };
}

/** A simple house: exterior 10 px, one interior wall with a door, a front door and a window. */
function house(c, ox = 40, oy = 40) {
  c.wall(ox, oy, ox + 400, oy, 10);
  c.wall(ox + 400, oy, ox + 400, oy + 300, 10);
  c.wall(ox, oy + 300, ox + 160, oy + 300, 10); // front door 160..200
  c.wall(ox + 200, oy + 300, ox + 400, oy + 300, 10);
  c.wall(ox, oy, ox, oy + 120, 10); // window 120..180 on the west wall
  c.wall(ox, oy + 180, ox, oy + 300, 10);
  // Glazing: two thin lines across the window gap.
  c.rect(ox - 3, oy + 120, ox - 3, oy + 180, 60);
  c.rect(ox + 3, oy + 120, ox + 3, oy + 180, 60);
  c.wall(ox + 220, oy, ox + 220, oy + 130, 6); // interior with a door 130..170
  c.wall(ox + 220, oy + 170, ox + 220, oy + 300, 6);
}

const near = (a, b, tol = 4) => Math.abs(a - b) <= tol;
const findWall = (walls, x1, y1, x2, y2, tol = 6) => walls.find((w) =>
  (near(w.x1, x1, tol) && near(w.y1, y1, tol) && near(w.x2, x2, tol) && near(w.y2, y2, tol))
  || (near(w.x1, x2, tol) && near(w.y1, y2, tol) && near(w.x2, x1, tol) && near(w.y2, y1, tol)));

describe('wall tracing', () => {
  it('finds exterior and interior walls of a simple plan', () => {
    const c = canvas(500, 400);
    house(c);
    const r = traceWalls(c.img);
    const walls = r.walls.filter((w) => w.kind === 'wall');
    expect(r.plans.length).toBe(1);
    // North and east walls run the full length.
    const north = findWall(walls, 40, 40, 440, 40);
    const east = findWall(walls, 440, 40, 440, 340);
    expect(north?.exterior).toBe(true);
    expect(east?.exterior).toBe(true);
    // The interior wall is found in two pieces either side of its door and is interior.
    const inner = walls.filter((w) => near(w.x1, 260) && near(w.x2, 260));
    expect(inner.length).toBe(2);
    expect(inner.every((w) => !w.exterior)).toBe(true);
    // The front door stays open; the glazed gap in the west wall becomes a window.
    expect(walls.some((w) => near(w.y1, 340) && w.x1 < 230 && w.x2 > 230)).toBe(false);
    const win = r.walls.find((w) => w.kind === 'window');
    expect(win).toBeTruthy();
    expect(near(win.x1, 40)).toBe(true);
    expect(Math.min(win.y1, win.y2)).toBeGreaterThan(150);
    expect(Math.max(win.y1, win.y2)).toBeLessThan(230);
  });

  it('ignores thin line work and text-sized marks', () => {
    const c = canvas(500, 400);
    house(c);
    c.rect(10, 380, 490, 380, 0); // dimension line, 1 px
    c.rect(100, 100, 160, 100, 0); // furniture edge
    c.rect(300, 200, 304, 210, 0); // a letter stroke
    const r = traceWalls(c.img);
    expect(r.walls.some((w) => near(w.y1, 380) && near(w.y2, 380))).toBe(false);
    expect(r.walls.some((w) => near(w.y1, 100) && w.x1 > 90 && w.x2 < 170)).toBe(false);
  });

  it('separates two drawings on one sheet into plans in reading order', () => {
    const c = canvas(1000, 420);
    house(c, 40, 40);
    house(c, 540, 40);
    const r = traceWalls(c.img);
    expect(r.plans.length).toBe(2);
    expect(r.plans[0].x).toBeLessThan(r.plans[1].x);
    expect(r.walls.filter((w) => w.plan === 0).length).toBe(r.walls.filter((w) => w.plan === 1).length);
  });

  it('reads walls drawn as two outlines with a grey fill', () => {
    const c = canvas(500, 400);
    // Outlined walls: dark 2 px edges, light grey fill between.
    const outlined = (x1, y1, x2, y2) => {
      if (y1 === y2) { c.rect(x1, y1 - 5, x2, y1 + 5, 215); c.rect(x1, y1 - 5, x2, y1 - 4, 60); c.rect(x1, y1 + 4, x2, y1 + 5, 60); }
      else { c.rect(x1 - 5, y1, x1 + 5, y2, 215); c.rect(x1 - 5, y1, x1 - 4, y2, 60); c.rect(x1 + 4, y1, x1 + 5, y2, 60); }
    };
    outlined(40, 40, 440, 40); outlined(40, 340, 440, 340);
    outlined(40, 40, 40, 340); outlined(440, 40, 440, 340);
    outlined(240, 40, 240, 160); outlined(240, 210, 240, 340);
    const r = traceWalls(c.img);
    const walls = r.walls.filter((w) => w.kind === 'wall');
    expect(walls.length).toBeGreaterThanOrEqual(5);
    expect(findWall(walls, 40, 40, 440, 40, 8)?.exterior).toBe(true);
    expect(walls.some((w) => near(w.x1, 240, 3) && near(w.x2, 240, 3) && !w.exterior)).toBe(true);
  });

  it('returns nothing for a blank image', () => {
    const c = canvas(300, 200);
    const r = traceWalls(c.img);
    expect(r.walls).toEqual([]);
    expect(r.plans).toEqual([]);
  });
});

describe('scale helpers', () => {
  it('reads architectural and metric scale notes from PDF text', () => {
    // 1/4" = 1'-0": one foot is 18 points.
    expect(scaleFromText('FLOOR PLAN  SCALE: 1/4" = 1\'-0"').mPerPt).toBeCloseTo(0.3048 / 18, 8);
    expect(scaleFromText('scale 1/8"=1\'').mPerPt).toBeCloseTo(0.3048 / 9, 8);
    expect(scaleFromText('Scale 1:100').mPerPt).toBeCloseTo((0.0254 / 72) * 100, 8);
    expect(scaleFromText('Scale 1:50').note).toBe('1:50');
    // Two different scales on one sheet are ambiguous.
    expect(scaleFromText('PLAN 1/4" = 1\'-0"  DETAIL 1" = 1\'-0"')).toBeNull();
    expect(scaleFromText('Room 1:00 pm')).toBeNull();
  });

  it('parses lengths in feet and inches or metric', () => {
    expect(parseLength('45\'6"')).toBeCloseTo(45.5 * 0.3048, 6);
    expect(parseLength('45\' 6"')).toBeCloseTo(45.5 * 0.3048, 6);
    expect(parseLength('45-6')).toBeCloseTo(45.5 * 0.3048, 6);
    expect(parseLength('12 ft')).toBeCloseTo(12 * 0.3048, 6);
    expect(parseLength('6"')).toBeCloseTo(0.1524, 6);
    expect(parseLength('13.5 m')).toBeCloseTo(13.5, 6);
    expect(parseLength('1350 mm')).toBeCloseTo(1.35, 6);
    expect(parseLength('20', 'm')).toBe(20);
    expect(parseLength('20', 'ft')).toBeCloseTo(6.096, 6);
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
  });

  it('finds the most common door width', () => {
    expect(typicalDoor([40, 41, 39, 90, 120])).toBe(40);
    expect(typicalDoor([40, 90])).toBeNull();
  });
});
