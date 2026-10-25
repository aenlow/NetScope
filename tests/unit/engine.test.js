import { describe, it, expect } from 'vitest';
import { newProject, newFloor, parseProjectText, serializeProject, validateProject } from '../../src/core/schema.js';
import { buildScene, emitters, rssiAt, computeGrid, combineGrids, evalMask, coverageStats } from '../../src/core/propagation.js';
import { fspl } from '../../src/core/rf.js';
import { planChannels, couplingWeight } from '../../src/core/channels.js';
import { blocksFor, radiosOverlap, primaryChannels, isPsc, occupied } from '../../src/core/bands.js';
import { devicesIndex, findDeviceId, DEVICES } from '../../src/data/devices.js';
import { billOfMaterials, cableRuns } from '../../src/core/analysis.js';
import { lenIn, lenOut } from '../../src/core/units.js';

function project1() {
  const p = newProject('Test');
  const f = newFloor('L1', { width: 1000, height: 600, scale: 0.05 }); // 50 m × 30 m
  f.aps.push({
    id: 'ap1', name: 'AP-1', deviceId: 'generic-test', x: 200, y: 300, heightM: 3.0, orientation: 0, enabled: true, closetId: null, notes: '',
    radios: { '2.4': { on: true, ch: 1, width: 20, power: 20, preset: 'custom' }, '5': { on: true, ch: 36, width: 20, power: 20, preset: 'custom' }, '6': { on: false, ch: 5, width: 80, power: 17, preset: 'custom' } },
  });
  p.floors.push(f);
  p.settings.clientHeightM = 1.0;
  return p;
}
const dev = new Map([['generic-test', { id: 'generic-test', vendor: 'T', model: 'T', gen: 6, radios: { '2.4': { nss: 2, txMax: 23, gain: 4, maxWidth: 40 }, '5': { nss: 2, txMax: 23, gain: 4, maxWidth: 160 } }, antenna: { pattern: 'omni' }, status: 'typical' }]]);

describe('propagation', () => {
  it('RSSI at a point equals Tx + gain − FSPL(3D distance) with no walls', () => {
    const p = project1();
    const scene = buildScene(p, 0);
    const [e] = emitters(p, 0, '5', dev);
    // 10 m horizontally (200 px), AP at 3 m, client at 1 m → 2 m vertical.
    const d = Math.hypot(10, 2);
    expect(rssiAt(scene, e, '5', 400, 300)).toBeCloseTo(20 + 4 - fspl(d, 5180), 6);
  });

  it('applies per-band wall loss only when crossed', () => {
    const p = project1();
    p.floors[0].walls.push({ id: 'w', x1: 300, y1: 0, x2: 300, y2: 600, materialId: 'brick' });
    const scene = buildScene(p, 0);
    const e5 = emitters(p, 0, '5', dev)[0];
    const e24 = emitters(p, 0, '2.4', dev)[0];
    const d = Math.hypot(10, 2);
    expect(rssiAt(scene, e5, '5', 400, 300)).toBeCloseTo(24 - fspl(d, 5180) - 15, 6);
    expect(rssiAt(scene, e24, '2.4', 400, 300)).toBeCloseTo(24 - fspl(d, 2412) - 6, 6);
    expect(rssiAt(scene, e5, '5', 250, 300)).toBeGreaterThan(rssiAt(scene, e5, '5', 400, 300));
  });

  it('scale calibration changes distances: doubling m/px lowers RSSI accordingly', () => {
    const p = project1();
    const s1 = buildScene(p, 0);
    const a = rssiAt(s1, emitters(p, 0, '5', dev)[0], '5', 600, 300);
    p.floors[0].scale = 0.1;
    const s2 = buildScene(p, 0);
    const b = rssiAt(s2, emitters(p, 0, '5', dev)[0], '5', 600, 300);
    expect(a - b).toBeCloseTo(fspl(Math.hypot(40, 2), 5180) - fspl(Math.hypot(20, 2), 5180), 6);
  });

  it('adds slab loss for an AP on another floor', () => {
    const p = project1();
    const f2 = newFloor('L2', { width: 1000, height: 600, scale: 0.05 });
    p.floors.push(f2);
    const scene2 = buildScene(p, 1);
    const [e] = emitters(p, 1, '5', dev);
    expect(e.crossed).toBe(1);
    // Directly above: vertical distance = (0 + 3.0) − (3.5 + 1.0) = −1.5 → 1.5 m
    expect(rssiAt(scene2, e, '5', 200, 300)).toBeCloseTo(24 - fspl(1.5, 5180) - 22, 6);
  });

  it('coverage % follows the threshold and the room mask', () => {
    const p = project1();
    p.floors[0].zones.push({ id: 'r', kind: 'room', name: 'Near', points: [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 400 }, { x: 100, y: 400 }], materialId: null, devices: 0 });
    const scene = buildScene(p, 0, 'low');
    const list = emitters(p, 0, '5', dev).map((e) => ({ e, grid: computeGrid(scene, e, '5') }));
    const combined = combineGrids(scene, list, p.settings, '5');
    const mask = evalMask(scene, p.floors[0].zones);
    expect(coverageStats(combined, mask, { primary: -65, secondary: -67 }).primaryPct).toBe(100);
    expect(coverageStats(combined, mask, { primary: -20, secondary: -67 }).primaryPct).toBe(0);
    expect(coverageStats(combined, mask, { primary: -65, secondary: -67 }).secondaryPct).toBe(0);
  });
});

