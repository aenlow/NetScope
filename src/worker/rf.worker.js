// RF worker: heatmaps, plan summaries, auto-placement and channel planning
// run here so the interface never blocks. Per-AP grids are cached, so moving
// one AP recomputes only that AP.

import { buildScene, emitters, emitterKey, computeGrid, combineGrids, evalMask, coverageStats, rssiAt, floorElevations } from '../core/propagation.js';
import { autoPlace } from '../core/autoplace.js';
import { planChannels, couplingWeight } from '../core/channels.js';
import { BANDS } from '../core/bands.js';

const sceneCache = new Map(); // key -> { scene, maskInfo }
const gridCache = new Map(); // key -> Float32Array (insertion order = LRU)
const GRID_CACHE_MAX = 600;
const latestCompute = { view: 0, export: 0 };
let viewPending = 0; // view computes in flight; background jobs wait for them
let nextView = null; // newest view request not yet started
let viewLoop = false;

/** Only the newest view request matters: drain the queue, then compute it. */
async function runViews() {
  if (viewLoop) return;
  viewLoop = true;
  try {
    while (nextView) {
      await yieldToMessages();
      const m = nextView;
      nextView = null;
      await compute(m).catch((err) => postMessage({ type: 'error', id: m.id, message: String(err?.message || err) }));
    }
  } finally {
    viewLoop = false;
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + str.length;
}

function sceneFor(project, fi, quality) {
  const f = project.floors[fi];
  const key = hash(JSON.stringify([fi, quality, f.width, f.height, f.scale, f.walls, f.zones, project.materials, project.zoneMaterials, project.settings.clientHeightM, project.settings.clientGainDbi, project.settings.pathLossExponent]));
  let entry = sceneCache.get(key);
  if (!entry) {
    const scene = buildScene(project, fi, quality);
    if (!scene) return null;
    entry = { key, scene, maskInfo: evalMask(scene, f.zones) };
    sceneCache.set(key, entry);
    if (sceneCache.size > 24) sceneCache.delete(sceneCache.keys().next().value);
  }
  return entry;
}

function gridFor(entry, e, band) {
  const key = entry.key + '#' + emitterKey(e, band);
  let g = gridCache.get(key);
  if (g) { gridCache.delete(key); gridCache.set(key, g); return { grid: g, cached: true }; }
  g = computeGrid(entry.scene, e, band);
  gridCache.set(key, g);
  while (gridCache.size > GRID_CACHE_MAX) gridCache.delete(gridCache.keys().next().value);
  return { grid: g, cached: false };
}

const yieldToMessages = () => new Promise((r) => setTimeout(r, 0));

async function compute(msg) {
  const { id, project, floorIndex, band, quality, devices } = msg;
  const channel = msg.channel === 'export' ? 'export' : 'view';
  if (channel === 'view') latestCompute.view = id;
  try {
    await computeInner(msg, channel);
  } finally {
    if (channel === 'view') viewPending--;
  }
}

async function computeInner(msg, channel) {
  const { id, project, floorIndex, band, quality, devices } = msg;
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  const entry = sceneFor(project, floorIndex, quality);
  if (!entry) { postMessage({ type: 'result', id, empty: true }); return; }
  const list = emitters(project, floorIndex, band, devicesById);
  const out = [];
  let computedSinceYield = 0;
  for (let k = 0; k < list.length; k++) {
    const r = gridFor(entry, list[k], band);
    out.push({ e: list[k], grid: r.grid });
    if (!r.cached) {
      computedSinceYield++;
      if (channel === 'view' && nextView) { postMessage({ type: 'superseded', id }); return; } // a newer view request is waiting
      if (computedSinceYield >= 2) {
        postMessage({ type: 'progress', id, done: k + 1, total: list.length });
        await yieldToMessages();
        computedSinceYield = 0;
        if (channel === 'view' && (latestCompute.view !== id || nextView)) { postMessage({ type: 'superseded', id }); return; }
      }
    }
  }
  const s = entry.scene;
  const c = combineGrids(s, out, project.settings, band);
  const stats = coverageStats(c, entry.maskInfo, project.settings.target);
  const servingIds = out.map((o) => o.e.id);
  const mask = entry.maskInfo.mask.slice();
  postMessage({
    type: 'result', id, floorId: s.floorId, band, cols: s.cols, rows: s.rows, cellPx: s.cellPx, cellM: s.cellM,
    best: c.best, second: c.second, snr: c.snr, overlap: c.overlap, rate: c.rate, serving: c.serving, servingIds, mask, stats,
  }, [c.best.buffer, c.second.buffer, c.snr.buffer, c.overlap.buffer, c.rate.buffer, c.serving.buffer, mask.buffer]);
}

/** Coverage and per-AP serving share for every floor and band (plan check, report). */
async function summary(msg) {
  const { id, project, devices, quality } = msg;
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  const floors = [];
  for (let fi = 0; fi < project.floors.length; fi++) {
    const entry = sceneFor(project, fi, quality);
    if (!entry) { floors.push({ floorId: project.floors[fi].id, bands: {} }); continue; }
    const bands = {};
    for (const band of BANDS) {
      while (viewPending > 0) await yieldToMessages();
      const list = emitters(project, fi, band, devicesById);
      if (!list.length) continue;
      const out = list.map((e) => ({ e, grid: gridFor(entry, e, band).grid }));
      const c = combineGrids(entry.scene, out, project.settings, band);
      const stats = coverageStats(c, entry.maskInfo, project.settings.target);
      // Share of each room's cells served by each AP (for capacity load).
      const share = {};
      const { mask, roomIndex } = entry.maskInfo;
      const roomCells = new Map();
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || c.serving[i] < 0) continue;
        const apId = out[c.serving[i]].e.id;
        const ri = roomIndex[i];
        share[apId] = share[apId] || {};
        share[apId][ri] = (share[apId][ri] || 0) + 1;
        roomCells.set(ri, (roomCells.get(ri) || 0) + 1);
      }
      bands[band] = { stats, share, roomCells: Object.fromEntries(roomCells) };
      await yieldToMessages();
    }
    floors.push({ floorId: project.floors[fi].id, bands });
    postMessage({ type: 'progress', id, done: fi + 1, total: project.floors.length });
  }
  postMessage({ type: 'summary', id, floors });
}

