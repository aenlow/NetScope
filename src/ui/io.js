// Interactive file flows: importing plans, opening and saving projects.

import { store, setUi, openDialog, closeDialog, toast, isDirty, notify } from '../state/store.js';
import * as A from '../state/actions.js';
import { importPlanFile, PlanError } from '../io/plan.js';
import { pickFile, readProjectFile, downloadProject } from '../io/files.js';
import { getViewport } from './viewportRef.js';

/** Promise-based confirmation dialog. */
export function confirmDialog({ title, body, confirm = 'Continue', danger = false, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    openDialog('confirm', { title, body, confirm, cancel, danger, resolve: (v) => { closeDialog(); resolve(v); } });
  });
}

/** Ask before discarding unsaved work. Resolves true to continue. */
export async function confirmDiscard() {
  const hasContent = store.project.floors.length > 0;
  if (!hasContent || !isDirty()) return true;
  return confirmDialog({
    title: 'Leave this project?',
    body: 'Your changes are kept in this browser, but they are not in a downloaded project file yet. Download a copy first if you need one.',
    confirm: 'Leave project',
  });
}

function choosePdfPage(count) {
  return new Promise((resolve) => {
    openDialog('pdfpage', { count, resolve: (n) => { closeDialog(); resolve(n); } });
  });
}

export async function importPlanFrom(file, { newFloor = true } = {}) {
  setUi({ busy: { label: 'Importing floor plan', progress: null } });
  try {
    const res = await importPlanFile(file, choosePdfPage);
    if (!res) return;
    if (newFloor || !store.project.floors.length) {
      const index = A.addFloor({ name: store.project.floors.length ? res.name || undefined : 'Level 1', width: res.width, height: res.height });
      A.setFloorImage(index, res);
      if (!store.ui.started) setUi({ started: true });
      if (store.project.name === 'Untitled project' && res.name) A.setProjectName(res.name);
      requestAnimationFrame(() => getViewport()?.fit());
      if (res.downscaled) toast('Floor plan downscaled to 6000 px on the long side.', 'info');
      // Offer to trace walls (and set the scale) straight away.
      openDialog('trace', { floorIndex: index, auto: true, scaleHint: res.scaleHint || null });
    } else {
      A.setFloorImage(store.ui.floorIndex, res);
      requestAnimationFrame(() => getViewport()?.fit());
      toast('Floor plan image replaced.', 'ok');
    }
  } catch (err) {
    toast(err instanceof PlanError ? err.message : `Could not import the file: ${err.message || err}`, 'error', 7000);
  } finally {
    setUi({ busy: null });
  }
}

export async function importPlanInteractive(opts) {
  const file = await pickFile('image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,application/pdf,.pdf,.svg');
  if (file) await importPlanFrom(file, opts);
}

export async function openProjectFrom(file) {
  try {
    const { project, warnings } = await readProjectFile(file);
    A.replaceProject(project);
    requestAnimationFrame(() => getViewport()?.fit());
    toast(`Opened ${project.name}.`, 'ok');
    if (warnings.length) openDialog('warnings', { title: 'Opened with notes', warnings });
  } catch (err) {
    toast(`Could not open the project. ${err.message || err}`, 'error', 8000);
  }
}

export async function openProjectInteractive() {
  if (!(await confirmDiscard())) return;
  const file = await pickFile('.json,application/json');
  if (file) await openProjectFrom(file);
}

export function saveProjectFile() {
  try {
    downloadProject(store.project);
    store.ui.lastSavedVersion = store.version;
    notify();
    toast('Project file downloaded.', 'ok', 2500);
  } catch (err) {
    toast(`Could not save: ${err.message || err}`, 'error');
  }
}
