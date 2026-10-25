// Commands shared by the command palette, keyboard shortcuts and menus.

import { store, setUi, setLayers, undo, redo, openDialog, toast, currentFloor, isDirty } from '../state/store.js';
import * as A from '../state/actions.js';
import { BANDS, BAND_LABEL } from '../core/bands.js';
import { VIEWS } from '../core/colors.js';
import { importPlanInteractive, openProjectInteractive, saveProjectFile, confirmDiscard } from './io.js';
import { EXAMPLES, loadExample } from '../examples/index.js';
import { getViewport } from './viewportRef.js';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = IS_MAC ? '⌘' : 'Ctrl';

export const TOOLS = [
  { id: 'select', label: 'Select', key: 'V', icon: 'select', hint: 'Click to select, drag to move. Shift-click adds to the selection; drag on empty space to box-select.' },
  { id: 'pan', label: 'Pan', key: 'H', icon: 'pan', hint: 'Drag to pan. You can also hold Space, or use two fingers on a trackpad.' },
  { id: 'scale', label: 'Set scale', key: 'S', icon: 'scale', hint: 'Click both ends of a known length, such as a dimension line or a door.' },
  { id: 'wall', label: 'Wall', key: 'W', icon: 'wall', hint: 'Click to add points. Double-click or Enter to finish, click the first point to close. Shift locks 45°.' },
  { id: 'rect', label: 'Room', key: 'R', icon: 'rect', hint: 'Drag a rectangle to draw four walls and a room area. Shift draws a square.' },
  { id: 'area', label: 'Area', key: 'Z', icon: 'area', hint: 'Outline a room, an excluded space or an attenuation zone. Enter to finish.' },
  { id: 'door', label: 'Door', key: 'D', icon: 'door', hint: 'Click on a wall to cut a 0.9 m door opening.' },
  { id: 'ap', label: 'Access point', key: 'A', icon: 'ap', hint: 'Click to place the chosen device. Press A again to pick a different model.' },
  { id: 'closet', label: 'Network closet', key: 'I', icon: 'closet', hint: 'Place an IDF to estimate cable runs, switch ports and PoE.' },
  { id: 'client', label: 'Client', key: 'C', icon: 'client', hint: 'Place a test client to see which AP it joins and its estimated rate.' },
  { id: 'measure', label: 'Measure', key: 'M', icon: 'measure', hint: 'Click two points to measure a distance.' },
  { id: 'probe', label: 'Signal probe', key: 'P', icon: 'probe', hint: 'Click a point to list every AP heard there.' },
];

export function selectTool(id) {
  if (id === 'ap' && store.ui.tool === 'ap') { openDialog('devices', { mode: 'place' }); return; }
  setUi({ tool: id, probe: id === 'probe' ? store.ui.probe : null });
  getViewport()?.resetTool();
  getViewport()?.updateCursor();
  if (id === 'ap' && !store.ui.deviceId) openDialog('devices', { mode: 'place' });
  const f = currentFloor();
  if ((id === 'measure' || id === 'wall' || id === 'rect') && f && !f.scale) toast('Tip: set the scale first so lengths and signal are correct.', 'info', 3500);
}

const has = () => !!currentFloor();

