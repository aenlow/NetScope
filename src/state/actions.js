// Project operations used by the UI, shortcuts and command palette.

import { store, commit, setUi, toast, currentFloor, resetHistory, notify, validateSelection, beginTransient } from './store.js';
import { newFloor, newProject, POWER_PRESETS, TARGET_PRESETS } from '../core/schema.js';
import { uid } from '../core/ids.js';
import { devicesIndex, MOUNT_HEIGHT_M } from '../data/devices.js';
import { BANDS, primaryChannels, blocksFor, isPsc } from '../core/bands.js';
import { nonOverlapping24 } from '../core/channels.js';
import { detectRooms } from '../core/rooms.js';
import { pointInPolygon, polygonBounds, polygonArea } from '../core/geometry.js';
import { buildScene, emitters, probe, resolveDevice, rssiAt } from '../core/propagation.js';
import { radiosOverlap } from '../core/bands.js';
import { linkEstimate, noiseFloor } from '../core/rf.js';
import { run } from '../engine/rfClient.js';

export const devices = () => devicesIndex(store.project.customDevices);
export const deviceOf = (ap) => resolveDevice(ap.deviceId, devices());

// ------------------------------------------------------------------ project

export function replaceProject(project, { label } = {}) {
  store.project = project;
  store.version++;
  store.ui.floorIndex = 0;
  store.ui.selection = null;
  store.ui.lastSavedVersion = store.version;
  store.ui.autosaved = false;
  store.ui.started = true;
  store.rf.result = null;
  store.rf.summary = null;
  resetHistory();
  notify();
  if (label) toast(label);
}

export function startBlankProject(name = 'Untitled project') {
  replaceProject(newProject(name));
}

export function setProjectName(name) {
  commit((p) => { p.name = String(name).slice(0, 120) || 'Untitled project'; });
}

export function setSettings(fn) {
  commit((p) => fn(p.settings));
}

export function applyTargetPreset(key) {
  const pr = TARGET_PRESETS[key];
  if (!pr) return;
  setSettings((s) => {
    s.target.preset = key;
    if (key !== 'custom') {
      s.target.primary = pr.primary;
      s.target.secondary = pr.secondary;
      s.target.secondaryEnabled = pr.secondaryEnabled;
    }
  });
}

// ------------------------------------------------------------------- floors

export function addFloor({ name, width, height, imageId = null, scale = null, select = true } = {}) {
  let index = 0;
  commit((p) => {
    const f = newFloor(name || `Level ${p.floors.length + 1}`, { width, height, imageId, scale });
    p.floors.push(f);
    index = p.floors.length - 1;
  });
  if (select) setUi({ floorIndex: index, selection: null });
  return index;
}

export function addBlankFloor(widthM = 40, heightM = 25, name) {
  const pxPerM = 25;
  return addFloor({ name, width: Math.round(widthM * pxPerM), height: Math.round(heightM * pxPerM), scale: 1 / pxPerM });
}

export function setFloorImage(index, { dataUrl, width, height }) {
  commit((p) => {
    const f = p.floors[index];
    if (f.imageId && !p.floors.some((g, i) => i !== index && g.imageId === f.imageId)) delete p.images[f.imageId];
    const id = uid('img');
    p.images[id] = dataUrl;
    const sx = width / f.width, sy = height / f.height;
    const hadContent = f.walls.length || f.aps.length || f.zones.length;
    f.imageId = id;
    if (hadContent && Math.abs(sx - sy) < 0.01 && Math.abs(sx - 1) > 0.001) {
      // Keep drawn content aligned when the replacement is a resized copy.
      const k = sx;
      f.walls.forEach((w) => { w.x1 *= k; w.y1 *= k; w.x2 *= k; w.y2 *= k; });
      f.aps.forEach((a) => { a.x *= k; a.y *= k; });
      f.zones.forEach((z) => z.points.forEach((pt) => { pt.x *= k; pt.y *= k; }));
      f.closets.forEach((c) => { c.x *= k; c.y *= k; });
      f.clients.forEach((c) => { c.x *= k; c.y *= k; });
      if (f.scale) f.scale /= k;
    }
    f.width = width;
    f.height = height;
  });
}

export function removeFloor(index) {
  commit((p) => {
    const f = p.floors[index];
    if (f?.imageId && !p.floors.some((g, i) => i !== index && g.imageId === f.imageId)) delete p.images[f.imageId];
    p.floors.splice(index, 1);
  });
  setUi({ floorIndex: Math.max(0, Math.min(store.ui.floorIndex, store.project.floors.length - 1)), selection: null });
}

