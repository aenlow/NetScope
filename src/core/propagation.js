// Predictive propagation: builds a per-floor scene (walls, zones, grid) and
// computes received signal per AP and band. Pure functions, shared by the
// main thread (cursor probe, clients) and the Web Worker (heatmaps).

import { SegmentGrid, wallLossAlong, fractionInside, pointInPolygon, polygonBounds } from './geometry.js';
import { pathLoss, antennaGain, noiseFloor, linkEstimate } from './rf.js';
import { occupied, BANDS } from './bands.js';

export const NO_SIGNAL = -200;

/** Grid cell size in meters for a floor, aiming at a cell budget. */
export function cellSizeM(widthM, heightM, quality = 'medium') {
  const budget = quality === 'high' ? 160000 : quality === 'low' ? 15000 : 60000;
  const raw = Math.sqrt((widthM * heightM) / budget);
  return Math.max(0.15, Math.ceil(raw * 20) / 20);
}

/**
 * Floor scene: everything about a floor's geometry the RF math needs.
 * Coordinates stay in floor-plan pixels; `scale` converts px → m.
 */
export function buildScene(project, floorIndex, quality = 'medium') {
  const floor = project.floors[floorIndex];
  if (!floor || !floor.scale) return null;
  const scale = floor.scale;
  const widthM = floor.width * scale, heightM = floor.height * scale;
  const cellM = cellSizeM(widthM, heightM, quality);
  const cellPx = cellM / scale;
  const cols = Math.max(1, Math.ceil(floor.width / cellPx));
  const rows = Math.max(1, Math.ceil(floor.height / cellPx));

  const matById = new Map(project.materials.map((m) => [m.id, m]));
  const segs = new Float64Array(floor.walls.length * 4);
  const losses = {};
  for (const b of BANDS) losses[b] = new Float32Array(floor.walls.length);
  floor.walls.forEach((w, i) => {
    segs.set([w.x1, w.y1, w.x2, w.y2], i * 4);
    const m = matById.get(w.materialId);
    for (const b of BANDS) losses[b][i] = m ? m.loss[b] : 0;
  });
  const grid = new SegmentGrid(segs, Math.max(8, 2 / scale), { minX: -10, minY: -10, maxX: floor.width + 10, maxY: floor.height + 10 });

  const zmById = new Map(project.zoneMaterials.map((m) => [m.id, m]));
  const attZones = floor.zones
    .filter((z) => z.kind === 'attenuation' && zmById.has(z.materialId))
    .map((z) => ({ pts: z.points, bounds: polygonBounds(z.points), lossPerM: zmById.get(z.materialId).lossPerM }));

  return {
    floorId: floor.id, floorIndex, scale, cellPx, cellM, cols, rows,
    width: floor.width, height: floor.height,
    grid, losses, attZones,
    clientHeightM: project.settings.clientHeightM,
    clientGainDbi: project.settings.clientGainDbi,
    exponent: project.settings.pathLossExponent,
  };
}

/** Elevation (m) of each floor's slab, floors ordered bottom to top. */
export function floorElevations(project) {
  const out = [];
  let z = 0;
  for (const f of project.floors) { out.push(z); z += f.heightM; }
  return out;
}

const GENERIC_DEVICE = {
  id: 'generic', vendor: 'Generic', model: 'Wi-Fi 6 AP (typical)', gen: 6, kind: 'ap', mount: 'ceiling',
  radios: { '2.4': { nss: 2, txMax: 22, gain: 4, maxWidth: 40 }, '5': { nss: 2, txMax: 23, gain: 5, maxWidth: 160 } },
  antenna: { pattern: 'omni' }, poeW: null, status: 'typical',
};

export function resolveDevice(deviceId, devicesById) {
  return devicesById.get(deviceId) || GENERIC_DEVICE;
}

/**
 * Emitter descriptors for every enabled AP radio on `band` that can reach the
 * target floor, with positions converted into the target floor's pixels.
 */
