import { describe, it, expect } from 'vitest';
import { SegmentGrid, wallLossAlong, polygonArea, pointInPolygon, fractionInside, segIntersect } from '../../src/core/geometry.js';
import { detectRooms } from '../../src/core/rooms.js';
import { contourSegments } from '../../src/core/contour.js';

function gridOf(segments) {
  const segs = new Float64Array(segments.flatMap((s) => s.slice(0, 4)));
  const losses = new Float32Array(segments.map((s) => s[4]));
  return { grid: new SegmentGrid(segs, 10, { minX: 0, minY: 0, maxX: 400, maxY: 400 }), losses };
}

describe('wall crossings', () => {
  it('counts a wall only when the ray crosses it', () => {
    const { grid, losses } = gridOf([[100, 0, 100, 200, 5]]);
    expect(wallLossAlong(grid, losses, 50, 50, 150, 50)).toBe(5);
    expect(wallLossAlong(grid, losses, 50, 50, 90, 150)).toBe(0);
    expect(wallLossAlong(grid, losses, 50, 250, 150, 250)).toBe(0); // passes beyond the wall's end
  });

  it('counts a closed room twice when the ray passes through it (v1 counted once)', () => {
    const room = [[100, 100, 200, 100, 4], [200, 100, 200, 200, 4], [200, 200, 100, 200, 4], [100, 200, 100, 100, 4]];
    const { grid, losses } = gridOf(room);
    expect(wallLossAlong(grid, losses, 50, 150, 250, 150)).toBe(8);
    expect(wallLossAlong(grid, losses, 150, 150, 250, 150)).toBe(4);
    expect(wallLossAlong(grid, losses, 120, 120, 180, 180)).toBe(0);
  });

  it('counts a crossing through a shared vertex once, at the higher loss', () => {
    const { grid, losses } = gridOf([[100, 0, 100, 100, 3], [100, 100, 100, 200, 10]]);
    expect(wallLossAlong(grid, losses, 50, 100, 150, 100)).toBe(10);
  });

  it('ignores collinear walls and a ray that starts on a wall', () => {
    const { grid, losses } = gridOf([[0, 100, 300, 100, 6]]);
    expect(wallLossAlong(grid, losses, 10, 100, 200, 100)).toBe(0);
    expect(wallLossAlong(grid, losses, 50, 100, 50, 150)).toBe(0);
  });

  it('agrees with brute force on random walls', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 400;
    const walls = Array.from({ length: 120 }, () => [rnd(), rnd(), rnd(), rnd(), 1]);
    const { grid, losses } = gridOf(walls);
    for (let k = 0; k < 200; k++) {
      const a = [rnd(), rnd()], b = [rnd(), rnd()];
      let brute = 0;
      for (const w of walls) {
        const h = segIntersect(a[0], a[1], b[0], b[1], w[0], w[1], w[2], w[3]);
        if (h && h.t > 1e-9 && h.t < 1 - 1e-9) brute += 1;
      }
      expect(wallLossAlong(grid, losses, a[0], a[1], b[0], b[1])).toBe(brute);
    }
  });
});

describe('polygons', () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it('area by shoelace', () => {
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }])).toBe(300);
  });
  it('point in polygon', () => {
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });
  it('fraction of a segment inside', () => {
    expect(fractionInside(-10, 5, 20, 5, sq)).toBeCloseTo(1 / 3, 6);
    expect(fractionInside(2, 2, 8, 8, sq)).toBeCloseTo(1, 6);
  });
});

describe('room detection', () => {
  it('finds an L-shaped room with the correct area, closing a 0.8 m door gap', () => {
    const s = 0.05; // m per px
    const L = [[0, 0], [400, 0], [400, 200], [200, 200], [200, 400], [0, 400]];
    const walls = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = L[(i + 1) % L.length];
      walls.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    }
    // Door gap of 16 px (0.8 m) in the first wall.
    walls[0] = { x1: 0, y1: 0, x2: 180, y2: 0 };
    walls.push({ x1: 196, y1: 0, x2: 400, y2: 0 });
    const rooms = detectRooms(walls, 500, 500, s);
    expect(rooms.length).toBe(1);
    const areaM2 = polygonArea(rooms[0].points) * s * s;
    expect(areaM2).toBeGreaterThan(300 * 0.93);
    expect(areaM2).toBeLessThan(300 * 1.07);
  });

  it('separates two rooms sharing a wall', () => {
    const s = 0.05;
    const w = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
    const walls = [w(0, 0, 400, 0), w(400, 0, 400, 200), w(400, 200, 0, 200), w(0, 200, 0, 0), w(200, 0, 200, 200)];
    const rooms = detectRooms(walls, 450, 250, s);
    expect(rooms.length).toBe(2);
    for (const r of rooms) {
      const a = polygonArea(r.points) * s * s;
      expect(a).toBeGreaterThan(100 * 0.95);
      expect(a).toBeLessThan(100 * 1.05);
    }
  });
});

describe('contours', () => {
  it('draws an iso-line between cells above and below the threshold', () => {
    const v = new Float32Array([-80, -60, -80, -60]);
    const segs = contourSegments(v, 2, 2, -70);
    expect(segs.length).toBe(4);
    expect(segs[0]).toBeCloseTo(1, 6);
  });
});
