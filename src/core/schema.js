// Project document: defaults, validation of untrusted files, and migration
// from v1 (the original single-page NetScope) to v2.

import { uid } from './ids.js';
import { DEFAULT_MATERIALS, DEFAULT_ZONE_MATERIALS, DEFAULT_SLAB, materialForLegacyLoss } from './materials.js';
import { DEFAULT_MCS_SNR } from './rf.js';
import { BANDS } from './bands.js';
import { M_PER_FT } from './units.js';

export const FORMAT = 'netscope-project';
export const VERSION = 2;

export const TARGET_PRESETS = {
  voice: { label: 'Voice', primary: -67, secondary: -67, secondaryEnabled: true },
  data: { label: 'Data', primary: -65, secondary: -67, secondaryEnabled: false },
  basic: { label: 'Basic coverage', primary: -72, secondary: -75, secondaryEnabled: false },
  custom: { label: 'Custom', primary: -67, secondary: -70, secondaryEnabled: false },
};

export const POWER_PRESETS = {
  low: { label: 'Low', '2.4': 6, '5': 11, '6': 11 },
  medium: { label: 'Medium', '2.4': 12, '5': 17, '6': 17 },
  high: { label: 'High', '2.4': 16, '5': 20, '6': 20 },
};

export const LIMITS = {
  fileBytes: 60 * 1024 * 1024,
  floors: 50,
  walls: 50000,
  aps: 2000,
  zones: 2000,
  points: 2000,
  clients: 5000,
  closets: 200,
  versions: 30,
  str: 200,
  imageBytes: 40 * 1024 * 1024,
  planPx: 12000,
};

export function defaultSettings() {
  return {
    units: 'ft',
    region: 'US',
    allowDfs: false,
    target: { preset: 'data', primary: -65, secondary: -67, secondaryEnabled: false, coverageGoal: 95 },
    noiseFigure: 6,
    noiseOverride: null,
    pathLossExponent: 2.0,
    clientHeightM: 1.0,
    clientGainDbi: 0,
    client: { gen: 6, nss: 2, bands: ['2.4', '5', '6'], maxWidth: { '2.4': 20, '5': 80, '6': 160 } },
    efficiency: 0.65,
    mcsSnr: [...DEFAULT_MCS_SNR],
    internet: { down: 1000, up: 1000 },
    capacity: { devicesPerRadio: 30 },
    cabling: { verticalM: 3, slackPct: 10, maxRunM: 90 },
    ccaDbm: -82,
    defaultWidth: { '2.4': 20, '5': 40, '6': 80 },
    associateMinDbm: -80,
  };
}

export function newFloor(name = 'Level 1', opts = {}) {
  return {
    id: uid('floor'),
    name,
    heightM: 3.5,
    scale: opts.scale ?? null,
    width: opts.width ?? 1600,
    height: opts.height ?? 1000,
    imageId: opts.imageId ?? null,
    offsetM: { x: 0, y: 0 },
    walls: [],
    zones: [],
    aps: [],
    closets: [],
    clients: [],
  };
}

export function newProject(name = 'Untitled project') {
  const now = new Date().toISOString();
  return {
    format: FORMAT,
    version: VERSION,
    id: uid('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    settings: defaultSettings(),
    materials: structuredClone(DEFAULT_MATERIALS),
    zoneMaterials: structuredClone(DEFAULT_ZONE_MATERIALS),
    slab: structuredClone(DEFAULT_SLAB),
    customDevices: [],
    prices: {},
    floors: [],
    images: {},
    versions: [],
  };
}

// ---------------------------------------------------------------- validation

export class ProjectError extends Error {
  constructor(message) { super(message); this.name = 'ProjectError'; }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi, dflt) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};
const str = (v, dflt = '', max = LIMITS.str) => (typeof v === 'string' ? v.slice(0, max) : dflt);
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);
const idOf = (v, prefix) => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) ? v : uid(prefix));
const arr = (v, max, label, warnings) => {
  if (!Array.isArray(v)) return [];
  if (v.length > max) {
    warnings.push(`${label}: kept the first ${max} of ${v.length}`);
    return v.slice(0, max);
  }
  return v;
};

