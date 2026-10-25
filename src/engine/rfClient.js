// Main-thread side of the RF worker. Keeps the visible heatmap and the plan
// summary current, and runs one-off jobs (auto-place, channel planning).

import { store, notify, subscribe } from '../state/store.js';
import { devicesIndex } from '../data/devices.js';

let worker = null;
let seq = 0;
const jobs = new Map();
let lastKey = '';
let lastSummaryKey = '';
let summaryTimer = null;
let computeTimer = null;

function lightProject() {
  const p = store.project;
  return { ...p, images: {}, versions: [] };
}

/** Devices referenced by the project's APs (sent to the worker). */
export function usedDevices(project = store.project) {
  const idx = devicesIndex(project.customDevices);
  const used = new Map();
  for (const f of project.floors) for (const ap of f.aps) {
    const d = idx.get(ap.deviceId);
    if (d) used.set(d.id, d);
  }
  return [...used.values()];
}

export function startRf() {
  if (worker) return;
  worker = new Worker(new URL('../worker/rf.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onMessage;
  worker.onerror = (e) => {
    console.warn('RF worker error', e.message);
    store.rf.pending = false;
    notify();
  };
  subscribe(schedule);
  schedule();
}

function onMessage(ev) {
  const m = ev.data;
  const job = jobs.get(m.id);
  if (m.type === 'progress') {
    if (job?.onProgress) job.onProgress(m.done / m.total);
    if (job?.kind === 'compute') { store.rf.progress = m.done / m.total; notify(); }
    return;
  }
  if (!job) return;
  if (m.type === 'superseded') { jobs.delete(m.id); return; }
  if (m.type === 'error') {
    jobs.delete(m.id);
    if (job.kind === 'compute') { store.rf.pending = false; store.rf.progress = null; notify(); }
    job.reject?.(new Error(m.message));
    return;
  }
  jobs.delete(m.id);
  if (job.kind === 'compute') {
    if (m.id !== job.latestRef.id) return;
    store.rf.result = m.empty ? null : m;
    store.rf.pending = false;
    store.rf.progress = null;
    notify();
    return;
  }
  job.resolve(m);
}

const computeRef = { id: 0 };

function schedule() {
  const ui = store.ui;
  const f = store.project.floors[ui.floorIndex];
  const key = `${store.version}|${ui.floorIndex}|${ui.band}|${ui.quality}|${f?.id}`;
  if (key !== lastKey) {
    lastKey = key;
    clearTimeout(computeTimer);
    computeTimer = setTimeout(requestCompute, 16);
  }
  const sKey = `${store.version}`;
  if (sKey !== lastSummaryKey) {
    lastSummaryKey = sKey;
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(requestSummary, 700);
  }
}

function requestCompute() {
  const ui = store.ui;
  const f = store.project.floors[ui.floorIndex];
  if (!f || !f.scale) {
    store.rf.result = null;
    store.rf.pending = false;
    notify();
    return;
  }
  const id = ++seq;
  computeRef.id = id;
  jobs.set(id, { kind: 'compute', latestRef: computeRef });
  store.rf.pending = true;
  worker.postMessage({ type: 'compute', id, project: lightProject(), floorIndex: ui.floorIndex, band: ui.band, quality: ui.quality, devices: usedDevices() });
}

function requestSummary() {
  if (!store.project.floors.some((f) => f.scale && f.aps.length)) {
    store.rf.summary = null;
    notify();
    return;
  }
  run('summary', { quality: 'low' }).then((m) => {
    store.rf.summary = m.floors;
    notify();
  }).catch(() => {});
}

/** Run a one-off worker job; resolves with the worker's reply. */
export function run(type, payload, onProgress) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    jobs.set(id, { kind: type, resolve, reject, onProgress });
    worker.postMessage({ type, id, project: lightProject(), devices: usedDevices(payload.project || store.project), ...payload });
  });
}

/** Force a full summary now (used by exports). */
export function summaryNow() {
  return run('summary', { quality: 'low' }).then((m) => m.floors);
}

/** Heatmap for any floor/band (used by exports), without touching the view. */
export function computeFor(floorIndex, band, quality = 'medium') {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const ref = { id };
    jobs.set(id, { kind: 'compute', latestRef: ref, resolveExport: true });
    // Reuse compute but route the answer to this promise.
    jobs.get(id).kind = 'export';
    jobs.get(id).resolve = resolve;
    jobs.get(id).reject = reject;
    worker.postMessage({ type: 'compute', channel: 'export', id, project: lightProject(), floorIndex, band, quality, devices: usedDevices() });
  });
}
