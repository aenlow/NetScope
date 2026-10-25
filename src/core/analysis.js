// Non-visual analysis: cabling, PoE, bill of materials and plan checks.

import { channelProblems, eirpLimit, isDfs, BAND_LABEL, BANDS } from './bands.js';
import { resolveDevice, floorElevations } from './propagation.js';

/** Cable run estimate for every AP: rectilinear path + vertical allowance + slack. */
export function cableRuns(project, devicesById) {
  const s = project.settings.cabling;
  const elev = floorElevations(project);
  const closets = [];
  project.floors.forEach((f, fi) => f.closets.forEach((c) => closets.push({ ...c, fi })));
  const runs = [];
  project.floors.forEach((f, fi) => {
    if (!f.scale) return;
    for (const ap of f.aps) {
      const apW = { x: ap.x * f.scale + f.offsetM.x, y: ap.y * f.scale + f.offsetM.y };
      const lengthTo = (c) => {
        const cf = project.floors[c.fi];
        if (!cf.scale) return Infinity;
        const cW = { x: c.x * cf.scale + cf.offsetM.x, y: c.y * cf.scale + cf.offsetM.y };
        const horiz = Math.abs(apW.x - cW.x) + Math.abs(apW.y - cW.y);
        const vert = s.verticalM + Math.abs(elev[fi] - elev[c.fi]);
        return (horiz + vert) * (1 + s.slackPct / 100);
      };
      let closet = closets.find((c) => c.id === ap.closetId) || null;
      if (!closet && closets.length) closet = closets.reduce((b, c) => (lengthTo(c) < lengthTo(b) ? c : b), closets[0]);
      const dev = resolveDevice(ap.deviceId, devicesById);
      runs.push({
        apId: ap.id, apName: ap.name, floorId: f.id, floorName: f.name,
        closetId: closet?.id || null, closetName: closet?.name || null,
        lengthM: closet ? lengthTo(closet) : null,
        poeW: dev.poeW ?? null,
        over: closet ? lengthTo(closet) > s.maxRunM : false,
      });
    }
  });
  return runs;
}

/** PoE and port totals per closet. */
export function closetLoads(project, runs) {
  const map = new Map();
  project.floors.forEach((f) => f.closets.forEach((c) => map.set(c.id, { id: c.id, name: c.name, floorName: f.name, ports: 0, poeW: 0, unknownPoe: 0, budgetW: c.poeBudgetW ?? null })));
  for (const r of runs) {
    const c = map.get(r.closetId);
    if (!c) continue;
    c.ports++;
    if (r.poeW == null) c.unknownPoe++;
    else c.poeW += r.poeW;
  }
  return [...map.values()];
}

/** Bill of materials grouped by device model. */
export function billOfMaterials(project, devicesById) {
  const map = new Map();
  for (const f of project.floors) {
    for (const ap of f.aps) {
      const dev = resolveDevice(ap.deviceId, devicesById);
      const key = dev.id;
      if (!map.has(key)) {
        map.set(key, { deviceId: key, vendor: dev.vendor, model: dev.model, status: dev.status, qty: 0, floors: new Set(), unitPrice: project.prices?.[key] ?? null });
      }
      const row = map.get(key);
      row.qty++;
      row.floors.add(f.name);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, floors: [...r.floors], total: r.unitPrice != null ? r.unitPrice * r.qty : null }))
    .sort((a, b) => b.qty - a.qty || a.model.localeCompare(b.model));
}

/**
 * Plan checks that do not need the heatmap. Each issue:
 * { level: 'error'|'warn'|'info', code, text, floorId?, target?: { kind, id } }
 */