export function commandList() {
  const cmds = [];
  for (const t of TOOLS) cmds.push({ id: `tool.${t.id}`, group: 'Tools', label: t.label, keys: t.key, run: () => selectTool(t.id), when: has });
  const views = Object.entries(VIEWS);
  views.forEach(([k, v], i) => cmds.push({ id: `view.${k}`, group: 'View', label: `Show ${v.label === 'SNR' ? 'SNR' : v.label.toLowerCase()}`, keys: String(i + 1), run: () => setUi({ view: k }), when: has }));
  for (const b of BANDS) cmds.push({ id: `band.${b}`, group: 'View', label: `Band: ${BAND_LABEL[b]}`, run: () => setUi({ band: b }), when: has });
  cmds.push(
    { id: 'band.cycle', group: 'View', label: 'Next band', keys: 'B', run: () => setUi({ band: BANDS[(BANDS.indexOf(store.ui.band) + 1) % 3] }), when: has },
    { id: 'view.fit', group: 'View', label: 'Fit floor to window', keys: 'F', run: () => getViewport()?.fit(), when: has },
    { id: 'view.zoomin', group: 'View', label: 'Zoom in', keys: '+', run: () => getViewport()?.zoomAt(1.25), when: has },
    { id: 'view.zoomout', group: 'View', label: 'Zoom out', keys: '−', run: () => getViewport()?.zoomAt(0.8), when: has },
    { id: 'layer.heatmap', group: 'View', label: 'Toggle heatmap', keys: 'Shift H', run: () => setLayers({ heatmap: !store.ui.layers.heatmap }), when: has },
    { id: 'layer.grid', group: 'View', label: 'Toggle grid', keys: 'G', run: () => setLayers({ grid: !store.ui.layers.grid }), when: has },
    { id: 'layer.interference', group: 'View', label: 'Toggle interference lines', run: () => setLayers({ interference: !store.ui.layers.interference }), when: has },
    { id: 'layer.cables', group: 'View', label: 'Toggle cable runs', run: () => setLayers({ cables: !store.ui.layers.cables }), when: has },
    { id: 'panel.left', group: 'View', label: 'Toggle left panel', keys: `${MOD} [`, run: () => setUi({ leftOpen: !store.ui.leftOpen }) },
    { id: 'panel.right', group: 'View', label: 'Toggle inspector', keys: `${MOD} ]`, run: () => setUi({ rightOpen: !store.ui.rightOpen }) },

    { id: 'edit.undo', group: 'Edit', label: 'Undo', keys: `${MOD} Z`, run: () => undo() || toast('Nothing to undo', 'info', 1500) },
    { id: 'edit.redo', group: 'Edit', label: 'Redo', keys: IS_MAC ? '⇧⌘ Z' : 'Ctrl Y', run: () => redo() || toast('Nothing to redo', 'info', 1500) },
    { id: 'edit.delete', group: 'Edit', label: 'Delete selection', keys: 'Del', run: () => A.deleteSelection(), when: () => !!store.ui.selection },
    { id: 'edit.duplicate', group: 'Edit', label: 'Duplicate selected APs', keys: `${MOD} D`, run: () => A.duplicateSelection(), when: () => store.ui.selection?.kind === 'ap' },
    { id: 'edit.selectall', group: 'Edit', label: 'Select all access points', keys: `${MOD} A`, run: () => A.selectAll('ap'), when: has },

    { id: 'plan.autoplace', group: 'Plan', label: 'Auto-place access points…', run: () => openDialog('autoplace'), when: () => !!currentFloor()?.scale },
    { id: 'plan.channels', group: 'Plan', label: 'Auto-plan channels…', run: () => openDialog('channels'), when: () => store.project.floors.some((f) => f.aps.length) },
    { id: 'plan.trace', group: 'Plan', label: 'Trace walls from plan…', run: () => openDialog('trace', { floorIndex: store.ui.floorIndex }), when: () => !!currentFloor()?.imageId },
    { id: 'plan.rooms', group: 'Plan', label: 'Detect rooms from walls', run: () => A.detectRoomsOnFloor(), when: has },
    { id: 'plan.clients', group: 'Plan', label: 'Simulate clients…', run: () => openDialog('clients'), when: has },
    { id: 'plan.check', group: 'Plan', label: 'Open plan check', run: () => setUi({ leftTab: 'check', leftOpen: true }), when: has },
    { id: 'plan.versions', group: 'Plan', label: 'Design versions…', run: () => openDialog('versions') },
    { id: 'plan.devices', group: 'Plan', label: 'Device library…', run: () => openDialog('devices', { mode: store.ui.selection?.kind === 'ap' ? 'change' : 'browse' }) },

    { id: 'floor.import', group: 'Floors', label: 'Import floor plan (image or PDF)…', run: () => importPlanInteractive({ newFloor: true }) },
    { id: 'floor.replace', group: 'Floors', label: 'Replace this floor plan image…', run: () => importPlanInteractive({ newFloor: false }), when: has },
    { id: 'floor.blank', group: 'Floors', label: 'Add a blank floor…', run: () => openDialog('blankfloor') },
    { id: 'floor.settings', group: 'Floors', label: 'Floor settings…', run: () => openDialog('floor'), when: has },

    { id: 'file.new', group: 'Project', label: 'New project', run: async () => { if (await confirmDiscard()) A.startBlankProject(); } },
    { id: 'file.open', group: 'Project', label: 'Open project file…', keys: `${MOD} O`, run: () => openProjectInteractive() },
    { id: 'file.save', group: 'Project', label: 'Download project file', keys: `${MOD} S`, run: () => saveProjectFile() },
    { id: 'file.export', group: 'Project', label: 'Export report, image or CSV…', keys: `${MOD} E`, run: () => openDialog('export'), when: has },
    { id: 'file.settings', group: 'Project', label: 'Project settings…', keys: `${MOD} ,`, run: () => openDialog('settings') },
    { id: 'help.shortcuts', group: 'Help', label: 'Keyboard shortcuts', keys: '?', run: () => openDialog('shortcuts') },
    { id: 'help.model', group: 'Help', label: 'How predictions are calculated', run: () => openDialog('model') },
    { id: 'help.home', group: 'Help', label: 'Start screen and examples', run: async () => { if (await confirmDiscard()) { setUi({ started: false }); } } },
  );
  for (const ex of EXAMPLES) cmds.push({ id: `example.${ex.id}`, group: 'Examples', label: `Open example: ${ex.name}`, run: async () => { if (await confirmDiscard()) loadExample(ex.id); } });
  store.project.floors.forEach((f, i) => cmds.push({ id: `floor.go.${f.id}`, group: 'Floors', label: `Go to ${f.name}`, run: () => setUi({ floorIndex: i, selection: null }) }));
  return cmds;
}

export function runCommand(id) {
  const c = commandList().find((x) => x.id === id);
  if (c && (!c.when || c.when())) c.run();
}

export { isDirty };
