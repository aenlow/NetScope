import { useState } from 'preact/hooks';
import { store, useStore, closeDialog, openDialog, setUi, toast, commit } from '../state/store.js';
import * as A from '../state/actions.js';
import { Dialog } from './Dialog.jsx';
import { DevicePicker, CustomDeviceDialog } from './DevicePicker.jsx';
import { NumField, TextField, SelectField, Check, Seg } from './controls.jsx';
import { lenIn, lenOut, lenLabel, fmtLen, fmtArea } from '../core/units.js';
import { BANDS, BAND_LABEL, REGIONS, WIDTHS } from '../core/bands.js';
import { TARGET_PRESETS } from '../core/schema.js';
import { DEFAULT_MCS_SNR, MCS_NAMES, FSPL_CONST_FT_MHZ } from '../core/rf.js';
import { DEVICES } from '../data/devices.js';
import { Icon } from './icons.jsx';
import { commandList, MOD } from './commands.js';
import { getViewport } from './viewportRef.js';
import { ExportDialog } from './ExportDialog.jsx';
import { TraceDialog } from './TraceDialog.jsx';
import { importPlanInteractive, confirmDialog } from './io.js';
import { uid } from '../core/ids.js';
import { parseLength } from '../core/trace.js';
import { run } from '../engine/rfClient.js';

export function Dialogs() {
  const d = useStore((s) => s.ui.dialog);
  if (!d) return null;
  const P = d.props || {};
  switch (d.name) {
    case 'devices': return <DevicePicker {...P} />;
    case 'customdevice': return <CustomDeviceDialog {...P} />;
    case 'confirm': return <Confirm {...P} />;
    case 'warnings': return <Warnings {...P} />;
    case 'pdfpage': return <PdfPage {...P} />;
    case 'scale': return <ScaleDialog {...P} />;
    case 'trace': return <TraceDialog {...P} />;
    case 'blankfloor': return <BlankFloor {...P} />;
    case 'addfloor': return <AddFloor />;
    case 'floor': return <FloorDialog />;
    case 'autoplace': return <AutoPlace />;
    case 'channels': return <Channels />;
    case 'clients': return <Clients />;
    case 'versions': return <Versions />;
    case 'shortcuts': return <Shortcuts />;
    case 'model': return <Model />;
    case 'settings': return <Settings {...P} />;
    case 'export': return <ExportDialog {...P} />;
    default: return null;
  }
}

function Confirm({ title, body, confirm, cancel, danger, resolve }) {
  return (
    <Dialog title={title} onClose={() => resolve(false)} initialFocus=".dialog footer .primary, .dialog footer .danger"
      footer={<><button class="btn" onClick={() => resolve(false)}>{cancel || 'Cancel'}</button><button class={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => resolve(true)}>{confirm}</button></>}>
      <div class="content"><p style={{ margin: 0, lineHeight: 1.5 }}>{body}</p></div>
    </Dialog>
  );
}

function Warnings({ title, warnings }) {
  return (
    <Dialog title={title} footer={<button class="btn primary" onClick={closeDialog}>OK</button>}>
      <div class="content">
        <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5 }}>{warnings.map((w) => <li>{w}</li>)}</ul>
      </div>
    </Dialog>
  );
}

function PdfPage({ count, resolve }) {
  const [n, setN] = useState(1);
  return (
    <Dialog title="Choose a page" onClose={() => resolve(0)} footer={<><button class="btn" onClick={() => resolve(0)}>Cancel</button><button class="btn primary" onClick={() => resolve(n)}>Import page {n}</button></>}>
      <div class="content">
        <p style={{ marginTop: 0 }} class="dim">This PDF has {count} pages. Which one is the floor plan?</p>
        <NumField label="Page" value={n} min={1} max={count} digits={0} onCommit={(v) => setN(Math.round(v))} />
      </div>
    </Dialog>
  );
}