export function moveFloor(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= store.project.floors.length) return;
  commit((p) => { const [f] = p.floors.splice(index, 1); p.floors.splice(j, 0, f); });
  setUi({ floorIndex: j });
}

export function updateFloor(index, patch) {
  commit((p) => Object.assign(p.floors[index], patch));
}

/** Set scale from a measured pixel distance and its real length in meters. */
export function setScale(index, pixels, meters) {
  if (!(pixels > 0) || !(meters > 0)) return false;
  commit((p) => { p.floors[index].scale = meters / pixels; });
  return true;
}

// -------------------------------------------------------------------- walls

export function addWalls(segments, materialId = store.ui.wallMaterial) {
  if (!segments.length) return [];
  const ids = [];
  commit((p) => {
    const f = p.floors[store.ui.floorIndex];
    for (const s of segments) {
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 0.5) continue;
      const id = uid('wall');
      ids.push(id);
      f.walls.push({ id, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, materialId });
    }
  });
  return ids;
}

export function setWallMaterial(ids, materialId) {
  commit(() => { for (const w of currentFloor().walls) if (ids.includes(w.id)) w.materialId = materialId; });
  setUi({ wallMaterial: materialId });
}

/** Split a wall at a point (used to insert a door gap). */
export function addDoorGap(wallId, x, y, widthM = 0.9) {
  const f = currentFloor();
  const w = f.walls.find((o) => o.id === wallId);
  if (!w || !f.scale) return;
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const t = ((x - w.x1) * (w.x2 - w.x1) + (y - w.y1) * (w.y2 - w.y1)) / (len * len);
  const half = widthM / f.scale / 2 / len;
  const t0 = Math.max(0, t - half), t1 = Math.min(1, t + half);
  commit(() => {
    const at = (tt) => ({ x: w.x1 + (w.x2 - w.x1) * tt, y: w.y1 + (w.y2 - w.y1) * tt });
    const a = at(t0), b = at(t1);
    const idx = f.walls.indexOf(w);
    const parts = [];
    if (t0 > 0.001) parts.push({ id: uid('wall'), x1: w.x1, y1: w.y1, x2: a.x, y2: a.y, materialId: w.materialId });
    if (t1 < 0.999) parts.push({ id: uid('wall'), x1: b.x, y1: b.y, x2: w.x2, y2: w.y2, materialId: w.materialId });
    f.walls.splice(idx, 1, ...parts);
  });
  validateSelection();
}

// -------------------------------------------------------------------- areas

export function addZone(kind, points, extra = {}) {
  let id = null;
  commit((p) => {
    const f = p.floors[store.ui.floorIndex];
    id = uid('zone');
    const n = f.zones.filter((z) => z.kind === kind).length + 1;
    f.zones.push({
      id, kind, points: points.map((pt) => ({ x: pt.x, y: pt.y })),
      name: extra.name ?? (kind === 'room' ? `Room ${n}` : kind === 'exclusion' ? `Excluded ${n}` : `Zone ${n}`),
      materialId: kind === 'attenuation' ? extra.materialId || store.ui.zoneMaterial : null,
      devices: extra.devices || 0,
    });
  });
  return id;
}

export function updateZone(id, patch) {
  commit(() => { const z = currentFloor().zones.find((o) => o.id === id); if (z) Object.assign(z, patch); });
}

export function detectRoomsOnFloor() {
  const f = currentFloor();
  if (!f?.scale) { toast('Set the scale before detecting rooms.', 'warn'); return 0; }
  if (!f.walls.length) { toast('Draw walls first; rooms are found from closed wall outlines.', 'warn'); return 0; }
  const found = detectRooms(f.walls, f.width, f.height, f.scale);
  const existing = f.zones.filter((z) => z.kind === 'room');
  const fresh = found.filter((r) => {
    const c = polygonBounds(r.points);
    const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
    return !existing.some((z) => pointInPolygon(cx, cy, z.points));
  });
  if (!fresh.length) { toast(found.length ? 'All enclosed rooms already have areas.' : 'No enclosed rooms found. Rooms need walls on every side; door gaps under 1 m are bridged.', 'info'); return 0; }
  commit((p) => {
    const fl = p.floors[store.ui.floorIndex];
    let n = fl.zones.filter((z) => z.kind === 'room').length;
    for (const r of fresh.sort((a, b) => polygonArea(b.points) - polygonArea(a.points))) {
      fl.zones.push({ id: uid('zone'), kind: 'room', name: `Room ${++n}`, points: r.points, materialId: null, devices: 0 });
    }
  });
  toast(`Found ${fresh.length} room${fresh.length === 1 ? '' : 's'}.`);
  return fresh.length;
}

