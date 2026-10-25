// Device library. Catalogue rows (catalog.js) give vendor, model, class,
// generation and radios; power, gain and PoE come from typical class values
// unless a datasheet entry in verified.js supplies them. Each device carries
// a status so the UI never presents a typical value as a datasheet fact.

import { CATALOG } from './catalog.js';
import { VERIFIED } from './verified.js';

// Typical class values (dBm conducted per radio, dBi, W). Planning estimates.
const TYPICAL = {
  ap: { tx: { '2.4': 22, '5': 23, '6': 22 }, gain: { '2.4': 4, '5': 5, '6': 5 } },
  wallplate: { tx: { '2.4': 20, '5': 21, '6': 20 }, gain: { '2.4': 3, '5': 4, '6': 4 } },
  outdoor: { tx: { '2.4': 24, '5': 25, '6': 23 }, gain: { '2.4': 5, '5': 6, '6': 6 } },
  router: { tx: { '2.4': 22, '5': 23, '6': 22 }, gain: { '2.4': 4, '5': 5, '6': 5 } },
  mesh: { tx: { '2.4': 21, '5': 22, '6': 21 }, gain: { '2.4': 3, '5': 4, '6': 4 } },
};

const MOUNT = { ap: 'ceiling', wallplate: 'wall', outdoor: 'outdoor', router: 'desk', mesh: 'desk' };
export const KIND_LABEL = { ap: 'Indoor AP', wallplate: 'Wall plate', outdoor: 'Outdoor AP', router: 'Router', mesh: 'Mesh / home' };
export const MOUNT_HEIGHT_M = { ceiling: 2.7, wall: 1.2, desk: 1.0, outdoor: 4.0 };

function maxWidthFor(gen, band) {
  if (band === '2.4') return gen >= 6 ? 40 : 40;
  if (band === '5') return gen >= 6 ? 160 : gen === 5 ? 80 : 40;
  return gen >= 7 ? 320 : 160;
}

function typicalPoe(kind, gen, maxNss, bands) {
  if (kind === 'router' || kind === 'mesh') return null;
  if (gen >= 7) return bands >= 3 ? (maxNss >= 4 ? 30 : 22) : 15;
  if (gen === 6 && bands >= 3) return maxNss >= 4 ? 30 : 21;
  if (gen === 6) return maxNss >= 4 ? 25 : 14;
  return maxNss >= 4 ? 20 : 10;
}

export function slug(...parts) {
  return parts.join('-').toLowerCase().replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function build(row) {
  const [vendor, family, model, kind, gen, radiosSpec, mount] = row;
  const id = slug(vendor, model);
  const t = TYPICAL[kind] || TYPICAL.ap;
  const radios = {};
  let maxNss = 1;
  for (const part of radiosSpec.split(',')) {
    const [band, ss] = part.split(':');
    const nss = Number(ss);
    maxNss = Math.max(maxNss, nss);
    radios[band] = { nss, txMax: t.tx[band], gain: t.gain[band], maxWidth: maxWidthFor(gen, band) };
  }
  const device = {
    id, vendor, family, model, kind, gen,
    mount: mount || MOUNT[kind] || 'ceiling',
    radios,
    antenna: { pattern: 'omni' },
    poeW: typicalPoe(kind, gen, maxNss, Object.keys(radios).length),
    status: 'typical',
    source: '',
    checked: '',
    notes: '',
  };
  const v = VERIFIED[id];
  if (v) {
    for (const [band, r] of Object.entries(v.radios || {})) {
      if (r === null) { delete device.radios[band]; continue; }
      device.radios[band] = { nss: 2, txMax: t.tx[band], gain: t.gain[band], maxWidth: maxWidthFor(gen, band), ...(device.radios[band] || {}), ...r };
    }
    if (v.gen) device.gen = v.gen;
    if (v.poeW !== undefined) device.poeW = v.poeW;
    if (v.antenna) device.antenna = v.antenna;
    device.status = 'datasheet';
    device.source = v.source;
    device.checked = v.checked;
    device.verifiedFields = v.fields || [];
    device.notes = v.notes || '';
  }
  return device;
}

export const DEVICES = CATALOG.map(build);

export const VENDORS = [...new Set(DEVICES.map((d) => d.vendor))].sort((a, b) => a.localeCompare(b));

export function devicesIndex(customDevices = []) {
  const m = new Map(DEVICES.map((d) => [d.id, d]));
  for (const c of customDevices) m.set(c.id, c);
  return m;
}

/** Find a library device by vendor and model text (used by v1 migration). */
export function findDeviceId(vendor, model) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const mv = norm(vendor), mm = norm(model);
  const hit = DEVICES.find((d) => norm(d.model) === mm && (norm(d.vendor).includes(mv) || mv.includes(norm(d.vendor).slice(0, 5))));
  return hit ? hit.id : null;
}

export function bandsOf(d) {
  return ['2.4', '5', '6'].filter((b) => d.radios[b]);
}

export function streamsLabel(d) {
  return bandsOf(d).map((b) => `${d.radios[b].nss}×${d.radios[b].nss}`).join(' · ');
}

/** 'datasheet' when the RF-relevant fields are all checked, 'partial', 'typical' or 'user'. */
export function specLevel(d) {
  if (d.status === 'user') return 'user';
  if (d.status !== 'datasheet') return 'typical';
  const f = d.verifiedFields || [];
  return ['bands', 'streams', 'txMax', 'gain'].every((k) => f.includes(k)) ? 'datasheet' : 'partial';
}

export const SPEC_LABEL = { datasheet: 'Datasheet', partial: 'Partly verified', typical: 'Typical / unverified', user: 'Custom' };