const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function cleanLoss(l, dflt) {
  const out = {};
  for (const b of BANDS) out[b] = num(l?.[b], 0, 120, dflt?.[b] ?? 0);
  return out;
}

function cleanPoint(p, maxPx) {
  return { x: num(p?.x, -maxPx, maxPx * 2, 0), y: num(p?.y, -maxPx, maxPx * 2, 0) };
}

function cleanRadio(r, band) {
  return {
    on: bool(r?.on, band !== '6'),
    ch: Math.round(num(r?.ch, 1, 233, band === '2.4' ? 1 : band === '5' ? 36 : 5)),
    width: [20, 40, 80, 160, 320].includes(r?.width) ? r.width : band === '2.4' ? 20 : band === '5' ? 40 : 80,
    power: num(r?.power, -10, 36, band === '2.4' ? 12 : 17),
    preset: ['low', 'medium', 'high', 'max', 'custom'].includes(r?.preset) ? r.preset : 'custom',
  };
}

export function cleanDevice(d, warnings) {
  if (!isObj(d)) return null;
  const radios = {};
  for (const b of BANDS) {
    const r = d.radios?.[b];
    if (!isObj(r)) continue;
    radios[b] = {
      nss: Math.round(num(r.nss, 1, 16, 2)),
      txMax: num(r.txMax, 0, 36, 20),
      gain: num(r.gain, -10, 30, 3),
      maxWidth: [20, 40, 80, 160, 320].includes(r.maxWidth) ? r.maxWidth : b === '2.4' ? 40 : b === '5' ? 80 : 160,
    };
  }
  if (!Object.keys(radios).length) { warnings?.push(`Device ${str(d.model)} has no radios and was skipped`); return null; }
  return {
    id: idOf(d.id, 'dev'),
    vendor: str(d.vendor, 'Custom', 60),
    model: str(d.model, 'Device', 80),
    family: str(d.family, '', 60),
    kind: ['ap', 'outdoor', 'wallplate', 'router', 'mesh'].includes(d.kind) ? d.kind : 'ap',
    gen: Math.round(num(d.gen, 4, 7, 6)),
    mount: ['ceiling', 'wall', 'desk', 'outdoor'].includes(d.mount) ? d.mount : 'ceiling',
    radios,
    antenna: {
      pattern: d.antenna?.pattern === 'directional' ? 'directional' : 'omni',
      beamwidth: num(d.antenna?.beamwidth, 5, 360, 60),
      frontToBack: num(d.antenna?.frontToBack, 0, 40, 20),
    },
    poeW: d.poeW == null ? null : num(d.poeW, 0, 120, null),
    status: 'user',
    source: '',
    notes: str(d.notes, '', 400),
  };
}