describe('channels', () => {
  it('lists DFS channels only when allowed', () => {
    const noDfs = primaryChannels('5', 20, 'US', { allowDfs: false });
    expect(noDfs).toEqual([36, 40, 44, 48, 149, 153, 157, 161, 165]);
    expect(primaryChannels('5', 20, 'US', { allowDfs: true })).toContain(100);
    expect(blocksFor('5', 80, 'US', { allowDfs: false })).toEqual([[36, 40, 44, 48], [149, 153, 157, 161]]);
    expect(blocksFor('5', 80, 'EU', { allowDfs: true }).some((b) => b.includes(144))).toBe(false);
  });
  it('knows 6 GHz PSC channels and frequencies', () => {
    expect(isPsc('6', 5)).toBe(true);
    expect(isPsc('6', 37)).toBe(true);
    expect(isPsc('6', 9)).toBe(false);
    expect(occupied('6', 37, 20).center).toBe(5950 + 5 * 37);
  });
  it('treats 1/6/11 as non-overlapping and 1/3 as overlapping on 2.4 GHz', () => {
    expect(radiosOverlap('2.4', 1, 20, 6, 20)).toBe(false);
    expect(radiosOverlap('2.4', 1, 20, 3, 20)).toBe(true);
    expect(radiosOverlap('5', 36, 20, 40, 20)).toBe(false);
    expect(radiosOverlap('5', 36, 80, 44, 20)).toBe(true);
  });
  it('gives three neighbouring 2.4 GHz radios three different channels', () => {
    const r = planChannels('2.4', [{ width: 20 }, { width: 20 }, { width: 20 }], () => 10);
    expect(new Set(r.assign.map((a) => a.ch))).toEqual(new Set([1, 6, 11]));
    expect(r.conflicts.length).toBe(0);
  });
  it('separates 5 GHz neighbours and reports unavoidable conflicts', () => {
    const r = planChannels('5', Array.from({ length: 3 }, () => ({ width: 80 })), () => 5, { region: 'US', allowDfs: false });
    expect(r.conflicts.length).toBe(1); // only two non-DFS 80 MHz blocks exist in the US
    const r2 = planChannels('5', Array.from({ length: 3 }, () => ({ width: 80 })), () => 5, { region: 'US', allowDfs: true });
    expect(r2.conflicts.length).toBe(0);
  });
  it('prefers PSC primaries on 6 GHz', () => {
    const r = planChannels('6', [{ width: 80 }, { width: 80 }], () => 5);
    for (const a of r.assign) expect(isPsc('6', a.ch)).toBe(true);
  });
  it('ignores radios below the clear-channel threshold', () => {
    expect(couplingWeight(-95, -82)).toBe(0);
    expect(couplingWeight(-82, -82)).toBe(1);
  });
});