function ScaleDialog({ pixels, floorIndex }) {
  const units = store.project.settings.units;
  const [len, setLen] = useState('');
  const [unit, setUnit] = useState(units);
  const others = store.project.floors.map((f, i) => (i !== floorIndex && !f.scale ? i : -1)).filter((i) => i >= 0);
  const [all, setAll] = useState(true);
  // Accepts plain numbers in the chosen unit, or 12'6", 12 ft 6 in, 3.8 m.
  const meters = parseLength(len, unit);
  const valid = Number.isFinite(meters) && meters > 0;
  const apply = () => {
    if (!valid) return;
    A.setScale(floorIndex, pixels, meters);
    if (all) for (const i of others) A.setScale(i, pixels, meters);
    closeDialog();
    setUi({ tool: 'select' });
    const f = store.project.floors[floorIndex];
    toast(`Scale set: the plan is ${fmtLen(f.width * f.scale, units)} × ${fmtLen(f.height * f.scale, units)}. Next, trace walls or place access points.`, 'ok', 6000);
  };
  return (
    <Dialog title="Set scale" initialFocus="#scale-len"
      footer={<><button class="btn" onClick={closeDialog}>Cancel</button><button class="btn primary" disabled={!valid} onClick={apply}>Apply scale</button></>}>
      <div class="content">
        <p class="dim" style={{ marginTop: 0 }}>The line you drew is <span class="mono" style={{ color: 'var(--text)' }}>{pixels.toFixed(1)} px</span> long. How long is it in reality?</p>
        <div class="grid2">
          <label class="field" for="scale-len"><span>Real length</span>
            <input id="scale-len" class="input mono" autoComplete="off" value={len} onInput={(e) => setLen(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder={unit === 'ft' ? 'e.g. 30' : 'e.g. 9.1'} />
          </label>
          <SelectField label="Unit" value={unit} onChange={setUnit} options={[{ value: 'ft', label: 'feet' }, { value: 'in', label: 'inches' }, { value: 'm', label: 'meters' }]} />
        </div>
        {valid ? <p class="hint">That makes 1 px = {fmtLen(meters / pixels, units, 3)}.</p> : <p class="hint">Longer reference lines give a more accurate scale. Feet and inches like 12'6" work too.</p>}
        {others.length ? <Check label={`Use the same scale for the ${others.length} other floor${others.length === 1 ? '' : 's'} without one`} checked={all} onChange={setAll} hint="Right when the floors come from the same drawing or sheet." /> : null}
      </div>
    </Dialog>
  );
}

function BlankFloor({ first }) {
  const units = store.project.settings.units;
  const [w, setW] = useState(units === 'ft' ? 120 : 36);
  const [h, setH] = useState(units === 'ft' ? 80 : 24);
  const apply = () => {
    A.addBlankFloor(lenIn(w, units), lenIn(h, units));
    if (first) setUi({ started: true, tool: 'wall' });
    closeDialog();
    requestAnimationFrame(() => getViewport()?.fit());
    toast('Blank floor added with its scale set. Draw walls with W or rooms with R.', 'ok');
  };
  return (
    <Dialog title="Blank floor" footer={<><button class="btn" onClick={closeDialog}>Cancel</button><button class="btn primary" onClick={apply}>Create floor</button></>}>
      <div class="content">
        <p class="dim" style={{ marginTop: 0 }}>A blank canvas of known size, with the scale already set.</p>
        <div class="grid2">
          <NumField label="Width" unit={lenLabel(units)} value={w} min={1} max={lenOut(2000, units)} onCommit={setW} />
          <NumField label="Depth" unit={lenLabel(units)} value={h} min={1} max={lenOut(2000, units)} onCommit={setH} />
        </div>
        <div style={{ marginTop: '10px' }}>
          <Seg label="Units" value={units} onChange={(u) => { A.setSettings((s) => { s.units = u; }); setW(Math.round(lenOut(lenIn(w, units), u))); setH(Math.round(lenOut(lenIn(h, units), u))); }} options={[{ value: 'ft', label: 'Feet' }, { value: 'm', label: 'Meters' }]} />
        </div>
      </div>
    </Dialog>
  );
}

function AddFloor() {
  return (
    <Dialog title="Add a floor" footer={<button class="btn" onClick={closeDialog}>Cancel</button>}>
      <div class="content" style={{ display: 'grid', gap: '10px' }}>
        <button class="start primary" onClick={() => { closeDialog(); importPlanInteractive({ newFloor: true }); }}>
          <span class="t">Import a floor plan</span><span class="d">Image or PDF for the new floor.</span>
        </button>
        <button class="start" onClick={() => openDialog('blankfloor')}>
          <span class="t">Blank floor</span><span class="d">A canvas of known size.</span>
        </button>
        <button class="start" onClick={() => {
          const f = store.project.floors[store.ui.floorIndex];
          if (!f) return;
          commit((p) => {
            const copy = structuredClone(f);
            copy.id = uid('floor');
            copy.name = `Level ${p.floors.length + 1}`;
            copy.aps = [];
            copy.clients = [];
            copy.closets = [];
            copy.walls.forEach((w) => { w.id = uid('wall'); });
            copy.zones.forEach((z) => { z.id = uid('zone'); });
            p.floors.push(copy);
          });
          setUi({ floorIndex: store.project.floors.length - 1, selection: null });
          closeDialog();
          toast('Copied the plan, walls and rooms to a new floor. Access points were not copied.', 'ok');
        }}>
          <span class="t">Duplicate this floor's layout</span><span class="d">Same plan, walls and rooms; no access points. Useful for stacked identical floors.</span>
        </button>
      </div>
    </Dialog>
  );
}

function FloorDialog() {
  useStore((s) => s.version);
  const fi = store.ui.floorIndex;
  const f = store.project.floors[fi];
  if (!f) return null;
  const units = store.project.settings.units;
  const remove = async () => {
    if (await confirmDialog({ title: `Delete ${f.name}?`, body: `This removes the floor with its ${f.aps.length} access points and ${f.walls.length} walls. You can undo this.`, confirm: 'Delete floor', danger: true })) {
      A.removeFloor(fi);
    } else openDialog('floor');
  };
  return (
    <Dialog title="Floor settings" footer={<>
      <button class="btn danger left" onClick={remove}><Icon name="trash" size={14} />Delete floor</button>
      <button class="btn primary" onClick={closeDialog}>Done</button>
    </>}>
      <div class="content" style={{ display: 'grid', gap: '12px' }}>
        <TextField label="Name" value={f.name} maxLength={60} onCommit={(v) => A.updateFloor(fi, { name: v.trim() || f.name })} />
        <div class="grid2">
          <NumField label="Floor-to-floor height" unit={lenLabel(units)} value={lenOut(f.heightM, units)} min={lenOut(2, units)} max={lenOut(20, units)} onCommit={(v) => A.updateFloor(fi, { heightM: lenIn(v, units) })} />
          <div class="field"><span>Scale</span><div class="row" style={{ minHeight: '30px' }}><span class="mono">{f.scale ? `1 px = ${fmtLen(f.scale, units, 3)}` : 'not set'}</span><button class="btn small" onClick={() => { closeDialog(); setUi({ tool: 'scale' }); getViewport()?.resetTool(); }}>Reset</button></div></div>
        </div>
        <div>
          <div class="caps" style={{ marginBottom: '6px' }}>Alignment with other floors</div>
          <div class="grid2">
            <NumField label="Offset east" unit={lenLabel(units)} value={lenOut(f.offsetM.x, units)} onCommit={(v) => A.updateFloor(fi, { offsetM: { ...f.offsetM, x: lenIn(v, units) } })} />
            <NumField label="Offset south" unit={lenLabel(units)} value={lenOut(f.offsetM.y, units)} onCommit={(v) => A.updateFloor(fi, { offsetM: { ...f.offsetM, y: lenIn(v, units) } })} />
          </div>
          <p class="hint">Where this plan's top-left corner sits relative to the building origin. APs on the floors above and below show as dashed circles to help align. Signal through floors adds the slab loss per floor crossed ({BANDS.map((b) => `${store.project.slab.loss[b]} dB at ${b}`).join(', ')}, estimates).</p>
        </div>
        <div class="row" style={{ gap: '8px' }}>
          <button class="btn" disabled={fi === 0} onClick={() => A.moveFloor(fi, -1)}>Move down</button>
          <button class="btn" disabled={fi === store.project.floors.length - 1} onClick={() => A.moveFloor(fi, 1)}>Move up</button>
          <span class="hint">Floors are ordered bottom to top.</span>
        </div>
      </div>
    </Dialog>
  );
}

function AutoPlace() {
  const f = store.project.floors[store.ui.floorIndex];
  const firstAp = f?.aps[0];
  const [deviceId, setDeviceId] = useState(store.ui.deviceId || firstAp?.deviceId || 'ubiquiti-u7-pro');
  const [band, setBand] = useState('5');
  const [mode, setMode] = useState(f?.aps.length ? 'add' : 'replace');
  const [preset, setPreset] = useState('medium');
  const [picking, setPicking] = useState(false);
  const dev = A.devices().get(deviceId);
  const t = store.project.settings.target;
  const rooms = f?.zones.filter((z) => z.kind === 'room') || [];
  if (picking) return <DevicePicker mode="pick" onPick={(d) => { setDeviceId(d.id); setPicking(false); }} />;
  const go = async () => {
    closeDialog();
    const r = await A.autoPlaceAps({ deviceId, band, mode, preset });
    if (!r) return;
    toast(r.points.length ? `Placed ${r.points.length} access point${r.points.length === 1 ? '' : 's'}. Predicted ${r.primaryPct.toFixed(1)}% at ${t.primary} dBm on ${BAND_LABEL[band]}. Next: auto-plan channels.` : `The target is already met${mode === 'add' ? ' by the existing access points' : ''}.`, 'ok', 8000);
  };
  return (
    <Dialog title="Auto-place access points" size="mid" footer={<><button class="btn" onClick={closeDialog}>Cancel</button><button class="btn primary" disabled={!dev || !f?.scale} onClick={go}>Place access points</button></>}>
      <div class="content" style={{ display: 'grid', gap: '12px' }}>
        <p class="dim" style={{ margin: 0 }}>Proposes positions that meet your coverage target with as few access points as the model finds. Review and adjust them; walls, mounting and cabling constraints are yours to judge.</p>
        <div class="field"><span>Model</span>
          <button class="btn" style={{ justifyContent: 'space-between' }} onClick={() => setPicking(true)}>{dev ? `${dev.vendor} ${dev.model}` : 'Choose a model'}<Icon name="chevronRight" size={14} /></button>
        </div>
        <div class="grid3">
          <SelectField label="Plan for band" value={band} onChange={setBand} options={BANDS.filter((b) => dev?.radios[b]).map((b) => ({ value: b, label: BAND_LABEL[b] }))} />
          <SelectField label="Power" value={preset} onChange={setPreset} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'max', label: 'Device maximum' }]} />
          <SelectField label="Existing APs" value={mode} onChange={setMode} options={[{ value: 'add', label: 'Keep and add' }, { value: 'replace', label: 'Replace all' }]} />
        </div>
        <div class="floating" style={{ padding: '10px 12px', boxShadow: 'none' }}>
          <div class="kv"><span>Target</span><span>{t.primary} dBm{t.secondaryEnabled ? `, secondary ${t.secondary} dBm` : ''}</span></div>
          <div class="kv"><span>Coverage goal</span><span>{t.coverageGoal}% of {rooms.length ? `${rooms.length} rooms` : 'the whole plan'}</span></div>
          <div class="kv"><span>Expected devices</span><span>{rooms.reduce((s, z) => s + (z.devices || 0), 0)}</span></div>
          <button class="btn small quiet" style={{ marginTop: '6px' }} onClick={() => openDialog('settings', { tab: 'target' })}>Change target</button>
        </div>
        {!rooms.length ? <p class="hint warn" style={{ margin: 0 }}>No rooms are marked, so the whole plan counts, including outside the building. Mark rooms (or detect them from walls) for a better result.</p> : null}
        {!f?.walls.length ? <p class="hint warn" style={{ margin: 0 }}>No walls are drawn, so the result assumes open space.</p> : null}
        <p class="hint" style={{ margin: 0 }}>The count also covers capacity: at least one AP per {store.project.settings.capacity.devicesPerRadio * 2} expected devices. Signal uses free-space loss plus the walls and areas you have drawn{store.project.settings.pathLossExponent <= 2.05 ? ', so in large open spaces with clutter you have not drawn (shelving, furniture, people) the count can be optimistic. Raising the path-loss exponent in Settings → Propagation makes it more conservative.' : ` with a path-loss exponent of ${store.project.settings.pathLossExponent}.`}</p>
      </div>
    </Dialog>
  );
}

