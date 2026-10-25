// Application store. The project document is mutated in place inside
// `commit()`, which records an undo snapshot first and bumps a version
// counter; components and the canvas re-render from that counter.

import { useEffect, useState, useRef } from 'preact/hooks';
import { newProject } from '../core/schema.js';

const listeners = new Set();
const HISTORY_MAX = 100;

export const store = {
  project: newProject('Untitled project'),
  version: 0, // bumps on any project change
  ui: {
    floorIndex: 0,
    tool: 'select',
    band: '5',
    view: 'signal',
    selection: null, // { kind: 'ap'|'wall'|'zone'|'closet'|'client', ids: [] }
    layers: { plan: true, walls: true, rooms: true, aps: true, heatmap: true, contour: true, clients: true, interference: false, closets: true, cables: false, clip: true, grid: false },
    heatmapOpacity: 0.78,
    planDim: 0.55,
    quality: 'medium',
    leftTab: 'layers',
    leftOpen: true,
    rightOpen: true,
    dialog: null, // { name, props }
    palette: false,
    toasts: [],
    deviceId: null, // device used by the AP tool
    wallMaterial: 'drywall',
    zoneKind: 'room',
    zoneMaterial: 'cubicles',
    snap: true,
    busy: null, // { label, progress }
    lastSavedVersion: 0,
    autosaved: true,
    started: false, // first-run screen dismissed
  },
  rf: { result: null, summary: null, pending: false, progress: null },
  history: { undo: [], redo: [] },
};

export function notify() {
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-render a component whenever the store changes (optionally filtered). */
export function useStore(select = (s) => s.version) {
  const [, force] = useState(0);
  const sel = useRef(select);
  sel.current = select;
  const last = useRef(select(store));
  useEffect(() => subscribe(() => {
    const next = sel.current(store);
    if (!shallowEqual(next, last.current)) { last.current = next; force((n) => n + 1); }
  }), []);
  last.current = select(store);
  return last.current;
}

function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

function snapshot() {
  const { images, ...rest } = store.project;
  return JSON.stringify(rest);
}

function restore(snap) {
  const images = store.project.images;
  store.project = { ...JSON.parse(snap), images };
}

/**
 * Mutate the project with an undo point. `fn(project)` edits in place.
 * Pass { history: false } for transient edits (dragging) and call
 * `commit(null, …)` once at the end with `before` from beginTransient().
 */
export function commit(fn, { history = true, before = null } = {}) {
  const snap = history ? before ?? snapshot() : null;
  if (fn) fn(store.project);
  if (history) {
    store.history.undo.push(snap);
    if (store.history.undo.length > HISTORY_MAX) store.history.undo.shift();
    store.history.redo.length = 0;
  }
  store.version++;
  store.ui.autosaved = false;
  clampUi();
  notify();
}

export function beginTransient() {
  return snapshot();
}

export function undo() {
  const snap = store.history.undo.pop();
  if (!snap) return false;
  store.history.redo.push(snapshot());
  restore(snap);
  store.version++;
  store.ui.autosaved = false;
  clampUi();
  validateSelection();
  notify();
  return true;
}

export function redo() {
  const snap = store.history.redo.pop();
  if (!snap) return false;
  store.history.undo.push(snapshot());
  restore(snap);
  store.version++;
  store.ui.autosaved = false;
  clampUi();
  validateSelection();
  notify();
  return true;
}

export function resetHistory() {
  store.history.undo.length = 0;
  store.history.redo.length = 0;
}

/** UI-only change (no undo, no autosave). */
export function setUi(patch) {
  Object.assign(store.ui, typeof patch === 'function' ? patch(store.ui) : patch);
  notify();
}

export function setLayers(patch) {
  store.ui.layers = { ...store.ui.layers, ...patch };
  notify();
}

function clampUi() {
  const n = store.project.floors.length;
  if (store.ui.floorIndex >= n) store.ui.floorIndex = Math.max(0, n - 1);
}

export function currentFloor() {
  return store.project.floors[store.ui.floorIndex] || null;
}

/** Drop selected ids that no longer exist after undo/redo or deletes. */
export function validateSelection() {
  const sel = store.ui.selection;
  const f = currentFloor();
  if (!sel || !f) { store.ui.selection = null; return; }
  const coll = { ap: f.aps, wall: f.walls, zone: f.zones, closet: f.closets, client: f.clients }[sel.kind] || [];
  const ids = sel.ids.filter((id) => coll.some((o) => o.id === id));
  store.ui.selection = ids.length ? { kind: sel.kind, ids } : null;
}

let toastId = 0;
export function toast(text, level = 'info', ms = 4200) {
  const id = ++toastId;
  store.ui.toasts = [...store.ui.toasts, { id, text, level }];
  notify();
  if (ms) setTimeout(() => dismissToast(id), ms);
  return id;
}

export function dismissToast(id) {
  store.ui.toasts = store.ui.toasts.filter((t) => t.id !== id);
  notify();
}

export function openDialog(name, props = {}) {
  store.ui.dialog = { name, props };
  store.ui.palette = false;
  // Earlier notices would sit on top of the dialog; new ones still show.
  store.ui.toasts = store.ui.toasts.filter((t) => t.level === 'error' || t.level === 'warn');
  notify();
}

export function closeDialog() {
  store.ui.dialog = null;
  notify();
}

export const isDirty = () => store.version !== store.ui.lastSavedVersion;