// ---------------------------------------------------------- access points

function nextApName(f, fi) {
  const used = new Set(f.aps.map((a) => a.name));
  for (let n = 1; n < 10000; n++) {
    const name = `AP-${fi + 1}-${String(n).padStart(2, '0')}`;
    if (!used.has(name)) return name;
  }
  return 'AP';
}

export function powerFor(preset, band, dev) {
  const max = dev.radios[band]?.txMax ?? 20;
  if (preset === 'max') return max;
  return Math.min(POWER_PRESETS[preset]?.[band] ?? 17, max);
}

/** Default radios for a new AP, with a starting channel that spreads APs out. */
export function defaultRadios(dev, indexHint = 0) {
  const s = store.project.settings;
  const radios = {};
  for (const b of BANDS) {
    const dr = dev.radios[b];
    const width = Math.min(s.defaultWidth[b], dr?.maxWidth ?? s.defaultWidth[b]);
    let ch;
    if (b === '2.4') ch = nonOverlapping24(s.region)[indexHint % nonOverlapping24(s.region).length][0];
    else {
      const blocks = blocksFor(b, width, s.region, { allowDfs: s.allowDfs });
      const block = blocks[indexHint % Math.max(1, blocks.length)] || [b === '5' ? 36 : 5];
      ch = b === '6' ? block.find((c) => isPsc(b, c)) ?? block[0] : block[0];
    }
    radios[b] = { on: !!dr, ch, width: blocksFor(b, width, s.region, { allowDfs: true }).length ? width : 20, power: dr ? powerFor('medium', b, dev) : 17, preset: 'medium' };
  }
  return radios;
}

export function addAp(x, y, deviceId) {
  const dev = devices().get(deviceId);
  if (!dev) return null;
  let id = null;
  commit((p) => {
    const fi = store.ui.floorIndex;
    const f = p.floors[fi];
    id = uid('ap');
    f.aps.push({
      id, name: nextApName(f, fi), deviceId, x, y,
      heightM: dev.mount === 'ceiling' ? Math.min(MOUNT_HEIGHT_M.ceiling, f.heightM - 0.3) : MOUNT_HEIGHT_M[dev.mount] ?? 2.7,
      orientation: 0, radios: defaultRadios(dev, f.aps.length), enabled: true, closetId: null, notes: '',
    });
  });
  setUi({ selection: { kind: 'ap', ids: [id] } });
  return id;
}

export function updateAp(id, patch) {
  commit(() => { const a = currentFloor().aps.find((o) => o.id === id); if (a) Object.assign(a, patch); });
}

export function updateAps(ids, fn) {
  commit(() => { for (const a of currentFloor().aps) if (ids.includes(a.id)) fn(a); });
}

export function updateRadio(ids, band, patch) {
  commit(() => {
    for (const a of currentFloor().aps) {
      if (!ids.includes(a.id)) continue;
      const r = a.radios[band];
      Object.assign(r, patch);
      if (patch.preset && patch.preset !== 'custom') r.power = powerFor(patch.preset, band, deviceOf(a));
      if (patch.power != null && patch.preset == null) r.preset = 'custom';
    }
  });
}

export function changeDevice(ids, deviceId) {
  const dev = devices().get(deviceId);
  if (!dev) return;
  commit(() => {
    for (const a of currentFloor().aps) {
      if (!ids.includes(a.id)) continue;
      a.deviceId = deviceId;
      for (const b of BANDS) {
        const r = a.radios[b];
        const dr = dev.radios[b];
        if (!dr) { r.on = false; continue; }
        if (r.preset && r.preset !== 'custom') r.power = powerFor(r.preset, b, dev);
        if (r.width > dr.maxWidth) r.width = dr.maxWidth;
      }
    }
  });
  setUi({ deviceId });
}