describe('project files', () => {
  it('round-trips a v2 project through save and load', () => {
    const p = project1();
    p.floors[0].walls.push({ id: 'w1', x1: 1, y1: 2, x2: 30, y2: 40, materialId: 'glass' });
    const text = serializeProject(p);
    const { project } = parseProjectText(text, findDeviceId);
    expect(project.floors[0].walls[0]).toEqual(p.floors[0].walls[0]);
    expect(project.floors[0].aps[0].radios).toEqual(p.floors[0].aps[0].radios);
    expect(project.settings).toEqual(p.settings);
    expect(project.floors[0].scale).toBe(0.05);
  });

  it('loads a v1 file: ft/px scale, polyline walls, per-AP settings', () => {
    const v1 = {
      name: 'Old', version: '1.0', scale: 0.1,
      floorPlan: null,
      accessPoints: [{ x: 10, y: 20, device: { vendor: 'Ubiquiti', model: 'U6-Pro (AP)', radios: [{ band: '2.4', maxTx: 20 }, { band: '5', maxTx: 23 }], antenna: { type: 'omni', gain: 4 } }, config: { name: '<img src=x onerror=alert(1)>', height: 9, tx24: 18, tx5: 21, channel24: 6, channel5: 44, antennaType: 'omni', orientation: 0 } }],
      walls: [{ id: 'w', points: [0, 0, 100, 0, 100, 100, 0, 0], attenuation: 8 }],
      obstacles: [{ id: 'o', x: 0, y: 0, width: 10, height: 10, attenuation: 5 }],
    };
    const { project, warnings } = parseProjectText(JSON.stringify(v1), findDeviceId);
    const f = project.floors[0];
    expect(f.scale).toBeCloseTo(0.1 * 0.3048, 9);
    expect(f.walls.filter((w) => w.materialId === 'legacy-8').length).toBe(3);
    expect(f.walls.filter((w) => w.materialId === 'legacy-2.5').length).toBe(4);
    expect(project.materials.find((m) => m.id === 'legacy-8').loss).toEqual({ '2.4': 8, '5': 8, '6': 8 });
    expect(f.aps[0].heightM).toBeCloseTo(9 * 0.3048, 9);
    expect(f.aps[0].radios['5']).toMatchObject({ on: true, ch: 44, power: 21 });
    expect(f.aps[0].radios['2.4']).toMatchObject({ ch: 6, power: 18 });
    // The name is kept as plain text; the UI renders it with textContent.
    expect(typeof f.aps[0].name).toBe('string');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('rejects non-projects and hostile values', () => {
    expect(() => parseProjectText('{"hello":1}')).toThrow(/not a NetScope project/);
    expect(() => parseProjectText('not json')).toThrow(/not valid JSON/);
    const raw = JSON.parse(serializeProject(project1()));
    raw.images = { a: 'javascript:alert(1)', b: 'https://example.com/x.png' };
    raw.floors[0].imageId = 'a';
    raw.floors[0].aps[0].x = 'NaN';
    raw.floors[0].aps[0].radios['5'].power = 1e9;
    raw.floors[0].aps.push(null, 5, 'x');
    const { project, warnings } = validateProject(raw);
    expect(project.images).toEqual({});
    expect(project.floors[0].imageId).toBe(null);
    expect(project.floors[0].aps.length).toBe(1);
    expect(project.floors[0].aps[0].x).toBe(0);
    expect(project.floors[0].aps[0].radios['5'].power).toBe(36);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('refuses files from a newer format version', () => {
    const raw = JSON.parse(serializeProject(project1()));
    raw.version = 99;
    expect(() => parseProjectText(JSON.stringify(raw))).toThrow(/newer NetScope/);
  });
});

describe('library, BOM and cabling', () => {
  it('has unique device ids and every device has at least one radio', () => {
    const ids = DEVICES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DEVICES) expect(Object.keys(d.radios).length).toBeGreaterThan(0);
  });
  it('builds a bill of materials with quantities', () => {
    const p = project1();
    p.floors[0].aps.push({ ...p.floors[0].aps[0], id: 'ap2', name: 'AP-2' });
    const bom = billOfMaterials(p, dev);
    expect(bom).toHaveLength(1);
    expect(bom[0].qty).toBe(2);
  });
  it('estimates cable runs rectilinearly with vertical allowance and slack', () => {
    const p = project1();
    p.floors[0].closets.push({ id: 'c', name: 'IDF', x: 200, y: 100, poeBudgetW: null });
    const [run] = cableRuns(p, devicesIndex());
    expect(run.lengthM).toBeCloseTo((10 + 3) * 1.1, 6);
  });
  it('converts units at the edges only', () => {
    expect(lenIn(10, 'ft')).toBeCloseTo(3.048, 9);
    expect(lenOut(3.048, 'ft')).toBeCloseTo(10, 9);
    expect(lenIn(10, 'm')).toBe(10);
  });
});

import { autoPlace } from '../../src/core/autoplace.js';
import { specLevel } from '../../src/data/devices.js';

describe('auto-placement', () => {
  it('adds access points until the coverage goal is met', () => {
    const p = newProject('AP');
    const f = newFloor('L1', { width: 1200, height: 800, scale: 0.05 }); // 60 × 40 m
    for (let x = 200; x < 1200; x += 200) f.walls.push({ id: `w${x}`, x1: x, y1: 0, x2: x, y2: 600, materialId: 'block' });
    p.floors.push(f);
    const scene = buildScene(p, 0, 'low');
    const mask = new Uint8Array(scene.cols * scene.rows).fill(1);
    const makeEmitter = (x, y) => ({ id: 'c', x, y, zM: 3, crossed: 0, power: 17, gain: 4, antenna: { pattern: 'omni', gain: 4 }, orientation: 0, freq: 5500, slabLoss: 0, targetZ: 0 });
    const r = autoPlace({ scene, band: '5', mask, makeEmitter, primary: -67, secondary: -70, secondaryEnabled: false, goalPct: 95, maxAps: 40 });
    expect(r.points.length).toBeGreaterThan(1);
    expect(r.primaryPct).toBeGreaterThanOrEqual(95);
    // A stricter target needs more access points.
    const hard = autoPlace({ scene, band: '5', mask, makeEmitter, primary: -55, secondary: -60, secondaryEnabled: false, goalPct: 95, maxAps: 40 });
    expect(hard.points.length).toBeGreaterThan(r.points.length);
  });
});

describe('device provenance', () => {
  it('labels datasheet, partly verified and typical devices', () => {
    const idx = devicesIndex();
    expect(specLevel(idx.get('ubiquiti-u7-pro'))).toBe('datasheet');
    expect(specLevel(idx.get('juniper-mist-ap45'))).toBe('partial');
    expect(specLevel(idx.get('ruckus-r850'))).toBe('typical');
    expect(idx.get('ubiquiti-u7-pro').radios['6'].gain).toBe(5.8);
    // Gateways without Wi-Fi from the v1 library are no longer listed.
    for (const id of ['ubiquiti-dream-machine-pro', 'tp-link-er605', 'grandstream-gwn7000']) expect(idx.has(id)).toBe(false);
  });
});