export function staticIssues(project, devicesById) {
  const out = [];
  const s = project.settings;
  if (!project.floors.length) out.push({ level: 'error', code: 'no-floor', text: 'Add a floor plan to start.' });
  project.floors.forEach((f) => {
    if (!f.scale) out.push({ level: 'error', code: 'no-scale', text: `${f.name}: scale is not set, so no signal is predicted.`, floorId: f.id, target: { kind: 'floor', id: f.id } });
    if (f.scale && !f.aps.length) out.push({ level: 'info', code: 'no-aps', text: `${f.name}: no access points yet.`, floorId: f.id });
    if (f.scale && !f.walls.length) out.push({ level: 'info', code: 'no-walls', text: `${f.name}: no walls drawn, so the prediction is open-space only.`, floorId: f.id });
    const names = new Map();
    for (const ap of f.aps) {
      const dev = resolveDevice(ap.deviceId, devicesById);
      const tgt = { kind: 'ap', id: ap.id };
      if (names.has(ap.name)) out.push({ level: 'warn', code: 'dup-name', text: `${f.name}: two access points are named ${ap.name}.`, floorId: f.id, target: tgt });
      names.set(ap.name, true);
      if (ap.x < 0 || ap.y < 0 || ap.x > f.width || ap.y > f.height) out.push({ level: 'warn', code: 'outside', text: `${ap.name} sits outside the floor plan.`, floorId: f.id, target: tgt });
      if (dev.id === 'generic') out.push({ level: 'warn', code: 'no-device', text: `${ap.name}: device not found in the library; using typical Wi-Fi 6 values.`, floorId: f.id, target: tgt });
      for (const b of BANDS) {
        const r = ap.radios[b];
        if (!r?.on) continue;
        const dr = dev.radios?.[b];
        if (!dr) { out.push({ level: 'warn', code: 'no-radio', text: `${ap.name}: ${dev.model} has no ${BAND_LABEL[b]} radio; that radio is ignored.`, floorId: f.id, target: tgt }); continue; }
        for (const p of channelProblems(b, r.ch, r.width, s.region)) out.push({ level: p.startsWith('40 MHz') ? 'warn' : 'error', code: 'channel', text: `${ap.name} ${BAND_LABEL[b]}: ${p}.`, floorId: f.id, target: tgt });
        if (r.width > dr.maxWidth) out.push({ level: 'warn', code: 'width', text: `${ap.name} ${BAND_LABEL[b]}: ${r.width} MHz exceeds the device's ${dr.maxWidth} MHz.`, floorId: f.id, target: tgt });
        if (isDfs(b, r.ch) && !s.allowDfs) out.push({ level: 'info', code: 'dfs', text: `${ap.name} uses DFS channel ${r.ch}; radar detection can force a channel change.`, floorId: f.id, target: tgt });
        if (r.power > dr.txMax) out.push({ level: 'warn', code: 'tx-max', text: `${ap.name} ${BAND_LABEL[b]}: ${r.power} dBm is above the device maximum of ${dr.txMax} dBm.`, floorId: f.id, target: tgt });
        const limit = eirpLimit(s.region, b, r.ch, r.width);
        if (r.power + dr.gain > limit + 0.01) out.push({ level: 'warn', code: 'eirp', text: `${ap.name} ${BAND_LABEL[b]}: EIRP ${(r.power + dr.gain).toFixed(0)} dBm exceeds the indicative ${limit.toFixed(0)} dBm limit.`, floorId: f.id, target: tgt });
      }
      if (b6Only(ap, s)) out.push({ level: 'info', code: '6-only', text: `${ap.name}: only the 6 GHz radio is on; clients without 6 GHz cannot connect.`, floorId: f.id, target: tgt });
    }
  });
  const runs = cableRuns(project, devicesById);
  const hasClosets = project.floors.some((f) => f.closets.length);
  if (hasClosets) {
    for (const r of runs) if (r.over) out.push({ level: 'warn', code: 'cable', text: `${r.apName}: estimated cable run ${r.lengthM.toFixed(0)} m to ${r.closetName} exceeds ${s.cabling.maxRunM} m.`, floorId: r.floorId, target: { kind: 'ap', id: r.apId } });
    for (const c of closetLoads(project, runs)) {
      if (c.budgetW != null && c.poeW > c.budgetW) out.push({ level: 'warn', code: 'poe', text: `${c.name}: PoE load ${c.poeW.toFixed(0)} W exceeds the ${c.budgetW} W budget.` });
    }
  }
  const unverified = new Set();
  for (const f of project.floors) for (const ap of f.aps) {
    const d = resolveDevice(ap.deviceId, devicesById);
    const f = d.verifiedFields || [];
    if (d.status === 'typical' || (d.status === 'datasheet' && !['txMax', 'gain'].every((k) => f.includes(k)))) unverified.add(d.model);
  }
  if (unverified.size) out.push({ level: 'info', code: 'unverified', text: `Transmit power or antenna gain not verified against a datasheet for: ${[...unverified].slice(0, 6).join(', ')}${unverified.size > 6 ? '…' : ''}. Results use typical values for those.` });
  return out;
}

function b6Only(ap) {
  return ap.radios['6']?.on && !ap.radios['5']?.on && !ap.radios['2.4']?.on;
}

/** Capacity: devices expected in rooms vs what the planned radios can carry. */
export function capacitySummary(project) {
  const per = project.settings.capacity.devicesPerRadio;
  return project.floors.map((f) => {
    const devices = f.zones.filter((z) => z.kind === 'room').reduce((s, z) => s + (z.devices || 0), 0);
    let radios = 0;
    for (const ap of f.aps) {
      if (ap.enabled === false) continue;
      radios += ['5', '6'].filter((b) => ap.radios[b]?.on).length + (ap.radios['2.4']?.on ? 0.5 : 0);
    }
    const capacity = Math.floor(radios * per);
    const neededAps = devices ? Math.ceil(devices / (per * 2)) : 0;
    return { floorId: f.id, floorName: f.name, devices, capacity, neededAps, aps: f.aps.length, short: devices > capacity };
  });
}