export function duplicateSelection() {
  const sel = store.ui.selection;
  if (!sel || sel.kind !== 'ap') return;
  const f = currentFloor();
  const off = f.scale ? 1.5 / f.scale : 30;
  const ids = [];
  commit((p) => {
    const fl = p.floors[store.ui.floorIndex];
    for (const a of fl.aps.filter((o) => sel.ids.includes(o.id))) {
      const id = uid('ap');
      ids.push(id);
      fl.aps.push({ ...structuredClone(a), id, name: nextApName(fl, store.ui.floorIndex), x: a.x + off, y: a.y + off, closetId: a.closetId });
    }
  });
  setUi({ selection: { kind: 'ap', ids } });
}

// --------------------------------------------------------- closets, clients

export function addCloset(x, y) {
  let id = null;
  commit((p) => {
    const f = p.floors[store.ui.floorIndex];
    id = uid('idf');
    f.closets.push({ id, name: `IDF-${f.closets.length + 1}`, x, y, poeBudgetW: null });
  });
  setUi({ selection: { kind: 'closet', ids: [id] } });
}

export function updateCloset(id, patch) {
  commit(() => { const c = currentFloor().closets.find((o) => o.id === id); if (c) Object.assign(c, patch); });
}

export function addClient(x, y) {
  commit((p) => { p.floors[store.ui.floorIndex].clients.push({ id: uid('cl'), x, y }); });
}

export function simulateClients(count) {
  const f = currentFloor();
  const rooms = f.zones.filter((z) => z.kind === 'room');
  const excl = f.zones.filter((z) => z.kind === 'exclusion');
  const areas = rooms.length ? rooms : [{ points: [{ x: 0, y: 0 }, { x: f.width, y: 0 }, { x: f.width, y: f.height }, { x: 0, y: f.height }] }];
  const weights = areas.map((a) => (a.devices > 0 ? a.devices : polygonArea(a.points)));
  const total = weights.reduce((s, v) => s + v, 0) || 1;
  const pts = [];
  let guard = count * 60;
  while (pts.length < count && guard-- > 0) {
    let r = Math.random() * total, k = 0;
    while (r > weights[k] && k < weights.length - 1) { r -= weights[k]; k++; }
    const b = polygonBounds(areas[k].points);
    const x = b.minX + Math.random() * (b.maxX - b.minX), y = b.minY + Math.random() * (b.maxY - b.minY);
    if (!pointInPolygon(x, y, areas[k].points)) continue;
    if (excl.some((z) => pointInPolygon(x, y, z.points))) continue;
    pts.push({ id: uid('cl'), x, y });
  }
  commit((p) => { p.floors[store.ui.floorIndex].clients = pts; });
  setLayer('clients', true);
  return pts.length;
}

export function clearClients() {
  commit((p) => { p.floors[store.ui.floorIndex].clients = []; });
}

function setLayer(k, v) {
  store.ui.layers = { ...store.ui.layers, [k]: v };
}

// ----------------------------------------------------------- selection ops

export function deleteSelection() {
  const sel = store.ui.selection;
  if (!sel) return;
  const map = { ap: 'aps', wall: 'walls', zone: 'zones', closet: 'closets', client: 'clients' };
  commit((p) => {
    const f = p.floors[store.ui.floorIndex];
    f[map[sel.kind]] = f[map[sel.kind]].filter((o) => !sel.ids.includes(o.id));
    if (sel.kind === 'closet') for (const a of f.aps) if (sel.ids.includes(a.closetId)) a.closetId = null;
  });
  setUi({ selection: null });
}

export function nudgeSelection(dx, dy) {
  const sel = store.ui.selection;
  if (!sel) return;
  const before = beginTransient();
  moveSelectionBy(dx, dy);
  commit(null, { before });
}

/** Move selected objects by (dx, dy) px without an undo point. */
export function moveSelectionBy(dx, dy) {
  const sel = store.ui.selection;
  const f = currentFloor();
  if (!sel || !f) return;
  if (sel.kind === 'wall') for (const w of f.walls) { if (sel.ids.includes(w.id)) { w.x1 += dx; w.y1 += dy; w.x2 += dx; w.y2 += dy; } }
  else if (sel.kind === 'zone') for (const z of f.zones) { if (sel.ids.includes(z.id)) z.points.forEach((pt) => { pt.x += dx; pt.y += dy; }); }
  else {
    const coll = { ap: f.aps, closet: f.closets, client: f.clients }[sel.kind] || [];
    for (const o of coll) if (sel.ids.includes(o.id)) { o.x += dx; o.y += dy; }
  }
  store.version++;
  notify();
}

