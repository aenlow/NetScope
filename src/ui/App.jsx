import { useEffect } from 'preact/hooks';
import { store, useStore, subscribe, setUi, undo, redo, notify, toast, openDialog } from '../state/store.js';
import * as A from '../state/actions.js';
import { TopBar, Rail, StatusBar, Toasts } from './Shell.jsx';
import { LeftPanel } from './LeftPanel.jsx';
import { Inspector } from './Inspector.jsx';
import { Stage } from './Stage.jsx';
import { Dialogs } from './Dialogs.jsx';
import { Palette } from './Palette.jsx';
import { TOOLS, selectTool, runCommand } from './commands.js';
import { getViewport } from './viewportRef.js';
import { isTyping } from '../canvas/viewport.js';
import { autosave } from '../io/files.js';
import { BANDS } from '../core/bands.js';
import { VIEWS } from '../core/colors.js';

export function App() {
  useStore((s) => [s.ui.leftOpen, s.ui.rightOpen, s.project.floors.length]);
  useEffect(() => {
    const onKey = (e) => handleKey(e);
    window.addEventListener('keydown', onKey);
    const stopAutosave = startAutosave();
    const onBefore = (e) => {
      if (store.project.floors.length && !store.ui.autosaved) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBefore);
    if (window.innerWidth <= 1080) setUi({ leftOpen: false, rightOpen: false });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onBefore); stopAutosave(); };
  }, []);
  return (
    <div class="app" data-empty={String(!store.project.floors.length)} data-left={store.ui.leftOpen ? 'open' : 'closed'} data-right={store.ui.rightOpen ? 'open' : 'closed'}>
      <TopBar />
      <div class="body">
        <Rail />
        <LeftPanel />
        <Stage />
        <Inspector />
      </div>
      <StatusBar />
      <Dialogs />
      <Palette />
      <Toasts />
    </div>
  );
}

function startAutosave() {
  let timer = null;
  let last = -1;
  let failedOnce = false;
  let scheduled = -1;
  const unsub = subscribe(() => {
    // Only (re)schedule when the project itself changed; UI notifications
    // (hover, toasts, worker progress) must not keep postponing the save.
    if (store.version === last || store.version === scheduled) return;
    if (!store.project.floors.length) return;
    scheduled = store.version;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const v = store.version;
      try {
        await autosave(store.project);
        last = v;
        if (store.version === v) { store.ui.autosaved = true; notify(); }
      } catch (err) {
        scheduled = -1;
        if (!failedOnce) { failedOnce = true; toast('Could not save in this browser (storage full or disabled). Download the project file to keep your work.', 'warn', 9000); }
      }
    }, 1200);
  });
  return () => { clearTimeout(timer); unsub(); };
}

function handleKey(e) {
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (store.ui.palette) return;
  if (mod && k === 'k') { e.preventDefault(); setUi({ palette: true }); return; }
  if (mod && k === 's') { e.preventDefault(); runCommand('file.save'); return; }
  if (store.ui.dialog) return;
  const typing = isTyping(e);
  if (typing) return;
  const vp = getViewport();
  if (vp?.handleKey(e)) { e.preventDefault(); return; }
  if (!store.project.floors.length && !(mod && k === 'o')) return;

  if (mod) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() || toast('Nothing to undo', 'info', 1500); return; }
    if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() || toast('Nothing to redo', 'info', 1500); return; }
    if (k === 'o') { e.preventDefault(); runCommand('file.open'); return; }
    if (k === 'e') { e.preventDefault(); runCommand('file.export'); return; }
    if (k === 'd') { e.preventDefault(); A.duplicateSelection(); return; }
    if (k === 'a') { e.preventDefault(); A.selectAll('ap'); return; }
    if (k === ',') { e.preventDefault(); openDialog('settings'); return; }
    if (e.key === '[') { e.preventDefault(); setUi({ leftOpen: !store.ui.leftOpen }); return; }
    if (e.key === ']') { e.preventDefault(); setUi({ rightOpen: !store.ui.rightOpen }); return; }
    return;
  }
  if (e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (store.ui.selection) { e.preventDefault(); A.deleteSelection(); }
    return;
  }
  if (e.key === 'Escape') {
    if (store.ui.selection) setUi({ selection: null });
    else if (store.ui.tool !== 'select') selectTool('select');
    return;
  }
  if (e.key.startsWith('Arrow') && store.ui.selection) {
    e.preventDefault();
    const z = vp?.view().zoom || 1;
    const step = (e.shiftKey ? 10 : 1) / z;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    A.nudgeSelection(dx, dy);
    return;
  }
  if (e.shiftKey && k === 'h') { setUi({ layers: { ...store.ui.layers, heatmap: !store.ui.layers.heatmap } }); return; }
  if (e.key === '?') { openDialog('shortcuts'); return; }
  if (e.shiftKey) return;
  const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
  if (tool) { e.preventDefault(); selectTool(tool.id); return; }
  const views = Object.keys(VIEWS);
  if (/^[1-5]$/.test(e.key)) { setUi({ view: views[Number(e.key) - 1] }); return; }
  if (k === 'b') { setUi({ band: BANDS[(BANDS.indexOf(store.ui.band) + 1) % BANDS.length] }); return; }
  if (k === 'f') { vp?.fit(); return; }
  if (k === 'g') { setUi({ layers: { ...store.ui.layers, grid: !store.ui.layers.grid } }); return; }
  if (e.key === '+' || e.key === '=') { vp?.zoomAt(1.25); return; }
  if (e.key === '-' || e.key === '_') { vp?.zoomAt(0.8); }
}