function cleanFloor(f, warnings, materialIds, zoneMaterialIds, imageIds) {
  if (!isObj(f)) return null;
  const width = num(f.width, 50, LIMITS.planPx, 1600);
  const height = num(f.height, 50, LIMITS.planPx, 1000);
  const maxPx = Math.max(width, height);
  const floor = {
    id: idOf(f.id, 'floor'),
    name: str(f.name, 'Floor', 60) || 'Floor',
    heightM: num(f.heightM, 2, 20, 3.5),
    scale: f.scale == null ? null : num(f.scale, 1e-5, 10, null),
    width, height,
    imageId: typeof f.imageId === 'string' && imageIds.has(f.imageId) ? f.imageId : null,
    offsetM: { x: num(f.offsetM?.x, -1e4, 1e4, 0), y: num(f.offsetM?.y, -1e4, 1e4, 0) },
    walls: [], zones: [], aps: [], closets: [], clients: [],
  };
  for (const w of arr(f.walls, LIMITS.walls, 'Walls', warnings)) {
    if (!isObj(w)) continue;
    const seg = {
      id: idOf(w.id, 'wall'),
      x1: num(w.x1, -maxPx, maxPx * 2, 0), y1: num(w.y1, -maxPx, maxPx * 2, 0),
      x2: num(w.x2, -maxPx, maxPx * 2, 0), y2: num(w.y2, -maxPx, maxPx * 2, 0),
      materialId: materialIds.has(w.materialId) ? w.materialId : 'drywall',
    };
    if (Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) > 0.01) floor.walls.push(seg);
  }
  for (const z of arr(f.zones, LIMITS.zones, 'Areas', warnings)) {
    if (!isObj(z)) continue;
    const pts = arr(z.points, LIMITS.points, 'Area points', warnings).map((p) => cleanPoint(p, maxPx));
    if (pts.length < 3) continue;
    const kind = ['room', 'exclusion', 'attenuation'].includes(z.kind) ? z.kind : 'room';
    floor.zones.push({
      id: idOf(z.id, 'zone'), kind, name: str(z.name, kind === 'room' ? 'Room' : '', 60), points: pts,
      materialId: kind === 'attenuation' && zoneMaterialIds.has(z.materialId) ? z.materialId : kind === 'attenuation' ? 'cubicles' : null,
      devices: Math.round(num(z.devices, 0, 100000, 0)),
    });
  }
  for (const a of arr(f.aps, LIMITS.aps, 'Access points', warnings)) {
    if (!isObj(a)) continue;
    const radios = {};
    for (const b of BANDS) radios[b] = cleanRadio(a.radios?.[b], b);
    floor.aps.push({
      id: idOf(a.id, 'ap'),
      name: str(a.name, 'AP', 40) || 'AP',
      deviceId: str(a.deviceId, '', 80),
      x: num(a.x, -maxPx, maxPx * 2, 0), y: num(a.y, -maxPx, maxPx * 2, 0),
      heightM: num(a.heightM, 0, 50, 2.7),
      orientation: num(a.orientation, 0, 360, 0) % 360,
      radios,
      enabled: bool(a.enabled, true),
      closetId: typeof a.closetId === 'string' ? a.closetId.slice(0, 80) : null,
      notes: str(a.notes, '', 400),
    });
  }
  for (const c of arr(f.closets, LIMITS.closets, 'Network closets', warnings)) {
    if (!isObj(c)) continue;
    floor.closets.push({ id: idOf(c.id, 'idf'), name: str(c.name, 'IDF', 40) || 'IDF', x: num(c.x, -maxPx, maxPx * 2, 0), y: num(c.y, -maxPx, maxPx * 2, 0), poeBudgetW: c.poeBudgetW == null ? null : num(c.poeBudgetW, 0, 100000, null) });
  }
  for (const c of arr(f.clients, LIMITS.clients, 'Clients', warnings)) {
    if (!isObj(c)) continue;
    floor.clients.push({ id: idOf(c.id, 'cl'), x: num(c.x, -maxPx, maxPx * 2, 0), y: num(c.y, -maxPx, maxPx * 2, 0) });
  }
  return floor;
}

/**
 * Validate and normalise a parsed v2 project. Never trusts the input: every
 * value is type-checked and clamped, strings are length-limited, unknown keys
 * are dropped, and images must be base64 PNG/JPEG/WebP data URLs.
 */