export function selectAll(kind = 'ap') {
  const f = currentFloor();
  if (!f) return;
  const coll = { ap: f.aps, wall: f.walls }[kind];
  setUi({ selection: coll.length ? { kind, ids: coll.map((o) => o.id) } : null });
}

// ------------------------------------------------------ automatic planning

export async function autoPlanChannels({ bands = BANDS, widths } = {}) {
  const s = store.project.settings;
  const results = [];
  setUi({ busy: { label: 'Planning channels', progress: null } });
  try {
    for (const band of bands) {
      const r = await run('channels', { band, allowDfs: s.allowDfs, widths });
      results.push(r);
    }
  } finally {
    setUi({ busy: null });
  }
  let changed = 0, conflicts = 0;
  commit((p) => {
    for (const r of results) {
      conflicts += r.conflicts.length;
      for (const a of r.assignments) {
        for (const f of p.floors) {
          const ap = f.aps.find((o) => o.id === a.apId);
          if (!ap) continue;
          const rad = ap.radios[r.band];
          if (rad.ch !== a.ch || rad.width !== a.width) changed++;
          rad.ch = a.ch;
          rad.width = a.width;
        }
      }
    }
  });
  return { changed, conflicts, results };
}

export async function autoPlaceAps({ deviceId, band = '5', mode = 'add', preset = 'medium' }) {
  const fi = store.ui.floorIndex;
  const f = currentFloor();
  const dev = devices().get(deviceId);
  if (!f?.scale || !dev) return null;
  if (!dev.radios[band]) band = dev.radios['5'] ? '5' : Object.keys(dev.radios)[0];
  const heightM = dev.mount === 'ceiling' ? Math.min(MOUNT_HEIGHT_M.ceiling, f.heightM - 0.3) : MOUNT_HEIGHT_M[dev.mount] ?? 2.7;
  const devicesNeeded = f.zones.filter((z) => z.kind === 'room').reduce((s, z) => s + (z.devices || 0), 0);
  const minAps = devicesNeeded ? Math.ceil(devicesNeeded / (store.project.settings.capacity.devicesPerRadio * 2)) : 0;
  setUi({ busy: { label: 'Placing access points', progress: 0 } });
  let res;
  try {
    res = await run('place', { floorIndex: fi, band, device: dev, power: powerFor(preset, band, dev), heightM, mode, minAps, maxAps: 120 }, (p) => setUi({ busy: { label: 'Placing access points', progress: p } }));
  } finally {
    setUi({ busy: null });
  }
  if (res.error) { toast(res.error, 'warn'); return null; }
  const ids = [];
  commit((p) => {
    const fl = p.floors[fi];
    if (mode === 'replace') fl.aps = [];
    for (const pt of res.points) {
      const id = uid('ap');
      ids.push(id);
      fl.aps.push({ id, name: nextApName(fl, fi), deviceId: dev.id, x: pt.x, y: pt.y, heightM, orientation: 0, radios: defaultRadios(dev, fl.aps.length), enabled: true, closetId: null, notes: '' });
      for (const b of BANDS) if (fl.aps.at(-1).radios[b].on) { fl.aps.at(-1).radios[b].preset = preset; fl.aps.at(-1).radios[b].power = powerFor(preset, b, dev); }
    }
  });
  return { ...res, ids };
}

// ---------------------------------------------------------------- versions

export function saveVersion(name) {
  commit((p) => {
    p.versions.unshift({ id: uid('ver'), name: name || `Version ${p.versions.length + 1}`, createdAt: new Date().toISOString(), floors: structuredClone(p.floors) });
    if (p.versions.length > 30) p.versions.length = 30;
  });
}

export function restoreVersion(id) {
  const v = store.project.versions.find((o) => o.id === id);
  if (!v) return;
  commit((p) => { p.floors = structuredClone(v.floors); });
  setUi({ selection: null, floorIndex: 0 });
}

export function deleteVersion(id) {
  commit((p) => { p.versions = p.versions.filter((v) => v.id !== id); });
}

// -------------------------------------------------- clients & probe (main)

let sceneCache = { key: '', scenes: new Map() };

export function sceneFor(fi) {
  const key = `${store.version}`;
  if (sceneCache.key !== key) sceneCache = { key, scenes: new Map() };
  if (!sceneCache.scenes.has(fi)) sceneCache.scenes.set(fi, buildScene(store.project, fi, 'low'));
  return sceneCache.scenes.get(fi);
}