export function emitters(project, targetIndex, band, devicesById) {
  const target = project.floors[targetIndex];
  if (!target?.scale) return [];
  const elev = floorElevations(project);
  const out = [];
  project.floors.forEach((f, fi) => {
    if (!f.scale) return;
    const crossed = Math.abs(fi - targetIndex);
    if (crossed > 2) return; // beyond two slabs the contribution is negligible
    for (const ap of f.aps) {
      if (ap.enabled === false) continue;
      const r = ap.radios?.[band];
      const dev = resolveDevice(ap.deviceId, devicesById);
      const dr = dev.radios?.[band];
      if (!r?.on || !dr) continue;
      const occ = occupied(band, r.ch, r.width);
      if (!occ) continue;
      const wx = ap.x * f.scale + f.offsetM.x, wy = ap.y * f.scale + f.offsetM.y;
      out.push({
        id: ap.id,
        name: ap.name,
        floorIndex: fi,
        x: (wx - target.offsetM.x) / target.scale,
        y: (wy - target.offsetM.y) / target.scale,
        zM: elev[fi] + ap.heightM,
        crossed,
        power: r.power,
        gain: dr.gain,
        antenna: { ...(dev.antenna || { pattern: 'omni' }), gain: dr.gain },
        orientation: ap.orientation || 0,
        freq: occ.center,
        ch: r.ch,
        width: r.width,
        block: occ.block,
        lo: occ.lo, hi: occ.hi,
        gen: dev.gen,
        nss: dr.nss,
        slabLoss: project.slab?.loss?.[band] ?? 0,
        targetZ: elev[targetIndex],
      });
    }
  });
  return out;
}

/** Stable hash of everything that changes an emitter's grid. */
export function emitterKey(e, band) {
  return [band, e.id, e.x.toFixed(2), e.y.toFixed(2), e.zM.toFixed(2), e.power, e.antenna.gain, e.antenna.pattern, e.antenna.beamwidth, e.antenna.frontToBack, e.orientation, e.freq, e.crossed, e.slabLoss].join('|');
}

/** Received signal (dBm) from emitter e at floor pixel (x, y). */
export function rssiAt(scene, e, band, x, y) {
  const dxPx = x - e.x, dyPx = y - e.y;
  const horizM = Math.hypot(dxPx, dyPx) * scene.scale;
  const dz = e.zM - (e.targetZ + scene.clientHeightM);
  const d = Math.hypot(horizM, dz);
  let loss = pathLoss(d, e.freq, scene.exponent);
  loss += wallLossAlong(scene.grid, scene.losses[band], e.x, e.y, x, y);
  if (scene.attZones.length) {
    for (const z of scene.attZones) {
      const b = z.bounds;
      if ((e.x < b.minX && x < b.minX) || (e.x > b.maxX && x > b.maxX) || (e.y < b.minY && y < b.minY) || (e.y > b.maxY && y > b.maxY)) continue;
      loss += fractionInside(e.x, e.y, x, y, z.pts) * horizM * z.lossPerM[band];
    }
  }
  if (e.crossed) loss += e.crossed * e.slabLoss;
  const az = (Math.atan2(dyPx, dxPx) * 180) / Math.PI;
  return e.power + antennaGain(e.antenna, az, e.orientation) + scene.clientGainDbi - loss;
}

/** Fill a Float32Array (rows × cols) with RSSI from one emitter. */
export function computeGrid(scene, e, band, out = new Float32Array(scene.cols * scene.rows)) {
  const { cols, rows, cellPx } = scene;
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * cellPx;
    for (let c = 0; c < cols; c++) out[r * cols + c] = rssiAt(scene, e, band, (c + 0.5) * cellPx, y);
  }
  return out;
}

/**
 * Evaluation mask: 1 where coverage counts. Rooms define it when present,
 * otherwise the whole plan; exclusion areas are always removed.
 */
export function evalMask(scene, zones) {
  const { cols, rows, cellPx } = scene;
  const mask = new Uint8Array(cols * rows);
  const rooms = zones.filter((z) => z.kind === 'room');
  const excl = zones.filter((z) => z.kind === 'exclusion');
  const roomIndex = new Int16Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * cellPx;
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cellPx;
      let inside = rooms.length === 0;
      for (let k = 0; k < rooms.length; k++) {
        if (pointInPolygon(x, y, rooms[k].points)) { inside = true; roomIndex[r * cols + c] = k; break; }
      }
      if (inside && excl.some((z) => pointInPolygon(x, y, z.points))) inside = false;
      mask[r * cols + c] = inside ? 1 : 0;
    }
  }
  return { mask, roomIndex, rooms };
}