function Channels() {
  const s = store.project.settings;
  const [bands, setBands] = useState(['2.4', '5', '6']);
  const [widths, setWidths] = useState({ ...s.defaultWidth });
  const [dfs, setDfs] = useState(s.allowDfs);
  const [result, setResult] = useState(null);
  const n = store.project.floors.reduce((k, f) => k + f.aps.length, 0);
  const go = async () => {
    if (dfs !== s.allowDfs) A.setSettings((x) => { x.allowDfs = dfs; });
    const r = await A.autoPlanChannels({ bands, widths });
    setUi({ channelsPlanned: true });
    setResult(r);
  };
  return (
    <Dialog title="Auto-plan channels" size="mid" footer={result ? <button class="btn primary" onClick={closeDialog}>Done</button> : <><button class="btn" onClick={closeDialog}>Cancel</button><button class="btn primary" disabled={!bands.length || !n} onClick={go}>Plan channels</button></>}>
      <div class="content" style={{ display: 'grid', gap: '12px' }}>
        {result ? (
          <>
            <p style={{ margin: 0 }}>Updated {result.changed} radio setting{result.changed === 1 ? '' : 's'} across {n} access points.</p>
            {result.results.map((r) => (
              <div class="kv"><span>{BAND_LABEL[r.band]}</span><span>{r.assignments.length} radios · {r.conflicts.length ? `${r.conflicts.length} pair${r.conflicts.length === 1 ? '' : 's'} still share spectrum` : 'no co-channel pairs'}</span></div>
            ))}
            {result.conflicts ? <p class="hint warn" style={{ margin: 0 }}>Some radios that hear each other above {s.ccaDbm} dBm still overlap. Narrower channels, allowing DFS, lower power or turning off some 2.4 GHz radios will help. The Channel overlap view shows where.</p> : null}
            <p class="hint" style={{ margin: 0 }}>Undo restores the previous channels.</p>
          </>
        ) : (
          <>
            <p class="dim" style={{ margin: 0 }}>Assigns channels so radios that hear each other above {s.ccaDbm} dBm use separate spectrum, using the predicted AP-to-AP signal through walls and floors. 2.4 GHz uses only {s.region === 'EU' ? '1, 5, 9 and 13' : '1, 6 and 11'}; 6 GHz prefers preferred scanning channels (PSC).</p>
            <table class="t">
              <thead><tr><th>Band</th><th>Plan</th><th>Width (MHz)</th></tr></thead>
              <tbody>
                {BANDS.map((b) => (
                  <tr>
                    <td class="mono">{BAND_LABEL[b]}</td>
                    <td><input type="checkbox" checked={bands.includes(b)} onChange={(e) => setBands(e.currentTarget.checked ? [...bands, b] : bands.filter((x) => x !== b))} aria-label={`Plan ${BAND_LABEL[b]}`} style={{ accentColor: 'var(--accent)' }} /></td>
                    <td><select class="input mono" style={{ height: '28px', width: '96px' }} value={String(widths[b])} onChange={(e) => setWidths({ ...widths, [b]: Number(e.currentTarget.value) })}>{WIDTHS[b].map((w) => <option value={String(w)}>{w}</option>)}</select></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Check label="Allow DFS channels on 5 GHz" checked={dfs} onChange={setDfs} hint="Adds channels 52–144. APs must leave a channel when they detect radar, which briefly disconnects clients." />
            <p class="hint" style={{ margin: 0 }}>Region: {REGIONS[s.region].label}. Widths are capped by each device's maximum.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Clients() {
  const f = store.project.floors[store.ui.floorIndex];
  const expected = f?.zones.filter((z) => z.kind === 'room').reduce((s, z) => s + (z.devices || 0), 0) || 0;
  const [n, setN] = useState(expected || 50);
  return (
    <Dialog title="Simulate clients" footer={<>
      <button class="btn left" disabled={!f?.clients.length} onClick={() => { A.clearClients(); closeDialog(); }}>Clear {f?.clients.length || 0} clients</button>
      <button class="btn" onClick={closeDialog}>Cancel</button>
      <button class="btn primary" onClick={() => { const k = A.simulateClients(n); closeDialog(); toast(`Placed ${k} clients. Hover or select one to see its estimated link.`, 'ok'); }}>Place clients</button>
    </>}>
      <div class="content" style={{ display: 'grid', gap: '10px' }}>
        <p class="dim" style={{ margin: 0 }}>Scatters clients inside rooms (weighted by each room's expected devices) and joins each to the best AP it can hear. Useful for spotting overloaded APs.</p>
        <NumField label="Number of clients" value={n} min={1} max={5000} digits={0} onCommit={(v) => setN(Math.round(v))} hint={expected ? `${expected} devices expected in rooms on this floor.` : 'Set expected devices on rooms to weight placement.'} />
      </div>
    </Dialog>
  );
}

function Versions() {
  useStore((s) => s.version);
  const [name, setName] = useState('');
  const [cmp, setCmp] = useState({});
  const p = store.project;
  const devs = A.devices();
  const summarize = (floors) => {
    const aps = floors.reduce((k, f) => k + f.aps.length, 0);
    const models = new Map();
    for (const f of floors) for (const a of f.aps) { const m = devs.get(a.deviceId)?.model || 'Unknown'; models.set(m, (models.get(m) || 0) + 1); }
    const cost = floors.reduce((k, f) => k + f.aps.reduce((c, a) => c + (p.prices[a.deviceId] ?? NaN), 0), 0);
    return { aps, models: [...models.entries()].map(([m, q]) => `${q}× ${m}`).join(', '), cost };
  };
  const compare = async (v) => {
    setCmp({ ...cmp, [v.id]: 'running' });
    try {
      const r = await run('summary', { quality: 'low', project: { ...p, images: {}, versions: [], floors: v.floors } });
      const pct = r.floors.map((fl) => fl.bands['5']?.stats.primaryPct).filter((x) => x != null);
      setCmp((c) => ({ ...c, [v.id]: pct.length ? `${(pct.reduce((a, b) => a + b, 0) / pct.length).toFixed(1)}%` : '—' }));
    } catch { setCmp((c) => ({ ...c, [v.id]: 'failed' })); }
  };
  const cur = summarize(p.floors);
  const curPct = store.rf.summary?.map((fl) => fl.bands['5']?.stats.primaryPct).filter((x) => x != null) || [];
  return (
    <Dialog title="Design versions" size="mid" footer={<button class="btn primary" onClick={closeDialog}>Done</button>}>
      <div class="content" style={{ display: 'grid', gap: '12px' }}>
        <p class="dim" style={{ margin: 0 }}>Save snapshots of every floor's walls, rooms and access points to compare options, such as fewer high-power APs against more low-power ones.</p>
        <div class="row" style={{ gap: '8px' }}>
          <input class="input" placeholder={`Version ${p.versions.length + 1}`} value={name} onInput={(e) => setName(e.currentTarget.value)} aria-label="Version name" />
          <button class="btn primary" onClick={() => { A.saveVersion(name.trim()); setName(''); toast('Version saved.', 'ok', 2000); }}>Save current</button>
        </div>
        <table class="t">
          <thead><tr><th>Version</th><th class="num">APs</th><th class="num">Coverage 5 GHz</th><th class="num">Cost</th><th /></tr></thead>
          <tbody>
            <tr><td><b>Current design</b><div class="dimmer" style={{ fontSize: '11.5px' }}>{cur.models || 'No APs'}</div></td><td class="num">{cur.aps}</td><td class="num">{curPct.length ? `${(curPct.reduce((a, b) => a + b, 0) / curPct.length).toFixed(1)}%` : '—'}</td><td class="num">{Number.isFinite(cur.cost) ? cur.cost.toLocaleString() : '—'}</td><td /></tr>
            {p.versions.map((v) => {
              const s = summarize(v.floors);
              return (
                <tr>
                  <td>{v.name}<div class="dimmer" style={{ fontSize: '11.5px' }}>{new Date(v.createdAt).toLocaleString()} · {s.models || 'No APs'}</div></td>
                  <td class="num">{s.aps}</td>
                  <td class="num">{cmp[v.id] && cmp[v.id] !== 'running' ? cmp[v.id] : <button class="btn small" disabled={cmp[v.id] === 'running'} onClick={() => compare(v)}>{cmp[v.id] === 'running' ? 'Working…' : 'Compute'}</button>}</td>
                  <td class="num">{Number.isFinite(s.cost) ? s.cost.toLocaleString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button class="btn small" onClick={() => { A.restoreVersion(v.id); toast(`Restored ${v.name}. Undo to go back.`, 'ok'); }}>Restore</button>{' '}
                    <button class="btn small quiet" aria-label={`Delete ${v.name}`} onClick={() => A.deleteVersion(v.id)}><Icon name="trash" size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p class="hint" style={{ margin: 0 }}>Coverage is the average across floors of the share meeting {p.settings.target.primary} dBm on 5 GHz. Cost appears when unit prices are entered in Project settings, Prices.</p>
      </div>
    </Dialog>
  );
}

function Shortcuts() {
  const groups = new Map();
  for (const c of commandList()) {
    if (!c.keys) continue;
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push(c);
  }
  const extra = [
    ['Space + drag, middle-drag, right-drag', 'Pan'], ['Scroll or pinch', 'Zoom at the pointer'], ['Shift while drawing', 'Lock to 45°'],
    ['Enter / double-click', 'Finish a wall or area'], ['Backspace while drawing', 'Remove the last point'], ['Esc', 'Cancel the current action'],
    ['Arrow keys', 'Nudge the selection (Shift for 10×)'], ['Shift-click', 'Add to selection'],
  ];
  return (
    <Dialog title="Keyboard shortcuts" size="mid" footer={<button class="btn primary" onClick={closeDialog}>Done</button>}>
      <div class="content" style={{ columns: '2 280px', columnGap: '28px' }}>
        {[...groups.entries()].map(([g, cs]) => (
          <div style={{ breakInside: 'avoid', marginBottom: '14px' }}>
            <div class="caps" style={{ marginBottom: '6px' }}>{g}</div>
            {cs.map((c) => <div class="kv"><span>{c.label}</span><span><kbd>{c.keys}</kbd></span></div>)}
          </div>
        ))}
        <div style={{ breakInside: 'avoid' }}>
          <div class="caps" style={{ marginBottom: '6px' }}>Canvas</div>
          {extra.map(([k, l]) => <div class="kv"><span>{l}</span><span><kbd>{k}</kbd></span></div>)}
        </div>
      </div>
    </Dialog>
  );
}

function Model() {
  const s = store.project.settings;
  return (
    <Dialog title="How predictions are calculated" size="mid" footer={<button class="btn primary" onClick={closeDialog}>Close</button>}>
      <div class="content" style={{ lineHeight: 1.55 }}>
        <p style={{ marginTop: 0 }}>For every access point radio and every point on the floor, NetScope estimates received signal as:</p>
        <pre class="mono floating" style={{ padding: '10px 12px', boxShadow: 'none', whiteSpace: 'pre-wrap', fontSize: '12px' }}>RSSI (dBm) = Tx power (dBm) + antenna gain (dBi) + client gain (dBi)
            − path loss (dB) − walls crossed (dB) − zones (dB/m × m) − floor slabs (dB)</pre>
        <p><b>Path loss</b> is free-space loss over the 3-D distance between the AP (at its mount height) and a client at {s.clientHeightM} m: FSPL = 20·log10(d m) + 20·log10(f MHz) − 27.55. In feet the constant is {FSPL_CONST_FT_MHZ.toFixed(2)}. Beyond 1 m an optional path-loss exponent (now {s.pathLossExponent}) models clutter you have not drawn; 2.0 is free space.</p>
        <p><b>Walls</b> add their material loss for the selected band once per crossing. Loss values are estimates, several from NIST IR 6055, and are editable.</p>
        <p><b>Directional antennas</b> lose 12·(θ/beamwidth)² dB off boresight, down to the front-to-back ratio.</p>
        <p><b>SNR</b> is RSSI minus a thermal noise floor (−174 dBm/Hz + 10·log10(bandwidth) + {s.noiseFigure} dB noise figure), unless you set a measured noise floor.</p>
        <p><b>Data rate</b> picks the highest MCS whose SNR threshold is met (editable table), computes the PHY rate from the 802.11 subcarrier count, modulation, coding rate and streams, and multiplies by an efficiency factor ({s.efficiency}). It assumes one client at a time unless clients are simulated.</p>
        <p><b>Channel overlap</b> counts radios whose channel overlaps the serving radio's channel and that are heard above {s.ccaDbm} dBm.</p>
        <p class="dim" style={{ marginBottom: 0 }}>Not modelled: reflections, diffraction, vertical antenna patterns, interference from non-Wi-Fi sources, client behaviour differences beyond the profile, and real construction variation. Treat results as planning estimates and confirm with an on-site survey.</p>
      </div>
    </Dialog>
  );
}

function Settings({ tab: initial = 'general' }) {
  useStore((s) => s.version);
  const [tab, setTab] = useState(initial);
  const p = store.project;
  const s = p.settings;
  const set = (fn) => A.setSettings(fn);
  const tabs = [['general', 'General'], ['target', 'Coverage target'], ['model', 'Propagation'], ['client', 'Clients and rates'], ['capacity', 'Capacity and cabling'], ['materials', 'Materials'], ['prices', 'Prices']];
  return (
    <Dialog title="Project settings" size="wide" footer={<><span class="left hint">Changes apply immediately and can be undone.</span><button class="btn primary" onClick={closeDialog}>Done</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0,1fr)', minHeight: 0, flex: 1 }}>
        <div role="tablist" aria-orientation="vertical" style={{ borderRight: '1px solid var(--line)', padding: '8px 0' }}>
          {tabs.map(([k, l]) => (
            <button role="tab" aria-selected={String(tab === k)} class="aplist-item" style={{ display: 'flex', width: '100%', border: 0, background: tab === k ? '#24211d' : 'transparent', borderLeft: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`, color: 'var(--text)', textAlign: 'left' }} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div class="content" role="tabpanel" style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
          {tab === 'general' ? (
            <>
              <TextField label="Project name" value={p.name} onCommit={(v) => A.setProjectName(v)} />
              <div class="grid2">
                <SelectField label="Units" value={s.units} onChange={(v) => set((x) => { x.units = v; })} options={[{ value: 'ft', label: 'Feet' }, { value: 'm', label: 'Meters' }]} />
                <SelectField label="Regulatory region" value={s.region} onChange={(v) => set((x) => { x.region = v; })} options={Object.entries(REGIONS).map(([k, r]) => ({ value: k, label: r.label }))} hint="Controls which channels are offered and the indicative EIRP warnings." />
              </div>
              <Check label="Allow DFS channels on 5 GHz" checked={s.allowDfs} onChange={(v) => set((x) => { x.allowDfs = v; })} hint="Used by auto-planning and new APs. DFS channels can be vacated when radar is detected." />
            </>
          ) : null}
          {tab === 'target' ? (
            <>
              <SelectField label="Preset" value={s.target.preset} onChange={(v) => A.applyTargetPreset(v)} options={Object.entries(TARGET_PRESETS).map(([k, v]) => ({ value: k, label: k === 'custom' ? 'Custom' : `${v.label}: ${v.primary} dBm${v.secondaryEnabled ? `, secondary ${v.secondary} dBm` : ''}` }))} />
              <div class="grid3">
                <NumField label="Primary signal" unit="dBm" value={s.target.primary} min={-95} max={-30} digits={0} onCommit={(v) => set((x) => { x.target.primary = v; x.target.preset = 'custom'; })} />
                <NumField label="Secondary signal" unit="dBm" value={s.target.secondary} min={-95} max={-30} digits={0} onCommit={(v) => set((x) => { x.target.secondary = v; x.target.preset = 'custom'; })} />
                <NumField label="Coverage goal" unit="% of area" value={s.target.coverageGoal} min={50} max={100} digits={1} onCommit={(v) => set((x) => { x.target.coverageGoal = v; })} />
              </div>
              <Check label="Require secondary coverage" checked={s.target.secondaryEnabled} onChange={(v) => set((x) => { x.target.secondaryEnabled = v; x.target.preset = 'custom'; })} hint="The second-strongest AP must also meet the secondary level. Typical for voice and seamless roaming." />
              <p class="hint" style={{ margin: 0 }}>Coverage % counts the area inside rooms, or the whole plan if no rooms are marked, excluding marked areas.</p>
            </>
          ) : null}
          {tab === 'model' ? (
            <>
              <div class="grid3">
                <NumField label="Path-loss exponent" value={s.pathLossExponent} min={1.6} max={5} digits={2} hint="2.0 is free space. Raise it to account for clutter you have not drawn." onCommit={(v) => set((x) => { x.pathLossExponent = v; })} />
                <NumField label="Client height" unit={lenLabel(s.units)} value={lenOut(s.clientHeightM, s.units)} min={0} max={lenOut(10, s.units)} onCommit={(v) => set((x) => { x.clientHeightM = lenIn(v, s.units); })} />
                <NumField label="Client antenna gain" unit="dBi" value={s.clientGainDbi} min={-15} max={10} digits={1} hint="Phones are often 0 to −3 dBi including body loss." onCommit={(v) => set((x) => { x.clientGainDbi = v; })} />
              </div>
              <div class="grid3">
                <NumField label="Receiver noise figure" unit="dB" value={s.noiseFigure} min={0} max={20} digits={1} onCommit={(v) => set((x) => { x.noiseFigure = v; })} />
                <NumField label="Measured noise floor" unit="dBm / 20 MHz" value={s.noiseOverride} min={-110} max={-60} digits={0} hint="Optional. Overrides the thermal estimate." onCommit={(v) => set((x) => { x.noiseOverride = v; })} />
                <NumField label="Clear-channel threshold" unit="dBm" value={s.ccaDbm} min={-95} max={-60} digits={0} hint="Radios heard above this share airtime." onCommit={(v) => set((x) => { x.ccaDbm = v; })} />
              </div>
              {s.noiseOverride != null ? <button class="btn small" style={{ justifySelf: 'start' }} onClick={() => set((x) => { x.noiseOverride = null; })}>Use thermal noise estimate</button> : null}
              <div>
                <div class="caps" style={{ marginBottom: '6px' }}>Floor slab loss (between floors)</div>
                <div class="grid3">
                  {BANDS.map((b) => <NumField label={BAND_LABEL[b]} unit="dB" value={p.slab.loss[b]} min={0} max={120} digits={1} onCommit={(v) => commit((pp) => { pp.slab.loss[b] = v; })} />)}
                </div>
                <p class="hint">{p.slab.note}</p>
              </div>
            </>
          ) : null}
          {tab === 'client' ? (
            <>
              <div class="grid3">
                <SelectField label="Client generation" value={String(s.client.gen)} onChange={(v) => set((x) => { x.client.gen = Number(v); })} options={[{ value: '7', label: 'Wi-Fi 7' }, { value: '6', label: 'Wi-Fi 6 / 6E' }, { value: '5', label: 'Wi-Fi 5' }, { value: '4', label: 'Wi-Fi 4' }]} />
                <SelectField label="Spatial streams" value={String(s.client.nss)} onChange={(v) => set((x) => { x.client.nss = Number(v); })} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}×${n}` }))} />
                <NumField label="MAC efficiency" value={s.efficiency} min={0.1} max={1} digits={2} hint="Application throughput as a share of PHY rate." onCommit={(v) => set((x) => { x.efficiency = v; })} />
              </div>
              <div class="grid3">
                {BANDS.map((b) => (
                  <div class="field"><span>{BAND_LABEL[b]}</span>
                    <label class="check"><input type="checkbox" checked={s.client.bands.includes(b)} onChange={(e) => set((x) => { x.client.bands = e.currentTarget.checked ? [...new Set([...x.client.bands, b])] : x.client.bands.filter((y) => y !== b); })} />Supported</label>
                    <select class="input mono" value={String(s.client.maxWidth[b])} onChange={(e) => set((x) => { x.client.maxWidth[b] = Number(e.currentTarget.value); })} aria-label={`Client max width ${BAND_LABEL[b]}`}>{WIDTHS[b].map((w) => <option value={String(w)}>{w} MHz max</option>)}</select>
                  </div>
                ))}
              </div>
              <div class="grid3">
                <NumField label="Internet download" unit="Mbps" value={s.internet.down} min={0} max={1e6} digits={0} onCommit={(v) => set((x) => { x.internet.down = v; })} />
                <NumField label="Internet upload" unit="Mbps" value={s.internet.up} min={0} max={1e6} digits={0} onCommit={(v) => set((x) => { x.internet.up = v; })} />
                <NumField label="Join threshold" unit="dBm" value={s.associateMinDbm} min={-95} max={-50} digits={0} hint="Clients do not join below this." onCommit={(v) => set((x) => { x.associateMinDbm = v; })} />
              </div>
              <details>
                <summary class="caps" style={{ cursor: 'pointer' }}>MCS SNR thresholds (typical, editable)</summary>
                <table class="t" style={{ marginTop: '8px' }}>
                  <thead><tr><th>MCS</th><th>Modulation</th><th class="num">Min SNR dB</th></tr></thead>
                  <tbody>{s.mcsSnr.map((v, i) => (
                    <tr><td class="mono">{i}</td><td>{MCS_NAMES[i]}</td><td class="num" style={{ width: '120px' }}><NumField ariaLabel={`MCS ${i} minimum SNR`} value={v} min={-5} max={60} digits={1} onCommit={(nv) => set((x) => { x.mcsSnr[i] = nv; })} /></td></tr>
                  ))}</tbody>
                </table>
                <button class="btn small" style={{ marginTop: '8px' }} onClick={() => set((x) => { x.mcsSnr = [...DEFAULT_MCS_SNR]; })}>Reset thresholds</button>
              </details>
            </>
          ) : null}
          {tab === 'capacity' ? (
            <>
              <div class="grid2">
                <NumField label="Active devices per radio" value={s.capacity.devicesPerRadio} min={1} max={500} digits={0} hint="Planning estimate. Depends heavily on applications; 20–40 is common for office data." onCommit={(v) => set((x) => { x.capacity.devicesPerRadio = Math.round(v); })} />
              </div>
              <div class="grid3">
                <NumField label="Vertical allowance" unit="m" value={s.cabling.verticalM} min={0} max={50} digits={1} hint="Drops and risers per run." onCommit={(v) => set((x) => { x.cabling.verticalM = v; })} />
                <NumField label="Slack" unit="%" value={s.cabling.slackPct} min={0} max={100} digits={0} onCommit={(v) => set((x) => { x.cabling.slackPct = v; })} />
                <NumField label="Warn above" unit="m" value={s.cabling.maxRunM} min={10} max={200} digits={0} hint="90 m permanent link for Ethernet." onCommit={(v) => set((x) => { x.cabling.maxRunM = v; })} />
              </div>
            </>
          ) : null}
          {tab === 'materials' ? <Materials /> : null}
          {tab === 'prices' ? <Prices /> : null}
        </div>
      </div>
    </Dialog>
  );
}

function Materials() {
  useStore((s) => s.version);
  const p = store.project;
  const setLoss = (id, b, v) => commit((pp) => { const m = pp.materials.find((x) => x.id === id); if (m) m.loss[b] = v; });
  const setZ = (id, b, v) => commit((pp) => { const m = pp.zoneMaterials.find((x) => x.id === id); if (m) m.lossPerM[b] = v; });
  const used = new Set(p.floors.flatMap((f) => f.walls.map((w) => w.materialId)));
  return (
    <>
      <p class="hint" style={{ margin: 0 }}>Loss per wall crossing, by band. Defaults are estimates; several follow NIST IR 6055 measurements. Real walls vary with thickness, moisture, reinforcement and coatings.</p>
      <table class="t">
        <thead><tr><th>Wall material</th>{BANDS.map((b) => <th class="num">{b} GHz dB</th>)}<th /></tr></thead>
        <tbody>
          {p.materials.map((m) => (
            <tr>
              <td><span style={{ display: 'inline-block', width: '14px', height: '3px', background: m.color, verticalAlign: 'middle', marginRight: '8px' }} />
                <input class="input" style={{ width: 'calc(100% - 26px)', height: '26px', display: 'inline-block' }} value={m.name} aria-label="Material name" onBlur={(e) => e.currentTarget.value !== m.name && commit((pp) => { pp.materials.find((x) => x.id === m.id).name = e.currentTarget.value.slice(0, 60) || m.name; })} />
              </td>
              {BANDS.map((b) => <td class="num" style={{ width: '96px' }}><NumField ariaLabel={`${m.name} ${b} GHz loss`} value={m.loss[b]} min={0} max={120} digits={1} onCommit={(v) => setLoss(m.id, b, v)} /></td>)}
              <td style={{ width: '36px' }}>{!used.has(m.id) ? <button class="btn icon quiet small" aria-label={`Delete ${m.name}`} onClick={() => commit((pp) => { pp.materials = pp.materials.filter((x) => x.id !== m.id); })}><Icon name="trash" size={14} /></button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button class="btn small" style={{ justifySelf: 'start' }} onClick={() => commit((pp) => { pp.materials.push({ id: uid('mat'), name: 'New material', loss: { '2.4': 5, '5': 7, '6': 8 }, color: '#B7AE9C', width: 3, note: 'User-defined.' }); })}><Icon name="plus" size={14} />Add material</button>
      <table class="t">
        <thead><tr><th>Zone contents</th>{BANDS.map((b) => <th class="num">{b} GHz dB/m</th>)}</tr></thead>
        <tbody>
          {p.zoneMaterials.map((m) => (
            <tr><td>{m.name}</td>{BANDS.map((b) => <td class="num" style={{ width: '96px' }}><NumField ariaLabel={`${m.name} ${b} GHz loss per meter`} value={m.lossPerM[b]} min={0} max={20} digits={2} onCommit={(v) => setZ(m.id, b, v)} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Prices() {
  useStore((s) => s.version);
  const p = store.project;
  const devs = A.devices();
  const ids = [...new Set(p.floors.flatMap((f) => f.aps.map((a) => a.deviceId)))];
  if (!ids.length) return <p class="hint">Place access points to enter unit prices for the bill of materials.</p>;
  return (
    <>
      <p class="hint" style={{ margin: 0 }}>Optional unit prices for the bill of materials, in your currency. NetScope does not include prices.</p>
      <table class="t">
        <thead><tr><th>Model</th><th class="num">Qty</th><th class="num">Unit price</th></tr></thead>
        <tbody>{ids.map((id) => {
          const d = devs.get(id);
          const qty = p.floors.reduce((k, f) => k + f.aps.filter((a) => a.deviceId === id).length, 0);
          return <tr><td>{d ? `${d.vendor} ${d.model}` : id}</td><td class="num">{qty}</td><td class="num" style={{ width: '140px' }}><NumField ariaLabel={`Unit price ${d?.model}`} value={p.prices[id] ?? null} min={0} max={1e7} digits={2} onCommit={(v) => commit((pp) => { pp.prices[id] = v; })} /></td></tr>;
        })}</tbody>
      </table>
    </>
  );
}

export { DEVICES, fmtArea, MOD };