export function validateProject(raw) {
  const warnings = [];
  if (!isObj(raw)) throw new ProjectError('The file is not a NetScope project.');
  const p = newProject(str(raw.name, 'Untitled project', 120) || 'Untitled project');
  p.id = idOf(raw.id, 'proj');
  p.createdAt = str(raw.createdAt, p.createdAt, 40);

  const s = raw.settings || {};
  const d = defaultSettings();
  p.settings = {
    units: s.units === 'm' ? 'm' : 'ft',
    region: ['US', 'EU', 'ANY'].includes(s.region) ? s.region : 'US',
    allowDfs: bool(s.allowDfs, false),
    target: {
      preset: Object.keys(TARGET_PRESETS).includes(s.target?.preset) ? s.target.preset : 'data',
      primary: num(s.target?.primary, -95, -30, d.target.primary),
      secondary: num(s.target?.secondary, -95, -30, d.target.secondary),
      secondaryEnabled: bool(s.target?.secondaryEnabled, d.target.secondaryEnabled),
      coverageGoal: num(s.target?.coverageGoal, 50, 100, 95),
    },
    noiseFigure: num(s.noiseFigure, 0, 20, 6),
    noiseOverride: s.noiseOverride == null ? null : num(s.noiseOverride, -110, -60, null),
    pathLossExponent: num(s.pathLossExponent, 1.6, 5, 2),
    clientHeightM: num(s.clientHeightM, 0, 10, 1),
    clientGainDbi: num(s.clientGainDbi, -15, 10, 0),
    client: {
      gen: Math.round(num(s.client?.gen, 4, 7, 6)),
      nss: Math.round(num(s.client?.nss, 1, 4, 2)),
      bands: Array.isArray(s.client?.bands) ? s.client.bands.filter((b) => BANDS.includes(b)) : [...d.client.bands],
      maxWidth: {
        '2.4': [20, 40].includes(s.client?.maxWidth?.['2.4']) ? s.client.maxWidth['2.4'] : 20,
        '5': [20, 40, 80, 160].includes(s.client?.maxWidth?.['5']) ? s.client.maxWidth['5'] : 80,
        '6': [20, 40, 80, 160, 320].includes(s.client?.maxWidth?.['6']) ? s.client.maxWidth['6'] : 160,
      },
    },
    efficiency: num(s.efficiency, 0.1, 1, 0.65),
    mcsSnr: Array.isArray(s.mcsSnr) && s.mcsSnr.length === DEFAULT_MCS_SNR.length ? s.mcsSnr.map((v, i) => num(v, -5, 60, DEFAULT_MCS_SNR[i])) : [...DEFAULT_MCS_SNR],
    internet: { down: num(s.internet?.down, 0, 1e6, 1000), up: num(s.internet?.up, 0, 1e6, 1000) },
    capacity: { devicesPerRadio: Math.round(num(s.capacity?.devicesPerRadio, 1, 500, 30)) },
    cabling: { verticalM: num(s.cabling?.verticalM, 0, 50, 3), slackPct: num(s.cabling?.slackPct, 0, 100, 10), maxRunM: num(s.cabling?.maxRunM, 10, 200, 90) },
    ccaDbm: num(s.ccaDbm, -95, -60, -82),
    defaultWidth: {
      '2.4': [20, 40].includes(s.defaultWidth?.['2.4']) ? s.defaultWidth['2.4'] : 20,
      '5': [20, 40, 80, 160].includes(s.defaultWidth?.['5']) ? s.defaultWidth['5'] : 40,
      '6': [20, 40, 80, 160, 320].includes(s.defaultWidth?.['6']) ? s.defaultWidth['6'] : 80,
    },
    associateMinDbm: num(s.associateMinDbm, -95, -50, -80),
  };

  if (Array.isArray(raw.materials) && raw.materials.length) {
    p.materials = raw.materials.slice(0, 200).filter(isObj).map((m) => ({
      id: idOf(m.id, 'mat'), name: str(m.name, 'Material', 60) || 'Material',
      loss: cleanLoss(m.loss), color: /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#CFC8BC',
      width: num(m.width, 1, 8, 2.5), dash: Array.isArray(m.dash) ? m.dash.slice(0, 4).map((v) => num(v, 0, 20, 2)) : undefined,
      note: str(m.note, '', 300),
    }));
  }
  if (Array.isArray(raw.zoneMaterials) && raw.zoneMaterials.length) {
    p.zoneMaterials = raw.zoneMaterials.slice(0, 100).filter(isObj).map((m) => ({
      id: idOf(m.id, 'zmat'), name: str(m.name, 'Zone material', 60), lossPerM: cleanLoss(m.lossPerM), note: str(m.note, '', 300),
    }));
  }
  if (isObj(raw.slab)) p.slab = { id: 'slab', name: str(raw.slab.name, 'Floor slab', 60), loss: cleanLoss(raw.slab.loss, DEFAULT_SLAB.loss), note: str(raw.slab.note, '', 300) };
  p.customDevices = arr(raw.customDevices, 500, 'Custom devices', warnings).map((x) => cleanDevice(x, warnings)).filter(Boolean);
  if (isObj(raw.prices)) {
    for (const [k, v] of Object.entries(raw.prices).slice(0, 2000)) {
      const n = num(v, 0, 1e7, null);
      if (n != null && /^[A-Za-z0-9_.:-]{1,80}$/.test(k)) p.prices[k] = n;
    }
  }

  // Images: only base64 PNG/JPEG/WebP data URLs, size-limited.
  const imageIds = new Set();
  if (isObj(raw.images)) {
    for (const [k, v] of Object.entries(raw.images).slice(0, LIMITS.floors * 2)) {
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(k)) continue;
      if (typeof v !== 'string' || v.length > LIMITS.imageBytes * 1.4 || !IMAGE_RE.test(v)) {
        warnings.push('A floor-plan image was not a PNG, JPEG or WebP data URL and was dropped');
        continue;
      }
      p.images[k] = v;
      imageIds.add(k);
    }
  }

  const materialIds = new Set(p.materials.map((m) => m.id));
  const zoneMaterialIds = new Set(p.zoneMaterials.map((m) => m.id));
  p.floors = arr(raw.floors, LIMITS.floors, 'Floors', warnings)
    .map((f) => cleanFloor(f, warnings, materialIds, zoneMaterialIds, imageIds))
    .filter(Boolean);

  p.versions = arr(raw.versions, LIMITS.versions, 'Versions', warnings).filter(isObj).map((v) => ({
    id: idOf(v.id, 'ver'),
    name: str(v.name, 'Version', 80),
    createdAt: str(v.createdAt, '', 40),
    floors: arr(v.floors, LIMITS.floors, 'Version floors', warnings).map((f) => cleanFloor(f, warnings, materialIds, zoneMaterialIds, imageIds)).filter(Boolean),
  }));
  return { project: p, warnings };
}