/** Readings at a point on the current floor for the current band. */
export function probeAt(x, y, band = store.ui.band) {
  const fi = store.ui.floorIndex;
  const scene = sceneFor(fi);
  if (!scene) return null;
  const list = emitters(store.project, fi, band, devices());
  if (!list.length) return { readings: [] };
  const readings = probe(scene, list, band, x, y);
  const s = store.project.settings;
  const top = readings[0];
  const noise = s.noiseOverride != null ? s.noiseOverride + 10 * Math.log10(top.e.width / 20) : noiseFloor(top.e.width, s.noiseFigure);
  return { readings, noise, snr: top.rssi - noise };
}

const pairCache = new Map();

/** Radio pairs on one floor that share spectrum and hear each other above the CCA level. */
export function coChannelPairs(fi, band) {
  const key = `${store.version}|${fi}|${band}`;
  if (pairCache.has(key)) return pairCache.get(key);
  if (pairCache.size > 40) pairCache.clear();
  const scene = sceneFor(fi);
  const pairs = [];
  if (scene) {
    const list = emitters(store.project, fi, band, devices()).filter((e) => e.floorIndex === fi);
    const cca = store.project.settings.ccaDbm;
    const n = Math.min(list.length, 400);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = list[i], b = list[j];
        if (!radiosOverlap(band, a.ch, a.width, b.ch, b.width)) continue;
        const r = Math.max(rssiAt(scene, a, band, b.x, b.y), rssiAt(scene, b, band, a.x, a.y));
        if (r >= cca) pairs.push({ a: a.id, b: b.id, rssi: r, an: a.name, bn: b.name });
      }
    }
  }
  pairCache.set(key, pairs);
  return pairs;
}

let assocCache = { key: '', value: null };

/**
 * Client associations on the current floor. A client joins the best band it
 * supports (6 → 5 → 2.4 when that band is at least −70 dBm, else the
 * strongest), and only if the signal is above the association minimum.
 */
export function clientAssociations() {
  const fi = store.ui.floorIndex;
  const key = `${store.version}|${fi}`;
  if (assocCache.key === key) return assocCache.value;
  const f = currentFloor();
  const scene = sceneFor(fi);
  const s = store.project.settings;
  const result = { clients: [], perAp: new Map() };
  if (!f || !scene) { assocCache = { key, value: result }; return result; }
  const lists = {};
  for (const b of s.client.bands) lists[b] = emitters(store.project, fi, b, devices()).filter((e) => e.floorIndex === fi || true);
  for (const c of f.clients) {
    let pick = null;
    const options = [];
    for (const b of ['6', '5', '2.4']) {
      if (!lists[b]?.length) continue;
      const r = probe(scene, lists[b], b, c.x, c.y)[0];
      if (r && r.rssi >= s.associateMinDbm) options.push({ band: b, ...r });
    }
    pick = options.find((o) => o.rssi >= -70) || options.sort((a, b) => b.rssi - a.rssi)[0] || null;
    const entry = { id: c.id, x: c.x, y: c.y, assoc: pick ? { apId: pick.e.id, apName: pick.e.name, band: pick.band, rssi: pick.rssi, e: pick.e } : null };
    result.clients.push(entry);
    if (pick) {
      const k = `${pick.e.id}|${pick.band}`;
      result.perAp.set(k, (result.perAp.get(k) || 0) + 1);
    }
  }
  const totalAssoc = result.clients.filter((c) => c.assoc).length || 1;
  for (const c of result.clients) {
    if (!c.assoc) continue;
    const e = c.assoc.e;
    const noise = s.noiseOverride != null ? s.noiseOverride + 10 * Math.log10(e.width / 20) : noiseFloor(e.width, s.noiseFigure);
    const link = linkEstimate({ snr: c.assoc.rssi - noise, apGen: e.gen, apNss: e.nss, apWidth: e.width, clientGen: s.client.gen, clientNss: s.client.nss, clientMaxWidth: s.client.maxWidth[c.assoc.band] || 20, efficiency: s.efficiency, thresholds: s.mcsSnr });
    const sharing = result.perAp.get(`${e.id}|${c.assoc.band}`) || 1;
    c.link = link;
    c.shareMbps = Math.min(link.throughput / sharing, s.internet.down / totalAssoc);
    c.sharing = sharing;
  }
  assocCache = { key, value: result };
  return result;
}

export { primaryChannels };