function placeAps(msg) {
  const { id, project, floorIndex, band, device, power, heightM, devices, mode, minAps, maxAps } = msg;
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  const entry = sceneFor(project, floorIndex, 'low');
  if (!entry) { postMessage({ type: 'placed', id, error: 'Set the scale first.' }); return; }
  const f = project.floors[floorIndex];
  const elev = floorElevations(project);
  const dr = device.radios[band];
  const existing = mode === 'add' ? emitters(project, floorIndex, band, devicesById).filter((e) => e.floorIndex === floorIndex) : [];
  const makeEmitter = (x, y) => ({
    id: 'cand', x, y, zM: elev[floorIndex] + heightM, crossed: 0, power, gain: dr.gain,
    antenna: { ...(device.antenna || { pattern: 'omni' }), gain: dr.gain }, orientation: 0,
    freq: band === '2.4' ? 2437 : band === '5' ? 5500 : 6475, slabLoss: 0, targetZ: elev[floorIndex],
  });
  const t = project.settings.target;
  const res = autoPlace({
    scene: entry.scene, band, mask: entry.maskInfo.mask, makeEmitter, existing,
    primary: t.primary, secondary: t.secondary, secondaryEnabled: t.secondaryEnabled, goalPct: t.coverageGoal,
    minAps: minAps || 0, maxAps: maxAps || 80,
    onProgress: (p) => postMessage({ type: 'progress', id, done: Math.round(p * 100), total: 100 }),
  });
  postMessage({ type: 'placed', id, floorId: f.id, ...res });
}

function channels(msg) {
  const { id, project, band, devices, allowDfs, widths } = msg;
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  // All enabled radios on this band across floors, with mutual coupling.
  const radios = [];
  const emittersByFloor = project.floors.map((_, fi) => emitters(project, fi, band, devicesById));
  project.floors.forEach((f, fi) => {
    for (const ap of f.aps) {
      if (ap.enabled === false || !ap.radios[band]?.on) continue;
      if (!emittersByFloor[fi].some((e) => e.id === ap.id)) continue;
      radios.push({ apId: ap.id, fi, x: ap.x, y: ap.y, width: widths?.[band] ?? ap.radios[band].width });
    }
  });
  const scenes = project.floors.map((_, fi) => sceneFor(project, fi, 'low'));
  const cca = project.settings.ccaDbm;
  const weight = (i, j) => {
    const a = radios[i], b = radios[j];
    const sB = scenes[b.fi]?.scene, sA = scenes[a.fi]?.scene;
    const eA = emittersByFloor[b.fi].find((e) => e.id === a.apId);
    const eB = emittersByFloor[a.fi].find((e) => e.id === b.apId);
    if (!sA || !sB || !eA || !eB) return 0;
    const ab = rssiAt(sB, { ...eA, power: eA.power }, band, b.x, b.y);
    const ba = rssiAt(sA, eB, band, a.x, a.y);
    return couplingWeight(Math.max(ab, ba), cca);
  };
  const res = planChannels(band, radios, weight, { region: project.settings.region, allowDfs });
  postMessage({
    type: 'channels', id, band,
    assignments: radios.map((r, i) => ({ apId: r.apId, ch: res.assign[i].ch, width: res.assign[i].width })),
    conflicts: res.conflicts.map((c) => ({ a: radios[c.a].apId, b: radios[c.b].apId })),
  });
}

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'compute' && msg.channel !== 'export') {
      viewPending++;
      if (nextView) { viewPending--; postMessage({ type: 'superseded', id: nextView.id }); }
      nextView = msg;
      runViews().finally(() => {});
    } else if (msg.type === 'compute') compute(msg).catch((err) => postMessage({ type: 'error', id: msg.id, message: String(err?.message || err) }));
    else if (msg.type === 'summary') summary(msg).catch((err) => postMessage({ type: 'error', id: msg.id, message: String(err?.message || err) }));
    else if (msg.type === 'place') placeAps(msg);
    else if (msg.type === 'channels') channels(msg);
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err?.message || err) });
  }
};