// ----------------------------------------------------------------- migration

/** Detect the format of parsed JSON: 'v2', 'v1' or null. */
export function detectFormat(raw) {
  if (isObj(raw) && raw.format === FORMAT) return 'v2';
  if (isObj(raw) && (Array.isArray(raw.accessPoints) || Array.isArray(raw.walls)) && !raw.format) return 'v1';
  return null;
}

/**
 * Convert a v1 project (single floor, scale in ft/px, polyline walls with one
 * dB value, APs with 2.4/5 GHz config) into a v2 project object.
 * findDevice(vendor, model) returns a library device id or null.
 */
export function migrateV1(raw, findDevice = () => null) {
  const warnings = ['Converted from a NetScope v1 file. Review wall materials and AP power before relying on results.'];
  const p = newProject(str(raw.name, 'Imported project', 120) || 'Imported project');
  const width = num(raw.floorPlan?.width, 50, LIMITS.planPx, 1600);
  const height = num(raw.floorPlan?.height, 50, LIMITS.planPx, 1000);
  const floor = newFloor('Level 1', { width, height });

  const scaleFt = num(raw.scale, 1e-5, 100, null);
  floor.scale = scaleFt ? scaleFt * M_PER_FT : null;
  if (scaleFt === 1) warnings.push('The v1 file uses the default scale of 1 ft per pixel, which usually means it was never calibrated. Set the scale before trusting results.');

  const url = raw.floorPlan?.dataURL;
  if (typeof url === 'string' && IMAGE_RE.test(url) && url.length < LIMITS.imageBytes * 1.4) {
    const imgId = uid('img');
    p.images[imgId] = url;
    floor.imageId = imgId;
  } else if (url) warnings.push('The floor-plan image in the v1 file was not a supported image and was dropped');

  const legacy = new Map();
  const matFor = (db) => {
    const n = num(db, 0, 120, 8);
    if (!legacy.has(n)) {
      const m = materialForLegacyLoss(n);
      legacy.set(n, m);
      p.materials.push(m);
    }
    return legacy.get(n).id;
  };

  for (const w of arr(raw.walls, LIMITS.walls, 'Walls', warnings)) {
    if (!isObj(w) || !Array.isArray(w.points)) continue;
    const pts = w.points.map((v) => num(v, -1e6, 1e6, 0));
    const materialId = matFor(w.attenuation);
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]) < 0.01) continue;
      floor.walls.push({ id: uid('wall'), x1: pts[i], y1: pts[i + 1], x2: pts[i + 2], y2: pts[i + 3], materialId });
    }
  }

  // v1 obstacles were never used in its signal math; keep them as a rectangle
  // of walls with half the stated loss per side (a crossing pays it twice).
  const obstacles = arr(raw.obstacles, 1000, 'Obstacles', warnings);
  for (const o of obstacles) {
    if (!isObj(o)) continue;
    const x = num(o.x, -1e6, 1e6, 0), y = num(o.y, -1e6, 1e6, 0);
    const ow = num(o.width, 0, 1e6, 0), oh = num(o.height, 0, 1e6, 0);
    if (ow < 1 || oh < 1) continue;
    const materialId = matFor(num(o.attenuation, 0, 120, 5) / 2);
    const c = [[x, y], [x + ow, y], [x + ow, y + oh], [x, y + oh]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      floor.walls.push({ id: uid('wall'), x1: a[0], y1: a[1], x2: b[0], y2: b[1], materialId });
    }
  }
  if (obstacles.length) warnings.push('v1 obstacles were converted to walls. v1 never applied them to the signal, so results will differ from the old app.');

  let n = 0;
  for (const a of arr(raw.accessPoints, LIMITS.aps, 'Access points', warnings)) {
    if (!isObj(a)) continue;
    n++;
    const cfg = isObj(a.config) ? a.config : {};
    const dev = isObj(a.device) ? a.device : {};
    let deviceId = findDevice(str(dev.vendor), str(dev.model).replace(/\s*\((AP|Router)\)\s*$/i, ''));
    if (!deviceId) {
      const custom = cleanDevice({
        vendor: dev.vendor, model: str(dev.model).replace(/\s*\((AP|Router)\)\s*$/i, ''),
        kind: /router/i.test(str(dev.model)) ? 'router' : 'ap',
        gen: 6,
        radios: Object.fromEntries((Array.isArray(dev.radios) ? dev.radios : []).filter((r) => ['2.4', '5'].includes(String(r?.band))).map((r) => [String(r.band), { nss: 2, txMax: r.maxTx, gain: dev.antenna?.gain ?? 3 }])),
        antenna: { pattern: dev.antenna?.type === 'directional' ? 'directional' : 'omni', beamwidth: dev.antenna?.beamwidth },
        notes: 'Imported from a v1 project; specs not verified.',
      }, warnings);
      if (custom) {
        const existing = p.customDevices.find((c) => c.vendor === custom.vendor && c.model === custom.model);
        if (existing) deviceId = existing.id;
        else { p.customDevices.push(custom); deviceId = custom.id; }
      }
    }
    const radios = {
      '2.4': { on: true, ch: [1, 6, 11].includes(cfg.channel24) ? cfg.channel24 : 1, width: 20, power: num(cfg.tx24, 0, 30, 20), preset: 'custom' },
      '5': { on: true, ch: Math.round(num(cfg.channel5, 36, 165, 36)), width: 20, power: num(cfg.tx5, 0, 30, 23), preset: 'custom' },
      '6': { on: false, ch: 5, width: 80, power: 17, preset: 'medium' },
    };
    floor.aps.push({
      id: uid('ap'),
      name: str(cfg.name, `AP-${String(n).padStart(2, '0')}`, 40) || `AP-${n}`,
      deviceId: deviceId || '',
      x: num(a.x, -1e6, 1e6, 0), y: num(a.y, -1e6, 1e6, 0),
      heightM: num(cfg.height, 0, 100, 9) * M_PER_FT,
      orientation: num(cfg.orientation, 0, 360, 0) % 360,
      radios, enabled: true, closetId: null, notes: '',
    });
  }

  p.floors = [floor];
  return { project: p, warnings };
}

/** Parse JSON text from an untrusted file into a validated v2 project. */
export function parseProjectText(text, findDevice) {
  if (typeof text !== 'string') throw new ProjectError('Could not read the file.');
  if (text.length > LIMITS.fileBytes) throw new ProjectError('The file is larger than 60 MB.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new ProjectError('The file is not valid JSON.'); }
  const kind = detectFormat(raw);
  if (kind === 'v2') {
    if (raw.version > VERSION) throw new ProjectError(`This file was made by a newer NetScope (format v${Number(raw.version)}).`);
    return validateProject(raw);
  }
  if (kind === 'v1') {
    const m = migrateV1(raw, findDevice);
    const v = validateProject(JSON.parse(JSON.stringify(m.project)));
    return { project: v.project, warnings: [...m.warnings, ...v.warnings] };
  }
  throw new ProjectError('This JSON file is not a NetScope project.');
}

/** Serialise for saving. Versions keep floors only; images are shared. */
export function serializeProject(p) {
  return JSON.stringify({ ...p, format: FORMAT, version: VERSION, updatedAt: new Date().toISOString() });
}