/**
 * Combine per-emitter grids into the views the UI draws:
 * best, second-best, serving index, SNR, co-channel count and data rate.
 */
export function combineGrids(scene, list, settings, band) {
  const n = scene.cols * scene.rows;
  const best = new Float32Array(n).fill(NO_SIGNAL);
  const second = new Float32Array(n).fill(NO_SIGNAL);
  const serving = new Int16Array(n).fill(-1);
  for (let k = 0; k < list.length; k++) {
    const g = list[k].grid;
    for (let i = 0; i < n; i++) {
      const v = g[i];
      if (v > best[i]) { second[i] = best[i]; best[i] = v; serving[i] = k; }
      else if (v > second[i]) second[i] = v;
    }
  }
  const snr = new Float32Array(n).fill(NO_SIGNAL);
  const overlap = new Uint8Array(n);
  const rate = new Float32Array(n);
  const cl = settings.client;
  const clientHasBand = cl.bands.includes(band);
  const rateCache = new Map();
  const noiseByWidth = (w) => (settings.noiseOverride != null ? settings.noiseOverride + 10 * Math.log10(w / 20) : noiseFloor(w, settings.noiseFigure));
  const cca = settings.ccaDbm;
  for (let i = 0; i < n; i++) {
    const s = serving[i];
    if (s < 0 || best[i] <= NO_SIGNAL) continue;
    const e = list[s].e;
    snr[i] = best[i] - noiseByWidth(e.width);
    let count = 0;
    for (let k = 0; k < list.length; k++) {
      const o = list[k].e;
      if (list[k].grid[i] < cca) continue;
      if (Math.min(o.hi, e.hi) - Math.max(o.lo, e.lo) > 0.5) count++;
    }
    overlap[i] = Math.min(255, count);
    if (clientHasBand) {
      const q = Math.round(snr[i]);
      const key = s * 1000 + q;
      let t = rateCache.get(key);
      if (t === undefined) {
        t = linkEstimate({ snr: q, apGen: e.gen, apNss: e.nss, apWidth: e.width, clientGen: cl.gen, clientNss: cl.nss, clientMaxWidth: cl.maxWidth[band] || 20, efficiency: settings.efficiency, thresholds: settings.mcsSnr }).throughput;
        rateCache.set(key, t);
      }
      rate[i] = t;
    }
  }
  return { best, second, serving, snr, overlap, rate, band };
}

/** Coverage statistics over the evaluation mask. */
export function coverageStats(combined, maskInfo, target) {
  const { best, second } = combined;
  const { mask, roomIndex, rooms } = maskInfo;
  let n = 0, p = 0, s = 0;
  const per = rooms.map((z) => ({ id: z.id, name: z.name, n: 0, p: 0, s: 0 }));
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    n++;
    const okP = best[i] >= target.primary;
    const okS = second[i] >= target.secondary;
    if (okP) p++;
    if (okS) s++;
    const ri = roomIndex[i];
    if (ri >= 0) { per[ri].n++; if (okP) per[ri].p++; if (okS) per[ri].s++; }
  }
  return {
    cells: n,
    primaryPct: n ? (100 * p) / n : 0,
    secondaryPct: n ? (100 * s) / n : 0,
    rooms: per.map((r) => ({ id: r.id, name: r.name, cells: r.n, primaryPct: r.n ? (100 * r.p) / r.n : 0, secondaryPct: r.n ? (100 * r.s) / r.n : 0 })),
  };
}

/** All emitters at one point, strongest first (cursor probe, clients). */
export function probe(scene, list, band, x, y) {
  return list
    .map((e) => ({ e, rssi: rssiAt(scene, e, band, x, y) }))
    .sort((a, b) => b.rssi - a.rssi);
}
