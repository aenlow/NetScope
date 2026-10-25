// Saving, opening and autosaving project files.

import { serializeProject, parseProjectText } from '../core/schema.js';
import { findDeviceId } from '../data/devices.js';

export function safeFileName(name, ext) {
  const base = String(name || 'netscope').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'netscope';
  return `${base}.${ext}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function projectBlob(project) {
  return new Blob([serializeProject(project)], { type: 'application/json' });
}

export function downloadProject(project) {
  downloadBlob(projectBlob(project), safeFileName(project.name, 'netscope.json'));
}

export async function readProjectFile(file) {
  if (file.size > 60 * 1024 * 1024) throw new Error('The file is larger than 60 MB.');
  const text = await file.text();
  return parseProjectText(text, findDeviceId);
}

/** Ask the browser for a file. Resolves with a File or null. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

// ------------------------------------------------------------ IndexedDB autosave

const DB = 'netscope';
const STORE = 'projects';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error('Storage aborted')); };
  });
}

export function autosave(project) {
  const json = serializeProject(project);
  return tx('readwrite', (s) => {
    s.put({ id: project.id, name: project.name, updatedAt: new Date().toISOString(), floors: project.floors.length, aps: project.floors.reduce((n, f) => n + f.aps.length, 0), json });
  });
}

export function listRecent() {
  return tx('readonly', (s) => new Promise((resolve) => {
    const req = s.getAll();
    req.onsuccess = () => resolve((req.result || []).map(({ json, ...meta }) => meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    req.onerror = () => resolve([]);
  })).catch(() => []);
}

export function loadRecent(id) {
  return tx('readonly', (s) => new Promise((resolve, reject) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) { reject(new Error('Not found')); return; }
      try { resolve(parseProjectText(req.result.json, findDeviceId)); } catch (e) { reject(e); }
    };
    req.onerror = () => reject(req.error);
  }));
}

export function deleteRecent(id) {
  return tx('readwrite', (s) => { s.delete(id); });
}
